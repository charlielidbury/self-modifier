/**
 * WebSocket RPC server.
 *
 * Starts a `ws` WebSocket server on port 3001. Each connection gets its own
 * SelfModifierBackendImpl instance and a Cap'n Web RPC session.
 *
 * Uses the RpcSession + RpcTransport API since Cap'n Web's built-in WebSocket
 * helpers target the browser WebSocket API, not the `ws` package.
 */

import { WebSocketServer, type WebSocket } from "ws";
import { RpcSession, type RpcTransport } from "capnweb";
import { SelfModifierBackendImpl } from "./backend";
import { startGitWatcher } from "../event-bus";

const RPC_PORT = 3001;

// Survive HMR — only one server per process.
const g = globalThis as typeof globalThis & { __rpcServer?: WebSocketServer };

/**
 * Adapt a `ws` WebSocket into a Cap'n Web RpcTransport.
 */
function wsToTransport(ws: WebSocket): RpcTransport {
  // Buffered incoming messages: receive() pulls from here.
  const incoming: string[] = [];
  let waiter: { resolve: (msg: string) => void; reject: (err: Error) => void } | null = null;
  let closed = false;
  let closeError: Error | null = null;

  ws.on("message", (data) => {
    const msg = typeof data === "string" ? data : data.toString("utf-8");
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.resolve(msg);
    } else {
      incoming.push(msg);
    }
  });

  const onClose = (err?: Error) => {
    if (closed) return;
    closed = true;
    closeError = err ?? new Error("WebSocket closed");
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(closeError);
    }
  };

  ws.on("close", () => onClose());
  ws.on("error", (err) => onClose(err instanceof Error ? err : new Error(String(err))));

  return {
    async send(message: string) {
      if (closed) throw closeError ?? new Error("WebSocket closed");
      return new Promise<void>((resolve, reject) => {
        ws.send(message, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },

    async receive(): Promise<string> {
      if (incoming.length > 0) return incoming.shift()!;
      if (closed) throw closeError ?? new Error("WebSocket closed");
      return new Promise<string>((resolve, reject) => {
        waiter = { resolve, reject };
      });
    },

    abort(reason: unknown) {
      try {
        ws.close(1011, reason instanceof Error ? reason.message : String(reason));
      } catch { /* already closed */ }
    },
  };
}

export function startRpcServer(): void {
  if (g.__rpcServer) {
    console.log("[rpc] Server already running on port", RPC_PORT);
    return;
  }

  // Ensure git watcher is running for push events.
  startGitWatcher();

  const wss = new WebSocketServer({ port: RPC_PORT, path: "/rpc" });
  g.__rpcServer = wss;

  wss.on("connection", (ws) => {
    const backend = new SelfModifierBackendImpl();
    const transport = wsToTransport(ws);
    // Start the RPC session — Cap'n Web handles the rest.
    new RpcSession(transport, backend);
  });

  wss.on("error", (err) => {
    // Port likely in use from a previous process — not fatal.
    console.error("[rpc] WebSocket server error:", err.message);
  });

  console.log(`[rpc] WebSocket server listening on ws://localhost:${RPC_PORT}/rpc`);
}
