import { newHttpBatchRpcResponse } from "capnweb";
import { SelfModifierBackendImpl } from "@/lib/rpc/backend";

/**
 * HTTP batch fallback for Cap'n Web RPC.
 *
 * Handles request-response calls only (no callbacks/push). Used when
 * WebSocket isn't available or for one-off requests from server components.
 */
export async function POST(req: Request) {
  const response = await newHttpBatchRpcResponse(req, new SelfModifierBackendImpl());
  return response;
}
