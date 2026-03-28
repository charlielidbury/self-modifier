/**
 * Strategy Genes — Darwinian evolution for the self-improve agent's behavior.
 *
 * Each "genome" is a set of strategy parameters that shape how the agent
 * approaches its next improvement. After each session, the genome's fitness
 * is updated based on the outcome. Over generations, successful strategies
 * survive and reproduce while failed ones are pruned.
 *
 * This is literally natural selection applied to AI agent behavior.
 */

import fs from "fs";
import path from "path";
import { invalidateCache } from "./api-cache";

// ── Gene definitions ──────────────────────────────────────────────────────────

export type FocusGene =
  | "visual-polish"
  | "code-quality"
  | "new-feature"
  | "ux-enhancement"
  | "meta-improvement"
  | "bug-fix"
  | "performance";

export const ALL_FOCUS_GENES: FocusGene[] = [
  "visual-polish",
  "code-quality",
  "new-feature",
  "ux-enhancement",
  "meta-improvement",
  "bug-fix",
  "performance",
];

export type Genome = {
  id: string;
  generation: number;
  /** What area to focus on */
  focus: FocusGene;
  /** 0–1: How ambitious the change should be (0 = tiny tweak, 1 = major overhaul) */
  ambition: number;
  /** 0–1: How creative/novel vs conservative (0 = safe refactor, 1 = wild invention) */
  creativity: number;
  /** 0–1: How thorough to be before committing (0 = fast & loose, 1 = meticulous) */
  thoroughness: number;
  /** Cumulative fitness score */
  fitness: number;
  /** Number of times this genome has been used */
  timesUsed: number;
  /** Parent genome ID (null for initial random genomes) */
  parentId: string | null;
  /** When this genome was created */
  createdAt: string;
};

/** A snapshot of the gene pool taken at each evolution step. */
export type EvolutionSnapshot = {
  generation: number;
  timestamp: string;
  avgFitness: number;
  bestFitness: number;
  worstFitness: number;
  /** Which focus strategy dominated this generation */
  dominantFocus: FocusGene;
  /** Focus distribution: how many genomes per focus */
  focusDistribution: Partial<Record<FocusGene, number>>;
  /** Population size */
  populationSize: number;
  /** How many genomes were eliminated this round */
  eliminated: number;
  /** IDs of genomes that survived */
  survivorIds: string[];
};

/** A genome that was eliminated during evolution — preserved for lineage tracking. */
export type GraveyardEntry = Genome & {
  /** Generation when this genome was culled */
  culledAtGeneration: number;
  /** Reason for elimination */
  causeOfDeath: "low-fitness" | "replaced";
};

export type GenePool = {
  genomes: Genome[];
  generationCount: number;
  /** ID of the genome currently in use (null if no run active) */
  activeGenomeId: string | null;
  /** Total sessions ever run */
  totalSessions: number;
  /** Historical snapshots from each evolution step */
  evolutionHistory: EvolutionSnapshot[];
  /** Graveyard of culled genomes — preserved for phylogenetic lineage tracking */
  graveyard: GraveyardEntry[];
};

// ── Persistence ───────────────────────────────────────────────────────────────

const GENE_POOL_FILE = path.resolve(process.cwd(), ".strategy-genes.json");
const POOL_SIZE = 12; // Population size
const MUTATION_RATE = 0.3; // Probability of mutating each continuous gene
const MUTATION_STRENGTH = 0.25; // Max magnitude of mutation

function readGenePool(): GenePool {
  try {
    const raw = fs.readFileSync(GENE_POOL_FILE, "utf-8");
    const data = JSON.parse(raw) as GenePool;
    if (data.genomes && Array.isArray(data.genomes)) {
      // Backwards compatibility
      if (!Array.isArray(data.evolutionHistory)) {
        data.evolutionHistory = [];
      }
      if (!Array.isArray(data.graveyard)) {
        data.graveyard = [];
      }
      return data;
    }
  } catch {
    // File doesn't exist or is malformed — seed a new pool
  }
  return seedPool();
}

function writeGenePool(pool: GenePool): void {
  fs.writeFileSync(GENE_POOL_FILE, JSON.stringify(pool, null, 2), "utf-8");
}

// ── Pool initialization ───────────────────────────────────────────────────────

function randomGene(): number {
  return Math.round(Math.random() * 100) / 100;
}

function randomGenome(generation: number): Genome {
  return {
    id: crypto.randomUUID(),
    generation,
    focus: ALL_FOCUS_GENES[Math.floor(Math.random() * ALL_FOCUS_GENES.length)],
    ambition: randomGene(),
    creativity: randomGene(),
    thoroughness: randomGene(),
    fitness: 0,
    timesUsed: 0,
    parentId: null,
    createdAt: new Date().toISOString(),
  };
}

function seedPool(): GenePool {
  const genomes: Genome[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    genomes.push(randomGenome(0));
  }
  const pool: GenePool = {
    genomes,
    generationCount: 0,
    activeGenomeId: null,
    totalSessions: 0,
    evolutionHistory: [],
    graveyard: [],
  };
  writeGenePool(pool);
  return pool;
}

// ── Selection ─────────────────────────────────────────────────────────────────

/**
 * Tournament selection: pick `k` random genomes, return the fittest.
 * Biases toward untested genomes so new mutations get a fair chance.
 */
function tournamentSelect(genomes: Genome[], k = 3): Genome {
  const candidates: Genome[] = [];
  for (let i = 0; i < k; i++) {
    candidates.push(genomes[Math.floor(Math.random() * genomes.length)]);
  }

  // Untested genomes get a bonus to ensure exploration
  const scored = candidates.map((g) => ({
    genome: g,
    score: g.timesUsed === 0 ? 1.0 : g.fitness / g.timesUsed,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored[0].genome;
}

/**
 * Select the genome for the next run. Uses tournament selection
 * weighted by fitness per use.
 */
export function selectGenome(): Genome {
  const pool = readGenePool();

  // If the pool is empty somehow, reseed
  if (pool.genomes.length === 0) {
    const fresh = seedPool();
    return fresh.genomes[0];
  }

  const selected = tournamentSelect(pool.genomes);
  pool.activeGenomeId = selected.id;
  writeGenePool(pool);
  return selected;
}

// ── Mutation & Reproduction ───────────────────────────────────────────────────

function clampGene(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

function mutateGenome(parent: Genome, generation: number): Genome {
  const child: Genome = {
    id: crypto.randomUUID(),
    generation,
    focus: parent.focus,
    ambition: parent.ambition,
    creativity: parent.creativity,
    thoroughness: parent.thoroughness,
    fitness: 0,
    timesUsed: 0,
    parentId: parent.id,
    createdAt: new Date().toISOString(),
  };

  // Mutate continuous genes
  if (Math.random() < MUTATION_RATE) {
    child.ambition = clampGene(
      child.ambition + (Math.random() * 2 - 1) * MUTATION_STRENGTH,
    );
  }
  if (Math.random() < MUTATION_RATE) {
    child.creativity = clampGene(
      child.creativity + (Math.random() * 2 - 1) * MUTATION_STRENGTH,
    );
  }
  if (Math.random() < MUTATION_RATE) {
    child.thoroughness = clampGene(
      child.thoroughness + (Math.random() * 2 - 1) * MUTATION_STRENGTH,
    );
  }

  // Occasionally mutate focus gene (lower rate)
  if (Math.random() < MUTATION_RATE * 0.5) {
    child.focus =
      ALL_FOCUS_GENES[Math.floor(Math.random() * ALL_FOCUS_GENES.length)];
  }

  return child;
}

/**
 * Crossover: blend two parent genomes.
 */
function crossover(a: Genome, b: Genome, generation: number): Genome {
  return {
    id: crypto.randomUUID(),
    generation,
    focus: Math.random() < 0.5 ? a.focus : b.focus,
    ambition: clampGene((a.ambition + b.ambition) / 2 + (Math.random() * 0.1 - 0.05)),
    creativity: clampGene((a.creativity + b.creativity) / 2 + (Math.random() * 0.1 - 0.05)),
    thoroughness: clampGene((a.thoroughness + b.thoroughness) / 2 + (Math.random() * 0.1 - 0.05)),
    fitness: 0,
    timesUsed: 0,
    parentId: a.id,
    createdAt: new Date().toISOString(),
  };
}

// ── Diff stats for richer fitness ─────────────────────────────────────────────

export type DiffStats = {
  filesChanged: number;
  insertions: number;
  deletions: number;
  /** Change in total source bytes (positive = codebase grew, negative = shrank) */
  codeMassDelta?: number;
  /** Total source bytes after the change */
  codeMassTotal?: number;
};

/**
 * Compute a fitness modifier from diff statistics.
 * Rewards well-scoped changes, penalises trivially small or dangerously large ones.
 *
 * Sweet spot: 10–200 net lines across 1–8 files → up to +0.5 bonus.
 * Trivial (<5 lines): small penalty (genome wasted a turn).
 * Huge (>400 lines): penalty (risky, harder to review).
 */
function diffFitnessModifier(stats: DiffStats): number {
  const net = stats.insertions + stats.deletions;

  // Scope score: bell-curve-ish around the sweet spot
  let scopeBonus: number;
  if (net < 5) {
    scopeBonus = -0.2; // trivially small
  } else if (net <= 200) {
    // Linear ramp from 0 at 5 lines to 0.5 at ~80 lines, then plateau
    scopeBonus = Math.min(0.5, (net - 5) / 150);
  } else if (net <= 400) {
    // Gentle decline
    scopeBonus = 0.5 - ((net - 200) / 200) * 0.5;
  } else {
    // Oversize — risky
    scopeBonus = -0.3;
  }

  // File count bonus: touching 1–5 files is ideal
  let fileBonus: number;
  if (stats.filesChanged <= 5) {
    fileBonus = 0.1;
  } else if (stats.filesChanged <= 10) {
    fileBonus = 0;
  } else {
    fileBonus = -0.15; // shotgun surgery
  }

  return Math.round((scopeBonus + fileBonus) * 100) / 100;
}

/**
 * Compute a fitness modifier from code mass change.
 * Creates evolutionary pressure against bloat:
 *
 * - Net shrinkage (negative delta): bonus up to +0.4
 * - Neutral (±500 bytes): no effect
 * - Growth 500–2000 bytes: small penalty
 * - Growth >2000 bytes: larger penalty (bloat)
 *
 * This is the anti-bloat gene — genomes that produce leaner code survive.
 */
function codeMassFitnessModifier(deltaBytes: number): number {
  if (deltaBytes < -500) {
    // Shrank the codebase — reward proportionally, capped at +0.4
    return Math.min(0.4, Math.abs(deltaBytes) / 5000);
  } else if (deltaBytes <= 500) {
    // Roughly neutral — no modifier
    return 0;
  } else if (deltaBytes <= 2000) {
    // Modest growth — mild penalty
    return -0.1;
  } else if (deltaBytes <= 5000) {
    // Significant growth — moderate penalty
    return -0.2;
  } else {
    // Major bloat — strong penalty
    return -0.35;
  }
}

// ── Fitness update & evolution ────────────────────────────────────────────────

/**
 * Record the outcome of a session and evolve the pool.
 * Optionally accepts diff stats for richer fitness scoring on successful sessions.
 */
export function recordOutcome(
  genomeId: string,
  outcome: "completed" | "failed" | "reverted",
  diffStats?: DiffStats,
): void {
  const pool = readGenePool();
  const genome = pool.genomes.find((g) => g.id === genomeId);
  if (!genome) return;

  // Base fitness from outcome
  const fitnessDeltas: Record<string, number> = {
    completed: 1.0,
    failed: -0.5,
    reverted: -1.0,
  };
  let delta = fitnessDeltas[outcome];

  // Layer on diff-based modifier for successful completions
  if (outcome === "completed" && diffStats) {
    delta += diffFitnessModifier(diffStats);
    // Anti-bloat pressure from code mass tracking
    if (diffStats.codeMassDelta !== undefined) {
      delta += codeMassFitnessModifier(diffStats.codeMassDelta);
    }
  }

  genome.fitness += Math.round(delta * 100) / 100;
  genome.timesUsed += 1;
  pool.totalSessions += 1;
  pool.activeGenomeId = null;

  // Every N sessions, run an evolution step
  const EVOLVE_EVERY = 3;
  if (pool.totalSessions % EVOLVE_EVERY === 0 && pool.genomes.length >= 4) {
    evolvePool(pool);
  }

  writeGenePool(pool);

  // Bust caches that depend on genome/commit state
  invalidateCache("self-improve:genome", "self-improve:lineage", "self-improve:commits", "self-improve:hotspots");
}

/**
 * Run one generation of evolution:
 * - Keep top performers
 * - Replace bottom performers with offspring of top performers
 * - Add a random immigrant for diversity
 */
function takeSnapshot(pool: GenePool, eliminated: number, survivorIds: string[]): EvolutionSnapshot {
  const fitnesses = pool.genomes
    .filter((g) => g.timesUsed > 0)
    .map((g) => g.fitness / g.timesUsed);

  const avgFitness = fitnesses.length > 0
    ? fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length
    : 0;
  const bestFitness = fitnesses.length > 0 ? Math.max(...fitnesses) : 0;
  const worstFitness = fitnesses.length > 0 ? Math.min(...fitnesses) : 0;

  // Count focus distribution
  const focusDistribution: Partial<Record<FocusGene, number>> = {};
  for (const g of pool.genomes) {
    focusDistribution[g.focus] = (focusDistribution[g.focus] ?? 0) + 1;
  }

  // Find dominant focus
  let dominantFocus: FocusGene = "new-feature";
  let maxCount = 0;
  for (const [focus, count] of Object.entries(focusDistribution)) {
    if (count! > maxCount) {
      maxCount = count!;
      dominantFocus = focus as FocusGene;
    }
  }

  return {
    generation: pool.generationCount,
    timestamp: new Date().toISOString(),
    avgFitness: Math.round(avgFitness * 100) / 100,
    bestFitness: Math.round(bestFitness * 100) / 100,
    worstFitness: Math.round(worstFitness * 100) / 100,
    dominantFocus,
    focusDistribution,
    populationSize: pool.genomes.length,
    eliminated,
    survivorIds,
  };
}

const MAX_HISTORY = 100; // Keep last 100 evolution snapshots

function evolvePool(pool: GenePool): void {
  pool.generationCount += 1;
  const gen = pool.generationCount;

  // Sort by average fitness (fitness / timesUsed), untested get neutral score
  const scored = pool.genomes.map((g) => ({
    genome: g,
    avgFitness: g.timesUsed === 0 ? 0 : g.fitness / g.timesUsed,
  }));
  scored.sort((a, b) => b.avgFitness - a.avgFitness);

  const keepCount = Math.ceil(pool.genomes.length * 0.5); // Keep top 50%
  const initialSurvivors = new Set(scored.slice(0, keepCount).map((s) => s.genome.id));

  // ── Niche protection: rescue the best genome from each focus niche ──
  // Without this, evolution converges to a monoculture (e.g. all "new-feature").
  // For each focus type that has NO representative in survivors, promote the
  // highest-fitness genome of that type from the elimination zone.
  const survivorFocuses = new Set(
    scored.filter((s) => initialSurvivors.has(s.genome.id)).map((s) => s.genome.focus),
  );
  for (const focus of ALL_FOCUS_GENES) {
    if (survivorFocuses.has(focus)) continue;
    // Find the best genome of this focus in the elimination zone
    const rescued = scored
      .filter((s) => !initialSurvivors.has(s.genome.id) && s.genome.focus === focus)
      .sort((a, b) => b.avgFitness - a.avgFitness)[0];
    if (rescued) {
      initialSurvivors.add(rescued.genome.id);
      survivorFocuses.add(focus);
    }
  }

  const survivors = scored.filter((s) => initialSurvivors.has(s.genome.id)).map((s) => s.genome);
  const eliminated = scored.filter((s) => !initialSurvivors.has(s.genome.id)).map((s) => s.genome);
  const eliminatedCount = eliminated.length;

  // Preserve eliminated genomes in the graveyard for phylogenetic tracking
  for (const genome of eliminated) {
    pool.graveyard.push({
      ...genome,
      culledAtGeneration: gen,
      causeOfDeath: "low-fitness",
    });
  }
  // Cap graveyard at 200 entries to prevent unbounded growth
  const MAX_GRAVEYARD = 200;
  if (pool.graveyard.length > MAX_GRAVEYARD) {
    pool.graveyard = pool.graveyard.slice(-MAX_GRAVEYARD);
  }

  // Record snapshot BEFORE replacing genomes
  const snapshot = takeSnapshot(pool, eliminatedCount, survivors.map((s) => s.id));
  pool.evolutionHistory.push(snapshot);
  // Trim history to max size
  if (pool.evolutionHistory.length > MAX_HISTORY) {
    pool.evolutionHistory = pool.evolutionHistory.slice(-MAX_HISTORY);
  }

  // Generate offspring to fill the pool
  const offspring: Genome[] = [];
  while (survivors.length + offspring.length < POOL_SIZE - 1) {
    if (Math.random() < 0.6 && survivors.length >= 2) {
      // Crossover
      const a = tournamentSelect(survivors, 2);
      const b = tournamentSelect(survivors, 2);
      offspring.push(mutateGenome(crossover(a, b, gen), gen));
    } else {
      // Mutation of a survivor
      const parent = tournamentSelect(survivors, 2);
      offspring.push(mutateGenome(parent, gen));
    }
  }

  // Add one random immigrant for genetic diversity
  offspring.push(randomGenome(gen));

  pool.genomes = [...survivors, ...offspring];
}

// ── Prompt injection ──────────────────────────────────────────────────────────

const FOCUS_DESCRIPTIONS: Record<FocusGene, string> = {
  "visual-polish":
    "Focus on visual improvements: colors, spacing, typography, micro-animations, dark/light mode polish.",
  "code-quality":
    "Focus on code quality: refactoring, reducing duplication, improving types, better abstractions.",
  "new-feature":
    "Focus on adding a compelling new feature or page that adds genuine value.",
  "ux-enhancement":
    "Focus on UX: smoother transitions, better responsive design, keyboard shortcuts, accessibility.",
  "meta-improvement":
    "Focus on improving the self-improve system itself: better feedback, smarter evolution, richer introspection.",
  "bug-fix":
    "Focus on finding and fixing bugs, edge cases, error handling, or robustness issues.",
  performance:
    "Focus on performance: faster loads, smaller bundles, optimized renders, lazy loading.",
};

/**
 * Build a strategy directive from a genome to inject into the agent prompt.
 */
export function buildStrategyDirective(genome: Genome): string {
  const focus = FOCUS_DESCRIPTIONS[genome.focus];
  const ambitionLabel =
    genome.ambition < 0.3
      ? "small, focused tweak"
      : genome.ambition < 0.7
        ? "moderate improvement"
        : "ambitious, substantial change";
  const creativityLabel =
    genome.creativity < 0.3
      ? "conservative and safe"
      : genome.creativity < 0.7
        ? "balanced between novel and conventional"
        : "highly creative and experimental";
  const thoroughnessLabel =
    genome.thoroughness < 0.3
      ? "Move fast, don't over-engineer"
      : genome.thoroughness < 0.7
        ? "Be reasonably thorough"
        : "Be extremely meticulous — verify everything before committing";

  return [
    "",
    "---",
    "",
    `## 🧬 Strategy Genome (Gen ${genome.generation}, ID: ${genome.id.slice(0, 8)})`,
    "",
    "Your approach for this session is shaped by evolved strategy genes.",
    "These were selected through natural selection — successful strategies survive, failed ones are pruned.",
    "",
    `**Focus:** ${focus}`,
    `**Ambition:** ${ambitionLabel} (${genome.ambition})`,
    `**Creativity:** ${creativityLabel} (${genome.creativity})`,
    `**Thoroughness:** ${thoroughnessLabel} (${genome.thoroughness})`,
    "",
    "Interpret these as guiding tendencies, not rigid rules. Let them influence your choice of what to improve and how.",
    "",
  ].join("\n");
}

// ── Public API for reading pool state ─────────────────────────────────────────

export function getGenePool(): GenePool {
  return readGenePool();
}

export function resetGenePool(): GenePool {
  return seedPool();
}

/** Node in the phylogenetic tree — includes both living and dead genomes. */
export type LineageNode = Genome & {
  alive: boolean;
  culledAtGeneration?: number;
  causeOfDeath?: string;
  /** IDs of child genomes (computed from parentId references) */
  childIds: string[];
};

/**
 * Get the full lineage of all genomes — living and dead — for phylogenetic visualization.
 * Computes parent→child edges and marks living vs culled status.
 */
export function getFullLineage(): {
  nodes: LineageNode[];
  maxGeneration: number;
  livingIds: Set<string>;
} {
  const pool = readGenePool();
  const livingIds = new Set(pool.genomes.map((g) => g.id));

  // Merge living genomes and graveyard into one list
  const allGenomes: LineageNode[] = [
    ...pool.genomes.map((g) => ({ ...g, alive: true, childIds: [] as string[] })),
    ...pool.graveyard.map((g) => ({
      ...g,
      alive: false,
      childIds: [] as string[],
    })),
  ];

  // Deduplicate by id (in case of data overlap)
  const byId = new Map<string, LineageNode>();
  for (const node of allGenomes) {
    if (!byId.has(node.id)) {
      byId.set(node.id, node);
    }
  }

  // Build parent→child edges
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.childIds.push(node.id);
    }
  }

  const nodes = Array.from(byId.values());
  const maxGeneration = nodes.reduce((max, n) => Math.max(max, n.generation), 0);

  return { nodes, maxGeneration, livingIds };
}

/**
 * Apply a fitness delta to a specific genome from user feedback.
 * This is the human-in-the-loop signal — the strongest evolutionary pressure.
 */
export function applyFeedbackFitness(genomeId: string, delta: number): boolean {
  const pool = readGenePool();
  const genome = pool.genomes.find((g) => g.id === genomeId);
  if (!genome) return false;
  genome.fitness += delta;
  writeGenePool(pool);
  invalidateCache("self-improve:genome", "self-improve:lineage");
  return true;
}
