"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ChatView } from "@/components/chat-view";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const initialSessionId = searchParams.get("session") ?? undefined;
  const cwd = searchParams.get("cwd") ?? undefined;

  return <ChatView initialSessionId={initialSessionId} cwd={cwd} />;
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
