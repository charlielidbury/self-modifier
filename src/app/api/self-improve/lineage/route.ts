import { getFullLineage } from "@/lib/strategy-genes";
import { cachedJsonResponse } from "@/lib/api-cache";

/** GET /api/self-improve/lineage — full phylogenetic tree of all genomes (living + dead) */
export async function GET(req: Request) {
  return cachedJsonResponse("self-improve:lineage", 10_000, () => {
    const { nodes, maxGeneration, livingIds } = getFullLineage();

    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        generation: n.generation,
        focus: n.focus,
        ambition: n.ambition,
        creativity: n.creativity,
        thoroughness: n.thoroughness,
        fitness: n.fitness,
        timesUsed: n.timesUsed,
        parentId: n.parentId,
        createdAt: n.createdAt,
        alive: n.alive,
        culledAtGeneration: n.culledAtGeneration,
        causeOfDeath: n.causeOfDeath,
        childIds: n.childIds,
      })),
      maxGeneration,
      livingIds: Array.from(livingIds),
    };
  }, req);
}
