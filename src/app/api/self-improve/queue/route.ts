import {
  getQueue,
  addToQueue,
  removeFromQueue,
  reorderQueue,
  completeItem,
  skipItem,
  requeueItem,
  clearCompleted,
} from "@/lib/improvement-queue";

export async function GET() {
  return Response.json({ items: getQueue() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action: string;
    text?: string;
    id?: string;
    newIndex?: number;
    commitHash?: string;
  };

  switch (body.action) {
    case "add": {
      if (!body.text?.trim()) {
        return Response.json({ error: "text is required" }, { status: 400 });
      }
      const item = addToQueue(body.text);
      return Response.json({ item, items: getQueue() });
    }

    case "remove": {
      if (!body.id) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }
      removeFromQueue(body.id);
      return Response.json({ items: getQueue() });
    }

    case "reorder": {
      if (!body.id || body.newIndex === undefined) {
        return Response.json(
          { error: "id and newIndex are required" },
          { status: 400 }
        );
      }
      const items = reorderQueue(body.id, body.newIndex);
      return Response.json({ items });
    }

    case "complete": {
      if (!body.id) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }
      completeItem(body.id, body.commitHash);
      return Response.json({ items: getQueue() });
    }

    case "skip": {
      if (!body.id) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }
      skipItem(body.id);
      return Response.json({ items: getQueue() });
    }

    case "requeue": {
      if (!body.id) {
        return Response.json({ error: "id is required" }, { status: 400 });
      }
      requeueItem(body.id);
      return Response.json({ items: getQueue() });
    }

    case "clear-completed": {
      const removed = clearCompleted();
      return Response.json({ removed, items: getQueue() });
    }

    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
