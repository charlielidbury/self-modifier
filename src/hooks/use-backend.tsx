"use client";

/**
 * React hook + context for the Cap'n Web RPC backend.
 *
 * Singleton WebSocket connection per browser tab. Auto-reconnects on disconnect.
 * Components call `useBackend()` to get an `RpcStub<SelfModifierBackend>`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { newWebSocketRpcSession, type RpcStub } from "capnweb";
import type { SelfModifierBackend } from "@/lib/rpc/interface";

type BackendState = {
  stub: RpcStub<SelfModifierBackend> | null;
  connected: boolean;
};

const BackendContext = createContext<BackendState>({
  stub: null,
  connected: false,
});

const RPC_URL = "ws://localhost:3001/rpc";

// Module-level singleton so multiple provider mounts (HMR) don't create
// duplicate connections.
const g = globalThis as typeof globalThis & {
  __rpcStub?: RpcStub<SelfModifierBackend> | null;
  __rpcConnecting?: boolean;
};

function connect(): RpcStub<SelfModifierBackend> {
  const stub = newWebSocketRpcSession<SelfModifierBackend>(RPC_URL);
  g.__rpcStub = stub;
  return stub;
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendState>(() => ({
    stub: g.__rpcStub ?? null,
    connected: !!g.__rpcStub,
  }));

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    function doConnect() {
      if (!mountedRef.current) return;
      try {
        const stub = connect();
        setState({ stub, connected: true });

        // Listen for connection breakage via onRpcBroken
        stub.onRpcBroken(() => {
          g.__rpcStub = null;
          if (mountedRef.current) {
            setState({ stub: null, connected: false });
            // Reconnect with backoff
            scheduleReconnect();
          }
        });
      } catch {
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimerRef.current) return;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        doConnect();
      }, 2000);
    }

    // Only connect if we don't already have a stub
    if (!g.__rpcStub) {
      doConnect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  return (
    <BackendContext.Provider value={state}>{children}</BackendContext.Provider>
  );
}

/**
 * Returns the RPC stub for calling backend methods.
 * Throws if called outside a BackendProvider.
 * The stub may be null while connecting — check `connected` or handle errors.
 */
export function useBackend(): RpcStub<SelfModifierBackend> | null {
  return useContext(BackendContext).stub;
}

/**
 * Returns whether the RPC connection is active.
 */
export function useBackendConnected(): boolean {
  return useContext(BackendContext).connected;
}
