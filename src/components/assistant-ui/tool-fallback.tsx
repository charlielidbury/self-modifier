"use client";

import { memo, useCallback, useEffect, useRef, useState, useId } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import {
  useScrollLock,
  type ToolCallMessagePartStatus,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  getToolTriggerInfo,
  ToolArgsRenderer,
  ToolResultRenderer,
} from "./tool-renderers";

const ANIMATION_DURATION = 200;

export type ToolFallbackRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

function ToolFallbackRoot({
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolFallbackRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        lockScroll();
      }
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-fallback-root"
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "aui-tool-fallback-root group/tool-fallback-root w-full rounded-lg border py-3",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

type ToolStatus = ToolCallMessagePartStatus["type"];

const statusIconMap: Record<ToolStatus, React.ElementType> = {
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
  "requires-action": AlertCircleIcon,
};

/** Formats milliseconds as a compact elapsed-time string: "0.3s", "4.1s", "1m 2s". */
function formatElapsedMs(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function ToolFallbackTrigger({
  toolName,
  argsText,
  status,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  argsText?: string;
  status?: ToolCallMessagePartStatus;
}) {
  const statusType = status?.type ?? "complete";
  const isRunning = statusType === "running";
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  const triggerInfo = getToolTriggerInfo(toolName, argsText);
  const StatusIcon = statusIconMap[statusType];
  const ToolIcon = triggerInfo.icon;
  const label = isCancelled ? "Cancelled" : toolName;

  // Track elapsed time while the tool is running; capture final duration on completion.
  const startTimeRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  // Keep the final duration so it stays visible after completion.
  const finalMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      // Mark start time on first transition to running.
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
        finalMsRef.current = null;
      }
      // Tick every 100 ms while running.
      const interval = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current!);
      }, 100);
      return () => clearInterval(interval);
    } else {
      // Capture final elapsed time when the tool stops running.
      if (startTimeRef.current !== null && finalMsRef.current === null) {
        finalMsRef.current = Date.now() - startTimeRef.current;
        setElapsedMs(finalMsRef.current);
        startTimeRef.current = null;
      }
    }
  }, [isRunning]);

  // The elapsed time badge to display (null = don't show).
  const showTime = !isCancelled && elapsedMs !== null && elapsedMs > 0;

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "aui-tool-fallback-trigger group/trigger flex w-full items-center gap-2 px-4 text-sm transition-colors",
        className,
      )}
      {...props}
    >
      {isRunning ? (
        <StatusIcon
          data-slot="tool-fallback-trigger-icon"
          className="aui-tool-fallback-trigger-icon size-4 shrink-0 animate-spin"
        />
      ) : (
        <StatusIcon
          data-slot="tool-fallback-trigger-status-icon"
          className={cn(
            "size-3.5 shrink-0",
            statusType === "complete" && "text-green-500/60",
            isCancelled && "text-muted-foreground",
            statusType === "incomplete" && !isCancelled && "text-red-500/60",
          )}
        />
      )}
      <ToolIcon
        data-slot="tool-fallback-trigger-tool-icon"
        className={cn(
          "size-4 shrink-0 text-muted-foreground/70",
          isCancelled && "text-muted-foreground/40",
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "aui-tool-fallback-trigger-label-wrapper relative inline-flex items-baseline gap-1.5 grow text-left leading-none min-w-0",
          isCancelled && "text-muted-foreground line-through",
        )}
      >
        <span className="truncate">
          <span className="text-muted-foreground/80">{label}</span>
          {" "}
          <b className="text-foreground/90 font-medium">{triggerInfo.label}</b>
          {triggerInfo.detail && (
            <span className="text-muted-foreground/60 ml-1">{triggerInfo.detail}</span>
          )}
        </span>
        {isRunning && (
          <span
            aria-hidden
            data-slot="tool-fallback-trigger-shimmer"
            className="aui-tool-fallback-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            <span className="text-muted-foreground/80">{label}</span>
            {" "}
            <b className="font-medium">{triggerInfo.label}</b>
          </span>
        )}
      </span>
      {/* Elapsed / final duration badge */}
      {showTime && (
        <span
          aria-label={isRunning ? `Running for ${formatElapsedMs(elapsedMs!)}` : `Completed in ${formatElapsedMs(elapsedMs!)}`}
          className={cn(
            "tabular-nums text-[11px] select-none shrink-0 transition-colors duration-300",
            isRunning
              ? "text-muted-foreground/70"
              : "text-muted-foreground/45",
          )}
        >
          {formatElapsedMs(elapsedMs!)}
        </span>
      )}
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "aui-tool-fallback-trigger-chevron size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "aui-tool-fallback-content relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <div className="mt-3 flex flex-col gap-2 border-t pt-2">{children}</div>
    </CollapsibleContent>
  );
}

function ToolFallbackArgs({
  argsText,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  argsText?: string;
}) {
  if (!argsText) return null;

  return (
    <div
      data-slot="tool-fallback-args"
      className={cn("aui-tool-fallback-args px-4", className)}
      {...props}
    >
      <pre className="aui-tool-fallback-args-value whitespace-pre-wrap">
        {argsText}
      </pre>
    </div>
  );
}

const RESULT_COLLAPSE_THRESHOLD = 400; // chars before we truncate

function ToolFallbackResult({
  result,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  result?: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const labelId = useId();

  if (result === undefined) return null;

  const resultText =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const isLong = resultText.length > RESULT_COLLAPSE_THRESHOLD;
  const showToggle = isLong;

  return (
    <div
      data-slot="tool-fallback-result"
      className={cn(
        "aui-tool-fallback-result border-t border-dashed px-4 pt-2",
        className,
      )}
      {...props}
    >
      <p id={labelId} className="aui-tool-fallback-result-header font-semibold">
        Result:
      </p>
      <div className="relative">
        <pre
          aria-labelledby={labelId}
          className={cn(
            "aui-tool-fallback-result-content whitespace-pre-wrap overflow-hidden transition-[max-height] duration-300 ease-in-out",
            !expanded && isLong ? "max-h-28" : "max-h-[9999px]",
          )}
        >
          {resultText}
        </pre>
        {/* Gradient fade overlay when collapsed */}
        {showToggle && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover/80 to-transparent"
          />
        )}
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          {expanded ? "↑ Show less" : "↓ Show more"}
        </button>
      )}
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  status?: ToolCallMessagePartStatus;
}) {
  if (status?.type !== "incomplete") return null;

  const error = status.error;
  const errorText = error
    ? typeof error === "string"
      ? error
      : JSON.stringify(error)
    : null;

  if (!errorText) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? "Cancelled reason:" : "Error:";

  return (
    <div
      data-slot="tool-fallback-error"
      className={cn("aui-tool-fallback-error px-4", className)}
      {...props}
    >
      <p className="aui-tool-fallback-error-header font-semibold text-muted-foreground">
        {headerText}
      </p>
      <p className="aui-tool-fallback-error-reason text-muted-foreground">
        {errorText}
      </p>
    </div>
  );
}

const ToolFallbackImpl: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
  status,
}) => {
  const isCancelled =
    status?.type === "incomplete" && status.reason === "cancelled";

  return (
    <ToolFallbackRoot
      className={cn(isCancelled && "border-muted-foreground/30 bg-muted/30")}
    >
      <ToolFallbackTrigger toolName={toolName} argsText={argsText} status={status} />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        <ToolArgsRenderer
          toolName={toolName}
          argsText={argsText}
        />
        {!isCancelled && (
          <ToolResultRenderer toolName={toolName} result={result} />
        )}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
};

const ToolFallback = memo(
  ToolFallbackImpl,
) as unknown as ToolCallMessagePartComponent & {
  Root: typeof ToolFallbackRoot;
  Trigger: typeof ToolFallbackTrigger;
  Content: typeof ToolFallbackContent;
  Args: typeof ToolFallbackArgs;
  Result: typeof ToolFallbackResult;
  Error: typeof ToolFallbackError;
};

ToolFallback.displayName = "ToolFallback";
ToolFallback.Root = ToolFallbackRoot;
ToolFallback.Trigger = ToolFallbackTrigger;
ToolFallback.Content = ToolFallbackContent;
ToolFallback.Args = ToolFallbackArgs;
ToolFallback.Result = ToolFallbackResult;
ToolFallback.Error = ToolFallbackError;

export {
  ToolFallback,
  ToolFallbackRoot,
  ToolFallbackTrigger,
  ToolFallbackContent,
  ToolFallbackArgs,
  ToolFallbackResult,
  ToolFallbackError,
};
