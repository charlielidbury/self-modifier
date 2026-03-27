"use client";

import { memo, useState, useId } from "react";
import { cn } from "@/lib/utils";
import {
  FileIcon,
  TerminalIcon,
  SearchIcon,
  FolderSearchIcon,
  BotIcon,
  PencilIcon,
  FileOutputIcon,
  GlobeIcon,
  SearchCodeIcon,
  CheckIcon,
  LoaderIcon,
} from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function tryParseArgs(argsText?: string): Record<string, unknown> | null {
  if (!argsText) return null;
  try {
    return JSON.parse(argsText);
  } catch {
    return null;
  }
}

function shortenPath(filePath: string): string {
  // Show last 2-3 segments for readability
  const parts = filePath.replace(/^\/+/, "").split("/");
  if (parts.length <= 3) return filePath;
  return "…/" + parts.slice(-3).join("/");
}

function getExtension(filePath: string): string {
  const match = filePath.match(/\.(\w+)$/);
  return match ? match[1] : "";
}

// ─── Types ──────────────────────────────────────────────────────────────────

type ToolRendererProps = {
  toolName: string;
  argsText?: string;
  result?: unknown;
};

type TriggerInfo = {
  icon: React.ElementType;
  label: string;
  detail?: string; // shown in muted text after label
};

type ArgsDisplay = {
  content: React.ReactNode;
} | null;

type ResultDisplay = {
  content: React.ReactNode;
} | null;

// ─── Trigger Info ───────────────────────────────────────────────────────────

export function getToolTriggerInfo(
  toolName: string,
  argsText?: string,
): TriggerInfo {
  const args = tryParseArgs(argsText);

  switch (toolName) {
    case "Read": {
      const filePath = (args?.file_path as string) || "";
      return {
        icon: FileIcon,
        label: shortenPath(filePath),
        detail: args?.offset ? `lines ${args.offset}–${Number(args.offset) + (Number(args.limit) || 2000)}` : undefined,
      };
    }
    case "Edit": {
      const filePath = (args?.file_path as string) || "";
      return {
        icon: PencilIcon,
        label: shortenPath(filePath),
      };
    }
    case "Write": {
      const filePath = (args?.file_path as string) || "";
      return {
        icon: FileOutputIcon,
        label: shortenPath(filePath),
      };
    }
    case "Bash": {
      const desc = (args?.description as string) || "";
      const cmd = (args?.command as string) || "";
      // Show description if available, otherwise first line of command
      const displayText = desc || cmd.split("\n")[0];
      return {
        icon: TerminalIcon,
        label: displayText.length > 80 ? displayText.slice(0, 77) + "…" : displayText,
      };
    }
    case "Grep": {
      const pattern = (args?.pattern as string) || "";
      const path = (args?.path as string) || "";
      return {
        icon: SearchCodeIcon,
        label: `"${pattern}"`,
        detail: path ? `in ${shortenPath(path)}` : undefined,
      };
    }
    case "Glob": {
      const pattern = (args?.pattern as string) || "";
      const path = (args?.path as string) || "";
      return {
        icon: FolderSearchIcon,
        label: pattern,
        detail: path ? `in ${shortenPath(path)}` : undefined,
      };
    }
    case "Agent": {
      const desc = (args?.description as string) || "";
      const subType = (args?.subagent_type as string) || "";
      const children = (args?._children as unknown[]) || [];
      const childCount = children.length;
      // Show child count when available (completed or in-progress)
      const detail = childCount > 0
        ? `${childCount} tool use${childCount !== 1 ? "s" : ""}`
        : subType || undefined;
      return {
        icon: BotIcon,
        label: desc || subType || "Sub-agent",
        detail,
      };
    }
    case "WebFetch": {
      const url = (args?.url as string) || "";
      let displayUrl = url;
      try {
        const u = new URL(url);
        displayUrl = u.hostname + (u.pathname !== "/" ? u.pathname : "");
      } catch { /* use raw */ }
      return {
        icon: GlobeIcon,
        label: displayUrl.length > 60 ? displayUrl.slice(0, 57) + "…" : displayUrl,
      };
    }
    case "WebSearch": {
      const query = (args?.query as string) || "";
      return {
        icon: SearchIcon,
        label: `"${query}"`,
      };
    }
    default:
      return {
        icon: FileIcon,
        label: toolName,
      };
  }
}

// ─── Args Renderers ─────────────────────────────────────────────────────────

const COLLAPSE_THRESHOLD = 400;

function CollapsibleText({
  text,
  className,
  mono = true,
}: {
  text: string;
  className?: string;
  mono?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > COLLAPSE_THRESHOLD;

  return (
    <div className={className}>
      <div className="relative">
        <pre
          className={cn(
            "whitespace-pre-wrap overflow-hidden transition-[max-height] duration-300 ease-in-out text-xs",
            !expanded && isLong ? "max-h-28" : "max-h-[9999px]",
            mono && "font-mono",
          )}
        >
          {text}
        </pre>
        {isLong && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover/80 to-transparent"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
    </div>
  );
}

function ReadArgs({ args }: { args: Record<string, unknown> }) {
  const filePath = (args.file_path as string) || "";
  const offset = args.offset as number | undefined;
  const limit = args.limit as number | undefined;

  return (
    <div className="px-4 text-xs text-muted-foreground">
      <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">
        {filePath}
      </code>
      {(offset || limit) && (
        <span className="ml-2">
          {offset ? `from line ${offset}` : ""}
          {offset && limit ? ", " : ""}
          {limit ? `${limit} lines` : ""}
        </span>
      )}
    </div>
  );
}

function EditArgs({ args }: { args: Record<string, unknown> }) {
  const filePath = (args.file_path as string) || "";
  const oldStr = (args.old_string as string) || "";
  const newStr = (args.new_string as string) || "";
  const replaceAll = args.replace_all as boolean | undefined;

  return (
    <div className="px-4 space-y-2">
      <div className="text-xs text-muted-foreground">
        <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">
          {filePath}
        </code>
        {replaceAll && <span className="ml-2 text-amber-500/80">(replace all)</span>}
      </div>
      <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">
        <div className="text-[10px] font-medium text-red-400/70 uppercase tracking-wider mb-1">Removed</div>
        <pre className="text-xs font-mono whitespace-pre-wrap text-red-300/80 max-h-40 overflow-y-auto">
          {oldStr}
        </pre>
      </div>
      <div className="rounded border border-green-500/20 bg-green-500/5 px-3 py-2">
        <div className="text-[10px] font-medium text-green-400/70 uppercase tracking-wider mb-1">Added</div>
        <pre className="text-xs font-mono whitespace-pre-wrap text-green-300/80 max-h-40 overflow-y-auto">
          {newStr}
        </pre>
      </div>
    </div>
  );
}

function WriteArgs({ args }: { args: Record<string, unknown> }) {
  const filePath = (args.file_path as string) || "";
  const content = (args.content as string) || "";
  const lineCount = content.split("\n").length;

  return (
    <div className="px-4 space-y-2">
      <div className="text-xs text-muted-foreground">
        <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">
          {filePath}
        </code>
        <span className="ml-2">{lineCount} lines</span>
      </div>
      <CollapsibleText text={content} className="" />
    </div>
  );
}

function BashArgs({ args }: { args: Record<string, unknown> }) {
  const command = (args.command as string) || "";
  const desc = (args.description as string) || "";

  return (
    <div className="px-4 space-y-1.5">
      {desc && (
        <p className="text-xs text-muted-foreground">{desc}</p>
      )}
      <div className="rounded border border-border/50 bg-muted/30 px-3 py-2">
        <pre className="text-xs font-mono whitespace-pre-wrap text-foreground/90">
          <span className="text-muted-foreground select-none">$ </span>
          {command}
        </pre>
      </div>
    </div>
  );
}

function GrepArgs({ args }: { args: Record<string, unknown> }) {
  const pattern = (args.pattern as string) || "";
  const path = (args.path as string) || "";
  const glob = (args.glob as string) || "";
  const outputMode = (args.output_mode as string) || "";

  return (
    <div className="px-4 text-xs text-muted-foreground space-y-0.5">
      <div>
        Pattern: <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">{pattern}</code>
      </div>
      {path && <div>Path: <code className="font-mono text-foreground/70">{shortenPath(path)}</code></div>}
      {glob && <div>Filter: <code className="font-mono text-foreground/70">{glob}</code></div>}
      {outputMode && <div>Mode: {outputMode}</div>}
    </div>
  );
}

function GlobArgs({ args }: { args: Record<string, unknown> }) {
  const pattern = (args.pattern as string) || "";
  const path = (args.path as string) || "";

  return (
    <div className="px-4 text-xs text-muted-foreground">
      <div>
        Pattern: <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-foreground/80">{pattern}</code>
      </div>
      {path && <div>In: <code className="font-mono text-foreground/70">{shortenPath(path)}</code></div>}
    </div>
  );
}

type ChildToolCall = {
  type: "tool-use";
  tool: string;
  input: Record<string, unknown>;
  result?: string;
};

function AgentArgs({ args }: { args: Record<string, unknown> }) {
  const desc = (args.description as string) || "";
  const subType = (args.subagent_type as string) || "";
  const prompt = (args.prompt as string) || "";
  const children = (args._children as ChildToolCall[]) || [];

  return (
    <div className="px-4 space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        {subType && (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400/80 border border-blue-500/20">
            {subType}
          </span>
        )}
        {desc && <span className="text-muted-foreground">{desc}</span>}
      </div>
      {prompt && (
        <CollapsibleText text={prompt} className="" mono={false} />
      )}
      {children.length > 0 && (
        <div className="space-y-0.5 pt-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
            Tool calls ({children.length})
          </div>
          {children.map((child, i) => {
            const info = getToolTriggerInfo(
              child.tool,
              JSON.stringify(child.input),
            );
            const ToolIcon = info.icon;
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5"
              >
                {child.result !== undefined ? (
                  <CheckIcon className="size-3 shrink-0 text-green-500/60" />
                ) : (
                  <LoaderIcon className="size-3 shrink-0 animate-spin" />
                )}
                <ToolIcon className="size-3 shrink-0 text-muted-foreground/50" />
                <span className="text-muted-foreground/80">{child.tool}</span>
                <span className="truncate text-foreground/70 font-medium">
                  {info.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DefaultArgs({ argsText }: { argsText: string }) {
  return (
    <div className="px-4">
      <CollapsibleText text={argsText} />
    </div>
  );
}

export function ToolArgsRenderer({
  toolName,
  argsText,
}: {
  toolName: string;
  argsText?: string;
}) {
  if (!argsText) return null;

  const args = tryParseArgs(argsText);
  if (!args) {
    return <DefaultArgs argsText={argsText} />;
  }

  switch (toolName) {
    case "Read":
      return <ReadArgs args={args} />;
    case "Edit":
      return <EditArgs args={args} />;
    case "Write":
      return <WriteArgs args={args} />;
    case "Bash":
      return <BashArgs args={args} />;
    case "Grep":
      return <GrepArgs args={args} />;
    case "Glob":
      return <GlobArgs args={args} />;
    case "Agent":
      return <AgentArgs args={args} />;
    default:
      return <DefaultArgs argsText={argsText} />;
  }
}

// ─── Result Renderers ───────────────────────────────────────────────────────

function parseAgentResult(result: unknown): { text: string; metadata?: string } | null {
  if (typeof result !== "string") return null;

  // Agent results often come as JSON arrays: [{"type":"text","text":"..."},{"type":"text","text":"agentId: ..."}]
  try {
    const parsed = JSON.parse(result);
    if (Array.isArray(parsed)) {
      const texts: string[] = [];
      let metadata = "";
      for (const item of parsed) {
        if (item?.type === "text" && typeof item.text === "string") {
          const text = item.text as string;
          // Separate metadata (agentId, usage) from main content
          if (text.startsWith("agentId:") || text.includes("<usage>")) {
            metadata = text;
          } else {
            texts.push(text);
          }
        }
      }
      if (texts.length > 0) {
        return { text: texts.join("\n\n"), metadata: metadata || undefined };
      }
    }
  } catch {
    // Not JSON, return as-is
  }
  return null;
}

function AgentResult({ result }: { result: unknown }) {
  const parsed = parseAgentResult(result);
  if (!parsed) return <GenericResult result={result} />;

  const [expanded, setExpanded] = useState(false);
  const isLong = parsed.text.length > 600;

  return (
    <div className="px-4 pt-2 border-t border-dashed space-y-2">
      <div className="relative">
        <div
          className={cn(
            "prose prose-sm prose-invert max-w-none text-xs overflow-hidden transition-[max-height] duration-300",
            !expanded && isLong ? "max-h-48" : "max-h-[9999px]",
          )}
        >
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/90">
            {parsed.text}
          </pre>
        </div>
        {isLong && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-popover/80 to-transparent"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
      {parsed.metadata && (
        <div className="text-[10px] text-muted-foreground/50 font-mono">
          {parsed.metadata.replace(/<\/?usage>/g, "").trim()}
        </div>
      )}
    </div>
  );
}

function BashResult({ result }: { result: unknown }) {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 600;

  return (
    <div className="px-4 pt-2 border-t border-dashed">
      <div className="rounded border border-border/50 bg-zinc-950/50 relative">
        <pre
          className={cn(
            "text-xs font-mono whitespace-pre-wrap p-3 text-foreground/80 overflow-hidden transition-[max-height] duration-300",
            !expanded && isLong ? "max-h-48" : "max-h-[9999px]",
          )}
        >
          {text}
        </pre>
        {isLong && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-950/80 to-transparent rounded-b"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
    </div>
  );
}

function FileListResult({ result }: { result: unknown }) {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const lines = text.trim().split("\n").filter(Boolean);
  const [showAll, setShowAll] = useState(false);
  const MAX_VISIBLE = 15;
  const hasMore = lines.length > MAX_VISIBLE;
  const visibleLines = showAll ? lines : lines.slice(0, MAX_VISIBLE);

  return (
    <div className="px-4 pt-2 border-t border-dashed">
      <div className="text-xs text-muted-foreground mb-1">
        {lines.length} file{lines.length !== 1 ? "s" : ""} found
      </div>
      <div className="space-y-0.5">
        {visibleLines.map((line, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs font-mono">
            <FileIcon className="size-3 text-muted-foreground/50 shrink-0" />
            <span className="text-foreground/80 truncate">{line.trim()}</span>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAll ? "↑ Show less" : `↓ Show ${lines.length - MAX_VISIBLE} more files`}
        </button>
      )}
    </div>
  );
}

function ReadResult({ result }: { result: unknown }) {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const [expanded, setExpanded] = useState(false);
  const lineCount = text.trimEnd().split("\n").length;
  const isLong = text.length > 800;

  return (
    <div className="px-4 pt-2 border-t border-dashed">
      <div className="text-[10px] text-muted-foreground/60 mb-1">{lineCount} lines</div>
      <div className="rounded border border-border/50 bg-muted/20 relative">
        <pre
          className={cn(
            "text-xs font-mono whitespace-pre-wrap p-3 text-foreground/80 overflow-hidden transition-[max-height] duration-300 leading-relaxed",
            !expanded && isLong ? "max-h-48" : "max-h-[9999px]",
          )}
        >
          {text}
        </pre>
        {isLong && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-muted/40 to-transparent rounded-b"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
    </div>
  );
}

function GrepResult({ result }: { result: unknown }) {
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const lines = text.trim().split("\n").filter(Boolean);

  // Check if it looks like files_with_matches mode (just file paths)
  const looksLikeFiles = lines.every(
    (l) => l.startsWith("/") || l.startsWith("./") || l.match(/^\S+\.\w+$/)
  );

  if (looksLikeFiles) {
    return <FileListResult result={result} />;
  }

  return <BashResult result={result} />;
}

function GenericResult({ result }: { result: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const labelId = useId();

  if (result === undefined) return null;

  const resultText =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const isLong = resultText.length > COLLAPSE_THRESHOLD;

  return (
    <div className="px-4 pt-2 border-t border-dashed">
      <p id={labelId} className="font-semibold text-xs mb-1">
        Result:
      </p>
      <div className="relative">
        <pre
          aria-labelledby={labelId}
          className={cn(
            "whitespace-pre-wrap overflow-hidden transition-[max-height] duration-300 ease-in-out text-xs",
            !expanded && isLong ? "max-h-28" : "max-h-[9999px]",
          )}
        >
          {resultText}
        </pre>
        {isLong && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover/80 to-transparent"
          />
        )}
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
    </div>
  );
}

export function ToolResultRenderer({
  toolName,
  result,
}: {
  toolName: string;
  result?: unknown;
}) {
  if (result === undefined) return null;

  switch (toolName) {
    case "Agent":
      return <AgentResult result={result} />;
    case "Bash":
      return <BashResult result={result} />;
    case "Read":
      return <ReadResult result={result} />;
    case "Glob":
      return <FileListResult result={result} />;
    case "Grep":
      return <GrepResult result={result} />;
    case "Edit":
    case "Write":
      return <GenericResult result={result} />;
    default:
      return <GenericResult result={result} />;
  }
}
