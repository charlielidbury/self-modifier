"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Dna, Loader2, RefreshCw, Skull, Sparkles } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LineageNode = {
  id: string;
  generation: number;
  focus: string;
  ambition: number;
  creativity: number;
  thoroughness: number;
  fitness: number;
  timesUsed: number;
  parentId: string | null;
  createdAt: string;
  alive: boolean;
  culledAtGeneration?: number;
  causeOfDeath?: string;
  childIds: string[];
};

type LineageData = {
  nodes: LineageNode[];
  maxGeneration: number;
  livingIds: string[];
};

// ── Focus gene color palette ──────────────────────────────────────────────────

const FOCUS_COLORS: Record<string, { fill: string; stroke: string; label: string; glow: string }> = {
  "visual-polish":   { fill: "#a78bfa", stroke: "#7c3aed", label: "Visual",   glow: "rgba(167,139,250,0.4)" },
  "code-quality":    { fill: "#fbbf24", stroke: "#d97706", label: "Quality",  glow: "rgba(251,191,36,0.4)" },
  "new-feature":     { fill: "#60a5fa", stroke: "#2563eb", label: "Feature",  glow: "rgba(96,165,250,0.4)" },
  "ux-enhancement":  { fill: "#34d399", stroke: "#059669", label: "UX",       glow: "rgba(52,211,153,0.4)" },
  "meta-improvement":{ fill: "#f472b6", stroke: "#db2777", label: "Meta",     glow: "rgba(244,114,182,0.4)" },
  "bug-fix":         { fill: "#f87171", stroke: "#dc2626", label: "Bug Fix",  glow: "rgba(248,113,113,0.4)" },
  "performance":     { fill: "#fb923c", stroke: "#ea580c", label: "Perf",     glow: "rgba(251,146,60,0.4)" },
};

function getFocusStyle(focus: string) {
  return FOCUS_COLORS[focus] ?? { fill: "#94a3b8", stroke: "#64748b", label: focus, glow: "rgba(148,163,184,0.3)" };
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

type LayoutNode = LineageNode & {
  x: number;
  y: number;
  radius: number;
};

function layoutTree(nodes: LineageNode[], maxGen: number): {
  layoutNodes: LayoutNode[];
  edges: Array<{ from: LayoutNode; to: LayoutNode }>;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { layoutNodes: [], edges: [], width: 400, height: 200 };
  }

  const PADDING_X = 80;
  const PADDING_Y = 50;
  const GEN_SPACING = 160; // horizontal space per generation
  const NODE_SPACING = 60; // minimum vertical space between nodes

  // Group by generation
  const byGen = new Map<number, LineageNode[]>();
  for (const node of nodes) {
    if (!byGen.has(node.generation)) byGen.set(node.generation, []);
    byGen.get(node.generation)!.push(node);
  }

  // Sort within each generation: alive first, then by fitness desc
  for (const [, genNodes] of byGen) {
    genNodes.sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.fitness - a.fitness;
    });
  }

  // Assign positions
  const nodeMap = new Map<string, LayoutNode>();
  const numGens = maxGen + 1;
  let maxY = 0;

  for (let gen = 0; gen <= maxGen; gen++) {
    const genNodes = byGen.get(gen) ?? [];
    const totalHeight = genNodes.length * NODE_SPACING;
    const startY = PADDING_Y;

    for (let i = 0; i < genNodes.length; i++) {
      const node = genNodes[i];
      // Node radius based on fitness (min 8, max 20)
      const avgFit = node.timesUsed > 0 ? node.fitness / node.timesUsed : 0;
      const radius = Math.max(8, Math.min(20, 8 + avgFit * 6));

      const layoutNode: LayoutNode = {
        ...node,
        x: PADDING_X + gen * GEN_SPACING,
        y: startY + i * NODE_SPACING,
        radius,
      };
      nodeMap.set(node.id, layoutNode);
      maxY = Math.max(maxY, layoutNode.y);
    }
  }

  // Build edges
  const edges: Array<{ from: LayoutNode; to: LayoutNode }> = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      edges.push({ from: nodeMap.get(node.parentId)!, to: node });
    }
  }

  const layoutNodes = Array.from(nodeMap.values());
  const width = Math.max(400, PADDING_X * 2 + numGens * GEN_SPACING);
  const height = Math.max(200, maxY + PADDING_Y * 2);

  return { layoutNodes, edges, width, height };
}

// ── Tooltip component ─────────────────────────────────────────────────────────

function NodeTooltip({
  node,
  x,
  y,
}: {
  node: LayoutNode;
  x: number;
  y: number;
}) {
  const style = getFocusStyle(node.focus);

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        left: x + 16,
        top: y - 40,
      }}
    >
      <div className="bg-popover/95 backdrop-blur-md border border-border rounded-lg shadow-xl px-3 py-2.5 min-w-[180px] text-xs">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: style.fill }}
          />
          <span className="font-semibold text-foreground">{style.label}</span>
          {node.alive ? (
            <span className="ml-auto flex items-center gap-0.5 text-emerald-400 text-[9px] font-medium">
              <Sparkles size={8} /> Alive
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-0.5 text-red-400/70 text-[9px] font-medium">
              <Skull size={8} /> Culled
            </span>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Generation</span>
          <span className="text-foreground font-mono text-right">{node.generation}</span>
          <span>Fitness</span>
          <span className="text-foreground font-mono text-right">{node.fitness.toFixed(2)}</span>
          <span>Sessions</span>
          <span className="text-foreground font-mono text-right">{node.timesUsed}</span>
          <span>Avg fitness</span>
          <span className="text-foreground font-mono text-right">
            {node.timesUsed > 0 ? (node.fitness / node.timesUsed).toFixed(2) : "—"}
          </span>
        </div>

        {/* Gene values */}
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <div className="flex items-center gap-3 text-[9px]">
            <GeneStat label="AMB" value={node.ambition} />
            <GeneStat label="CRE" value={node.creativity} />
            <GeneStat label="THO" value={node.thoroughness} />
          </div>
        </div>

        {/* Children count */}
        {node.childIds.length > 0 && (
          <div className="mt-1 text-[9px] text-muted-foreground/70">
            {node.childIds.length} offspring
          </div>
        )}

        {/* ID */}
        <div className="mt-1 font-mono text-[8px] text-muted-foreground/40">
          {node.id.slice(0, 8)}
        </div>
      </div>
    </div>
  );
}

function GeneStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground/60 font-medium">{label}</span>
      <div className="w-8 h-1 rounded-full bg-muted/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground/40"
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="font-mono text-foreground/60">{value.toFixed(1)}</span>
    </div>
  );
}

// ── Main tree component ───────────────────────────────────────────────────────

export default function GenomeTree() {
  const [data, setData] = useState<LineageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/self-improve/lineage")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch lineage");
        return res.json() as Promise<LineageData>;
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const livingIdSet = useMemo(
    () => new Set(data?.livingIds ?? []),
    [data?.livingIds],
  );

  const { layoutNodes, edges, width, height } = useMemo(() => {
    if (!data) return { layoutNodes: [], edges: [], width: 400, height: 200 };
    return layoutTree(data.nodes, data.maxGeneration);
  }, [data]);

  // Find the fittest living genome for the crown
  const fittestAliveId = useMemo(() => {
    if (!layoutNodes.length) return null;
    const living = layoutNodes.filter((n) => n.alive && n.timesUsed > 0);
    if (!living.length) return null;
    living.sort((a, b) => b.fitness / b.timesUsed - a.fitness / a.timesUsed);
    return living[0].id;
  }, [layoutNodes]);

  const handleNodeHover = useCallback(
    (node: LayoutNode | null, event?: React.MouseEvent) => {
      if (!node || !event) {
        setHoveredId(null);
        setTooltipPos(null);
        return;
      }
      setHoveredId(node.id);
      const container = containerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setTooltipPos({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading phylogenetic tree...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-xs text-red-400/70">{error}</div>
    );
  }

  if (!data || layoutNodes.length === 0) {
    return (
      <div className="text-center py-8">
        <Dna size={24} className="mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-xs text-muted-foreground">
          No genomes yet. Start a self-improve session to seed the gene pool.
        </p>
      </div>
    );
  }

  // Focus gene legend — only include those present in the data
  const presentFoci = new Set(layoutNodes.map((n) => n.focus));
  const legendEntries = Object.entries(FOCUS_COLORS).filter(([focus]) =>
    presentFoci.has(focus),
  );

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border/40">
        <Dna size={16} className="text-pink-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Phylogenetic Tree
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {layoutNodes.filter((n) => n.alive).length} living ·{" "}
            {layoutNodes.filter((n) => !n.alive).length} extinct ·{" "}
            {data.maxGeneration + 1} generation{data.maxGeneration !== 0 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 flex flex-wrap gap-x-3 gap-y-1 border-b border-border/30 bg-muted/20">
        {legendEntries.map(([focus, style]) => (
          <div key={focus} className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: style.fill }}
            />
            <span>{style.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 ml-2">
          <div className="w-2 h-2 rounded-full border border-dashed border-muted-foreground/30 flex-shrink-0" />
          <span>Extinct</span>
        </div>
      </div>

      {/* Tree SVG */}
      <div ref={containerRef} className="relative overflow-x-auto overflow-y-hidden">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
        >
          {/* Generation column labels */}
          {Array.from({ length: data.maxGeneration + 1 }, (_, gen) => (
            <text
              key={`gen-label-${gen}`}
              x={80 + gen * 160}
              y={20}
              textAnchor="middle"
              className="fill-muted-foreground/40 text-[10px] font-mono"
            >
              Gen {gen}
            </text>
          ))}

          {/* Generation column lines */}
          {Array.from({ length: data.maxGeneration + 1 }, (_, gen) => (
            <line
              key={`gen-line-${gen}`}
              x1={80 + gen * 160}
              y1={28}
              x2={80 + gen * 160}
              y2={height - 20}
              className="stroke-border/20"
              strokeDasharray="4 4"
            />
          ))}

          {/* Edges (curved Bézier paths) */}
          {edges.map(({ from, to }) => {
            const isHighlighted = hoveredId === from.id || hoveredId === to.id;
            const midX = (from.x + to.x) / 2;
            const style = getFocusStyle(to.focus);
            return (
              <path
                key={`${from.id}-${to.id}`}
                d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                fill="none"
                stroke={isHighlighted ? style.stroke : "var(--border)"}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isHighlighted ? 0.9 : to.alive ? 0.4 : 0.15}
                className="transition-all duration-200"
              />
            );
          })}

          {/* Glow filters for living nodes */}
          <defs>
            {Object.entries(FOCUS_COLORS).map(([focus, style]) => (
              <filter key={focus} id={`glow-${focus}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor={style.glow} result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const style = getFocusStyle(node.focus);
            const isHovered = hoveredId === node.id;
            const isRelated =
              hoveredId !== null &&
              (node.parentId === hoveredId || node.childIds.includes(hoveredId));
            const isFittest = node.id === fittestAliveId;

            return (
              <g
                key={node.id}
                className="cursor-pointer"
                onMouseEnter={(e) => handleNodeHover(node, e)}
                onMouseMove={(e) => handleNodeHover(node, e)}
                onMouseLeave={() => handleNodeHover(null)}
              >
                {/* Animated pulse ring for fittest */}
                {isFittest && node.alive && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 4}
                    fill="none"
                    stroke={style.fill}
                    strokeWidth={1.5}
                    opacity={0.4}
                    className="animate-ping"
                    style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                  />
                )}

                {/* Hover ring */}
                {(isHovered || isRelated) && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 3}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={isHovered ? 2 : 1}
                    strokeOpacity={0.6}
                    className="transition-all duration-150"
                  />
                )}

                {/* Main node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={node.alive ? style.fill : "transparent"}
                  stroke={style.stroke}
                  strokeWidth={node.alive ? 2 : 1.5}
                  strokeDasharray={node.alive ? "none" : "3 2"}
                  opacity={node.alive ? (isHovered ? 1 : 0.85) : (isHovered ? 0.6 : 0.3)}
                  filter={node.alive && isHovered ? `url(#glow-${node.focus})` : undefined}
                  className="transition-all duration-200"
                />

                {/* Crown icon for fittest */}
                {isFittest && (
                  <text
                    x={node.x}
                    y={node.y - node.radius - 6}
                    textAnchor="middle"
                    fontSize={10}
                    className="fill-amber-400"
                  >
                    👑
                  </text>
                )}

                {/* Skull for dead nodes (only when hovered) */}
                {!node.alive && isHovered && (
                  <text
                    x={node.x}
                    y={node.y + 3}
                    textAnchor="middle"
                    fontSize={8}
                    className="fill-red-400/60"
                  >
                    💀
                  </text>
                )}

                {/* Fitness label for living nodes */}
                {node.alive && node.timesUsed > 0 && (
                  <text
                    x={node.x}
                    y={node.y + node.radius + 14}
                    textAnchor="middle"
                    className="fill-muted-foreground/50 text-[8px] font-mono"
                  >
                    {(node.fitness / node.timesUsed).toFixed(1)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip overlay */}
        {hoveredId && tooltipPos && (() => {
          const node = layoutNodes.find((n) => n.id === hoveredId);
          if (!node) return null;
          return (
            <NodeTooltip
              node={node}
              x={tooltipPos.x}
              y={tooltipPos.y}
            />
          );
        })()}
      </div>
    </div>
  );
}
