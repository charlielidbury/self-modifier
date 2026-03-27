import { getGenePool, resetGenePool } from "@/lib/strategy-genes";

/** GET /api/self-improve/genome — get the current gene pool */
export async function GET() {
  return Response.json(getGenePool());
}

/** POST /api/self-improve/genome — reset the gene pool */
export async function POST(req: Request) {
  const body = (await req.json()) as { reset?: boolean };
  if (body.reset) {
    const pool = resetGenePool();
    return Response.json(pool);
  }
  return Response.json(getGenePool());
}
