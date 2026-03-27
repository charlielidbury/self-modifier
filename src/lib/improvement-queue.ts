/**
 * Persistent improvement queue — a prioritized backlog of improvement ideas
 * that the self-improve agent works through in order.
 *
 * Stored in .self-improve-queue.json at the project root.
 */

import fs from "fs";
import path from "path";

export type QueueItem = {
  id: string;
  text: string;
  priority: number; // lower = higher priority (0 = top)
  createdAt: string; // ISO
  status: "pending" | "in-progress" | "done" | "skipped";
  completedAt?: string;
  commitHash?: string; // if completed, which commit fulfilled it
};

type QueueData = {
  items: QueueItem[];
};

const QUEUE_FILE = path.resolve(process.cwd(), ".self-improve-queue.json");

function readQueue(): QueueData {
  try {
    const raw = fs.readFileSync(QUEUE_FILE, "utf-8");
    const data = JSON.parse(raw) as QueueData;
    if (!Array.isArray(data.items)) return { items: [] };
    return data;
  } catch {
    return { items: [] };
  }
}

function writeQueue(data: QueueData): void {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Get all queue items, ordered by priority */
export function getQueue(): QueueItem[] {
  const data = readQueue();
  return data.items.sort((a, b) => a.priority - b.priority);
}

/** Add an item to the end of the queue */
export function addToQueue(text: string): QueueItem {
  const data = readQueue();
  const maxPriority = data.items.reduce(
    (max, item) => Math.max(max, item.priority),
    -1
  );
  const item: QueueItem = {
    id: crypto.randomUUID(),
    text: text.trim(),
    priority: maxPriority + 1,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  data.items.push(item);
  writeQueue(data);
  return item;
}

/** Remove an item from the queue */
export function removeFromQueue(id: string): boolean {
  const data = readQueue();
  const before = data.items.length;
  data.items = data.items.filter((item) => item.id !== id);
  if (data.items.length === before) return false;
  writeQueue(data);
  return true;
}

/** Move an item to a new priority position (reorders everything) */
export function reorderQueue(id: string, newIndex: number): QueueItem[] {
  const data = readQueue();
  data.items.sort((a, b) => a.priority - b.priority);

  const currentIndex = data.items.findIndex((item) => item.id === id);
  if (currentIndex === -1) return data.items;

  // Remove from current position and insert at new position
  const [item] = data.items.splice(currentIndex, 1);
  const clampedIndex = Math.max(0, Math.min(newIndex, data.items.length));
  data.items.splice(clampedIndex, 0, item);

  // Re-assign priorities based on new order
  data.items.forEach((item, i) => {
    item.priority = i;
  });

  writeQueue(data);
  return data.items;
}

/** Pop the next pending item for the agent to work on.
 * Returns the item (marked as in-progress) or null if the queue is empty. */
export function popNextItem(): QueueItem | null {
  const data = readQueue();
  data.items.sort((a, b) => a.priority - b.priority);

  const next = data.items.find((item) => item.status === "pending");
  if (!next) return null;

  next.status = "in-progress";
  writeQueue(data);
  return next;
}

/** Mark an in-progress item as done */
export function completeItem(id: string, commitHash?: string): void {
  const data = readQueue();
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "done";
  item.completedAt = new Date().toISOString();
  if (commitHash) item.commitHash = commitHash;
  writeQueue(data);
}

/** Mark an in-progress item as skipped (agent couldn't do it / it failed) */
export function skipItem(id: string): void {
  const data = readQueue();
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "skipped";
  item.completedAt = new Date().toISOString();
  writeQueue(data);
}

/** Reset a done/skipped item back to pending */
export function requeueItem(id: string): void {
  const data = readQueue();
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  item.status = "pending";
  delete item.completedAt;
  delete item.commitHash;
  writeQueue(data);
}

/** Clear all done/skipped items from the queue */
export function clearCompleted(): number {
  const data = readQueue();
  const before = data.items.length;
  data.items = data.items.filter(
    (item) => item.status !== "done" && item.status !== "skipped"
  );
  writeQueue(data);
  return before - data.items.length;
}
