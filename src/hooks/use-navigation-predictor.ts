"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Predictive Navigation Prefetcher
 *
 * A lightweight Markov chain that learns page-to-page transition patterns
 * from real user behaviour. On every navigation, it:
 *   1. Records the transition (prev → current) in a frequency matrix
 *   2. Looks up the top-N most likely next pages from the current page
 *   3. Calls <link rel="prefetch"> on those routes so the browser fetches
 *      the JS bundles before the user clicks
 *
 * The transition matrix is persisted in localStorage so it improves over
 * time across sessions. It decays old data exponentially so stale patterns
 * don't dominate.
 *
 * Typical memory: ~2KB for 20 pages × 20 pages of transition counts.
 */

const STORAGE_KEY = "nav-markov-matrix";
const MAX_PREFETCH = 2; // prefetch top 2 predictions
const DECAY_FACTOR = 0.95; // slight decay on every visit to favour recent patterns
const MIN_CONFIDENCE = 0.15; // don't prefetch if probability < 15%

type TransitionMatrix = Record<string, Record<string, number>>;

function loadMatrix(): TransitionMatrix {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMatrix(matrix: TransitionMatrix): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrix));
  } catch {
    // storage full — silently ignore
  }
}

/** Apply exponential decay to all transitions from a given source page */
function decayRow(row: Record<string, number>): void {
  for (const key of Object.keys(row)) {
    row[key] *= DECAY_FACTOR;
    if (row[key] < 0.01) delete row[key]; // prune noise
  }
}

/** Get the top-N predicted next pages from the current page */
function predict(
  matrix: TransitionMatrix,
  currentPath: string,
  topN: number
): { path: string; probability: number }[] {
  const row = matrix[currentPath];
  if (!row) return [];

  const total = Object.values(row).reduce((s, v) => s + v, 0);
  if (total === 0) return [];

  return Object.entries(row)
    .map(([path, count]) => ({ path, probability: count / total }))
    .filter((p) => p.probability >= MIN_CONFIDENCE)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, topN);
}

/** Inject <link rel="prefetch"> for a route's page JS */
function prefetchRoute(path: string): void {
  // Use Next.js-style prefetch by creating a hidden link element.
  // The browser will fetch the page's JS bundle in idle time.
  const id = `nav-prefetch-${path.replace(/\//g, "_")}`;
  if (document.getElementById(id)) return; // already prefetching

  const link = document.createElement("link");
  link.id = id;
  link.rel = "prefetch";
  link.href = path; // Next.js will serve the page JS for this route
  link.as = "document";
  document.head.appendChild(link);

  // Clean up after 30s to avoid accumulating stale prefetch links
  setTimeout(() => link.remove(), 30_000);
}

/**
 * Hook: call once in the root layout or navbar.
 * It observes pathname changes and learns + predicts navigation patterns.
 */
export function useNavigationPredictor(): {
  predictions: { path: string; probability: number }[];
} {
  const pathname = usePathname();
  const prevPathRef = useRef<string | null>(null);
  const predictionsRef = useRef<{ path: string; probability: number }[]>([]);

  useEffect(() => {
    const matrix = loadMatrix();
    const prev = prevPathRef.current;

    // 1. Record the transition
    if (prev && prev !== pathname) {
      if (!matrix[prev]) matrix[prev] = {};
      decayRow(matrix[prev]);
      matrix[prev][pathname] = (matrix[prev][pathname] ?? 0) + 1;
      saveMatrix(matrix);
    }

    // 2. Predict next pages from current location
    const predictions = predict(matrix, pathname, MAX_PREFETCH);
    predictionsRef.current = predictions;

    // 3. Prefetch predicted routes
    for (const p of predictions) {
      prefetchRoute(p.path);
    }

    // Update ref for next transition
    prevPathRef.current = pathname;
  }, [pathname]);

  return { predictions: predictionsRef.current };
}
