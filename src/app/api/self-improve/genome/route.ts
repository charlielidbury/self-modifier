import { getGenePool, resetGenePool } from "@/lib/strategy-genes";
import { cachedJsonResponse, invalidateCache } from "@/lib/api-cache";

/** GET /api/self-improve/genome — get the current gene pool */
export async function GET(req: Request) {
  return cachedJsonResponse("self-improve:genome", 5_000, getGenePool, req);
}

/** POST /api/self-improve/genome — reset the gene pool */
export async function POST(req: Request) {
  const body = (await req.json()) as { reset?: boolean };
  invalidateCache("self-improve:genome", "self-improve:lineage");
  if (body.reset) {
    const pool = resetGenePool();
    return Response.json(pool);
  }
  return Response.json(getGenePool());
}
