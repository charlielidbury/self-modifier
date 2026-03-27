"use client";

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  MoreHorizontalIcon,
  MoonIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  SunIcon,
} from "lucide-react";
import { useMemo, useState, type FC, type ElementType } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-background relative overflow-hidden"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-radius" as string]: "24px",
        ["--composer-padding" as string]: "10px",
      }}
    >
      {/* Thin shimmer bar shown while the AI is generating a response */}
      <AuiIf condition={(s) => s.thread.isRunning}>
        <div
          className="fade-in animate-in fill-mode-both duration-300 absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-20 text-primary/50"
          aria-hidden="true"
        >
          <div className="ai-progress-bar-shimmer" />
        </div>
      </AuiIf>
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4"
      >
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <ThreadWelcome />
        </AuiIf>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            EditComposer,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer sticky bottom-0 mx-auto mt-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible rounded-t-(--composer-radius) bg-background pb-4 md:pb-6">
          <ThreadScrollToBottom />
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

type Greeting = { text: string; subtext: string; Icon: ElementType };

function getGreeting(): Greeting {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return {
      text: "Good morning!",
      subtext: "What can I help you with today?",
      Icon: SunIcon,
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      text: "Good afternoon!",
      subtext: "How can I help you today?",
      Icon: SunIcon,
    };
  } else if (hour >= 17 && hour < 22) {
    return {
      text: "Good evening!",
      subtext: "What can I assist you with tonight?",
      Icon: MoonIcon,
    };
  } else {
    return {
      text: "Still up?",
      subtext: "I'm here whenever you need me.",
      Icon: MoonIcon,
    };
  }
}

const ThreadWelcome: FC = () => {
  const { text, subtext, Icon } = useMemo(getGreeting, []);

  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <div className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both duration-200 mb-3">
            <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="size-6" />
            </div>
          </div>
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200">
            {text}
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
            {subtext}
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const HARDCODED_SUGGESTIONS: {
  prompt: string;
  title: string;
  description: string;
  icon: ElementType;
  accentBg: string;
  accentText: string;
  hoverBorder: string;
}[] = [
  {
    prompt: "What pages and features does this app have?",
    title: "Explore the app",
    description: "Get an overview of all features",
    icon: LayoutDashboardIcon,
    accentBg: "bg-blue-500/10 dark:bg-blue-500/15",
    accentText: "text-blue-600 dark:text-blue-400",
    hoverBorder: "hover:border-blue-400/40 dark:hover:border-blue-500/40",
  },
  {
    prompt: "Look at the codebase and suggest a meaningful improvement you could make",
    title: "Suggest an improvement",
    description: "Ideas for enhancing this app",
    icon: LightbulbIcon,
    accentBg: "bg-amber-500/10 dark:bg-amber-500/15",
    accentText: "text-amber-600 dark:text-amber-400",
    hoverBorder: "hover:border-amber-400/40 dark:hover:border-amber-500/40",
  },
  {
    prompt: "What is the most interesting or complex part of this codebase?",
    title: "Explore the code",
    description: "Learn about the architecture",
    icon: Code2Icon,
    accentBg: "bg-green-500/10 dark:bg-green-500/15",
    accentText: "text-green-600 dark:text-green-400",
    hoverBorder: "hover:border-green-400/40 dark:hover:border-green-500/40",
  },
  {
    prompt: "Make a small but meaningful visual polish improvement to the UI",
    title: "Polish the UI",
    description: "Enhance the look and feel",
    icon: SparklesIcon,
    accentBg: "bg-violet-500/10 dark:bg-violet-500/15",
    accentText: "text-violet-600 dark:text-violet-400",
    hoverBorder: "hover:border-violet-400/40 dark:hover:border-violet-500/40",
  },
];

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
      {HARDCODED_SUGGESTIONS.map((s, i) => (
        <div
          key={i}
          className={cn(
            "fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200",
            i >= 2 && "hidden @md:block"
          )}
          style={{ animationDelay: `${(i + 1) * 75}ms` }}
        >
          <ThreadPrimitive.Suggestion prompt={s.prompt} send asChild>
            <Button
              variant="ghost"
              className={cn(
                "h-auto w-full flex-row items-center justify-start gap-3 rounded-3xl border bg-background px-4 py-3 text-left text-sm transition-colors hover:bg-muted",
                s.hoverBorder
              )}
            >
              <div className={cn("shrink-0 flex size-8 items-center justify-center rounded-xl", s.accentBg, s.accentText)}>
                <s.icon className="size-4" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted-foreground text-xs empty:hidden">
                  {s.description}
                </span>
              </div>
            </Button>
          </ThreadPrimitive.Suggestion>
        </div>
      ))}
    </div>
  );
};

const Composer: FC = () => {
  const [charCount, setCharCount] = useState(0);

  return (
    <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="composer-shell"
          className="flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-background p-(--composer-padding) transition-shadow focus-within:border-ring/75 focus-within:ring-2 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            placeholder="Send a message..."
            className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none placeholder:text-muted-foreground/80"
            rows={1}
            autoFocus
            aria-label="Message input"
            onChange={(e) => setCharCount(e.target.value.length)}
          />
          <ComposerAction charCount={charCount} />
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{ charCount?: number }> = ({ charCount = 0 }) => {
  const isWarning = charCount > 1500 && charCount <= 3000;
  const isDanger = charCount > 3000;
  const displayCount =
    charCount > 999
      ? `${(charCount / 1000).toFixed(1)}k`
      : String(charCount);

  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <ComposerAddAttachment />
      <div className="flex items-center gap-2">
        {/* Keyboard hint — visible only while the user is typing */}
        <span
          className={cn(
            "hidden sm:block text-[10px] text-muted-foreground/35 select-none pointer-events-none transition-all duration-150",
            charCount > 0 ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        >
          ↵ send · ⇧↵ newline
        </span>
        <span
          className={cn(
            "text-[11px] tabular-nums transition-all duration-150",
            charCount === 0
              ? "opacity-0 pointer-events-none select-none"
              : isDanger
              ? "opacity-100 text-red-500/70"
              : isWarning
              ? "opacity-100 text-amber-500/70"
              : "opacity-100 text-muted-foreground/60",
          )}
          aria-live="polite"
          aria-label={`${charCount} characters`}
          title={charCount > 999 ? `${charCount} characters` : undefined}
        >
          {displayCount}
        </span>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-8 rounded-full"
              aria-label="Send message"
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-8 rounded-full"
              aria-label="Stop generating"
            >
              <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm dark:bg-destructive/5 dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

/** Counts words and estimates reading time for a completed assistant message. */
const MessageWordCount: FC = () => {
  const content = useMessage((m) => m.content);
  const isRunning = useMessage((m) => m.status?.type === "running");

  const wordCount = useMemo(() => {
    if (!content) return 0;
    return content
      .filter(
        (p): p is { type: "text"; text: string } => p.type === "text"
      )
      .map((p) => p.text)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }, [content]);

  // Only show for complete messages with at least 30 words
  if (isRunning || wordCount < 30) return null;

  const readingMinutes = Math.round(wordCount / 200);
  const readingTime =
    readingMinutes < 1 ? "<1 min read" : `${readingMinutes} min read`;

  return (
    <span className="text-[11px] tabular-nums text-muted-foreground/40 select-none leading-none">
      {wordCount.toLocaleString()} words · {readingTime}
    </span>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full max-w-(--thread-max-width) animate-in py-3 duration-150"
      data-role="assistant"
    >
      <div className="aui-assistant-message-content wrap-break-word px-2 text-foreground leading-relaxed">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            tools: { Fallback: ToolFallback },
          }}
        />
        <MessageError />
      </div>

      <div className="aui-assistant-message-footer mt-1 ml-2 flex min-h-6 items-center justify-between">
        <div className="flex items-center">
          <BranchPicker />
          <AssistantActionBar />
        </div>
        <MessageWordCount />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-1 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto grid w-full max-w-(--thread-max-width) animate-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 py-3 duration-150 [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content wrap-break-word rounded-2xl bg-muted px-4 py-2.5 text-foreground">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy" className="aui-user-action-copy">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2 py-3">
      <ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col rounded-2xl bg-muted">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">Update</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
