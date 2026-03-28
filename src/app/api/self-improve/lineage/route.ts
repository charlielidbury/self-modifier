import { getFullLineage } from "@/lib/strategy-genes";

/** GET /api/self-improve/lineage — full phylogenetic tree of all genomes (living + dead) */
export async function GET() {
  const { nodes, maxGeneration, livingIds } = getFullLineage();

  // Serialize for JSON (Set → Array)
  return Response.json({
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
  });
}
