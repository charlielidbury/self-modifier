"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  Shuffle,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type BarState = "default" | "comparing" | "swapping" | "sorted" | "pivot";

interface Bar {
  value: number;
  state: BarState;
}

type AlgorithmName =
  | "bubble"
  | "selection"
  | "insertion"
  | "merge"
  | "quick"
  | "heap"
  | "shell"
  | "cocktail";

interface AlgorithmInfo {
  name: string;
  complexity: string;
  description: string;
}

const ALGORITHMS: Record<AlgorithmName, AlgorithmInfo> = {
  bubble: {
    name: "Bubble Sort",
    complexity: "O(n²)",
    description: "Repeatedly steps through the list, swapping adjacent elements that are in the wrong order.",
  },
  selection: {
    name: "Selection Sort",
    complexity: "O(n²)",
    description: "Finds the minimum element and places it at the beginning, then repeats for the remaining.",
  },
  insertion: {
    name: "Insertion Sort",
    complexity: "O(n²)",
    description: "Builds the sorted array one item at a time by inserting each element into its correct position.",
  },
  merge: {
    name: "Merge Sort",
    complexity: "O(n log n)",
    description: "Divides the array in half, recursively sorts each half, then merges them back together.",
  },
  quick: {
    name: "Quick Sort",
    complexity: "O(n log n)",
    description: "Picks a pivot element and partitions the array around it, then recursively sorts each partition.",
  },
  heap: {
    name: "Heap Sort",
    complexity: "O(n log n)",
    description: "Builds a max-heap from the array, then repeatedly extracts the maximum to build the sorted result.",
  },
  shell: {
    name: "Shell Sort",
    complexity: "O(n log² n)",
    description: "Generalisation of insertion sort that allows exchanging items far apart, using a gap sequence.",
  },
  cocktail: {
    name: "Cocktail Shaker",
    complexity: "O(n²)",
    description: "Variation of bubble sort that traverses in both directions, like shaking a cocktail.",
  },
};

// ── Colour palette ───────────────────────────────────────────────────────────

const BAR_COLORS: Record<BarState, string> = {
  default: "hsl(210, 60%, 55%)",
  comparing: "hsl(45, 95%, 55%)",
  swapping: "hsl(0, 85%, 58%)",
  sorted: "hsl(145, 65%, 48%)",
  pivot: "hsl(280, 70%, 60%)",
};

// ── Sound ────────────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function playTone(value: number, max: number) {
  if (!audioCtx) audioCtx = new AudioContext();
  const freq = 200 + (value / max) * 800;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0.04;
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

// ── Array helpers ────────────────────────────────────────────────────────────

function generateArray(size: number): Bar[] {
  const arr: Bar[] = [];
  for (let i = 1; i <= size; i++) {
    arr.push({ value: i, state: "default" });
  }
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Sorting generators ──────────────────────────────────────────────────────
// Each generator yields snapshots of the array for visualisation.

type SortStep = { array: Bar[]; comparisons: number; swaps: number };

function* bubbleSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - i - 1; j++) {
      arr[j].state = "comparing";
      arr[j + 1].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };

      if (arr[j].value > arr[j + 1].value) {
        arr[j].state = "swapping";
        arr[j + 1].state = "swapping";
        swaps++;
        yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
      arr[j].state = "default";
      arr[j + 1].state = "default";
    }
    arr[n - i - 1].state = "sorted";
  }
  arr[0].state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* selectionSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    arr[minIdx].state = "pivot";
    for (let j = i + 1; j < n; j++) {
      arr[j].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      if (arr[j].value < arr[minIdx].value) {
        arr[minIdx].state = minIdx === i ? "default" : "default";
        minIdx = j;
        arr[minIdx].state = "pivot";
      } else {
        arr[j].state = "default";
      }
    }
    if (minIdx !== i) {
      arr[i].state = "swapping";
      arr[minIdx].state = "swapping";
      swaps++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
    }
    for (let k = i + 1; k < n; k++) if (arr[k].state !== "sorted") arr[k].state = "default";
    arr[i].state = "sorted";
  }
  arr[n - 1].state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* insertionSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;
  arr[0].state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
  for (let i = 1; i < n; i++) {
    const key = { ...arr[i] };
    arr[i].state = "comparing";
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    let j = i - 1;
    while (j >= 0 && arr[j].value > key.value) {
      comparisons++;
      arr[j].state = "swapping";
      arr[j + 1] = { ...arr[j] };
      swaps++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      arr[j].state = "sorted";
      j--;
    }
    if (j >= 0) comparisons++;
    arr[j + 1] = { ...key, state: "sorted" };
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
  }
}

function* mergeSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;

  function* merge(left: number, mid: number, right: number): Generator<SortStep> {
    const temp: Bar[] = [];
    let i = left,
      j = mid + 1;
    while (i <= mid && j <= right) {
      arr[i].state = "comparing";
      arr[j].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      if (arr[i].value <= arr[j].value) {
        arr[i].state = "default";
        temp.push({ ...arr[i++] });
      } else {
        arr[j].state = "default";
        temp.push({ ...arr[j++] });
      }
      swaps++;
    }
    while (i <= mid) temp.push({ ...arr[i++] });
    while (j <= right) temp.push({ ...arr[j++] });
    for (let k = 0; k < temp.length; k++) {
      arr[left + k] = { ...temp[k], state: "swapping" };
    }
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    for (let k = left; k <= right; k++) arr[k].state = "default";
  }

  function* sort(left: number, right: number): Generator<SortStep> {
    if (left >= right) return;
    const mid = Math.floor((left + right) / 2);
    yield* sort(left, mid);
    yield* sort(mid + 1, right);
    yield* merge(left, mid, right);
  }

  yield* sort(0, n - 1);
  for (const b of arr) b.state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* quickSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;

  function* partition(low: number, high: number): Generator<SortStep, number> {
    const pivotVal = arr[high].value;
    arr[high].state = "pivot";
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    let i = low - 1;
    for (let j = low; j < high; j++) {
      arr[j].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      if (arr[j].value < pivotVal) {
        i++;
        arr[i].state = "swapping";
        arr[j].state = "swapping";
        swaps++;
        yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (arr[j].state !== "pivot") arr[j].state = "default";
      if (i >= low && arr[i].state !== "pivot") arr[i].state = "default";
    }
    i++;
    arr[i].state = "swapping";
    arr[high].state = "swapping";
    swaps++;
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    [arr[i], arr[high]] = [arr[high], arr[i]];
    arr[i].state = "sorted";
    for (let k = low; k <= high; k++) {
      if (arr[k].state !== "sorted") arr[k].state = "default";
    }
    return i;
  }

  function* sort(low: number, high: number): Generator<SortStep> {
    if (low >= high) {
      if (low === high) arr[low].state = "sorted";
      return;
    }
    const pi: number = yield* partition(low, high);
    yield* sort(low, pi - 1);
    yield* sort(pi + 1, high);
  }

  yield* sort(0, arr.length - 1);
  for (const b of arr) b.state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* heapSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;

  function* heapify(size: number, root: number): Generator<SortStep> {
    let largest = root;
    const left = 2 * root + 1;
    const right = 2 * root + 2;
    if (left < size) {
      arr[left].state = "comparing";
      comparisons++;
      if (arr[left].value > arr[largest].value) largest = left;
    }
    if (right < size) {
      arr[right].state = "comparing";
      comparisons++;
      if (arr[right].value > arr[largest].value) largest = right;
    }
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    if (left < size && arr[left].state === "comparing") arr[left].state = "default";
    if (right < size && arr[right].state === "comparing") arr[right].state = "default";

    if (largest !== root) {
      arr[root].state = "swapping";
      arr[largest].state = "swapping";
      swaps++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      [arr[root], arr[largest]] = [arr[largest], arr[root]];
      arr[root].state = "default";
      arr[largest].state = "default";
      yield* heapify(size, largest);
    }
  }

  // Build max heap
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
    yield* heapify(n, i);
  }

  // Extract from heap
  for (let i = n - 1; i > 0; i--) {
    arr[0].state = "swapping";
    arr[i].state = "swapping";
    swaps++;
    yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
    [arr[0], arr[i]] = [arr[i], arr[0]];
    arr[i].state = "sorted";
    arr[0].state = "default";
    yield* heapify(i, 0);
  }
  arr[0].state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* shellSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  const n = arr.length;

  for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
    for (let i = gap; i < n; i++) {
      const temp = { ...arr[i] };
      arr[i].state = "comparing";
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      let j = i;
      while (j >= gap && arr[j - gap].value > temp.value) {
        comparisons++;
        arr[j - gap].state = "swapping";
        arr[j] = { ...arr[j - gap] };
        swaps++;
        yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
        arr[j].state = "default";
        arr[j - gap].state = "default";
        j -= gap;
      }
      if (j >= gap) comparisons++;
      arr[j] = { ...temp, state: "default" };
    }
  }
  for (const b of arr) b.state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function* cocktailSort(input: Bar[]): Generator<SortStep> {
  const arr = input.map((b) => ({ ...b }));
  let comparisons = 0;
  let swaps = 0;
  let start = 0;
  let end = arr.length - 1;
  let swapped = true;

  while (swapped) {
    swapped = false;
    for (let i = start; i < end; i++) {
      arr[i].state = "comparing";
      arr[i + 1].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      if (arr[i].value > arr[i + 1].value) {
        arr[i].state = "swapping";
        arr[i + 1].state = "swapping";
        swaps++;
        yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        swapped = true;
      }
      arr[i].state = "default";
      arr[i + 1].state = "default";
    }
    arr[end].state = "sorted";
    end--;
    if (!swapped) break;
    swapped = false;
    for (let i = end; i > start; i--) {
      arr[i].state = "comparing";
      arr[i - 1].state = "comparing";
      comparisons++;
      yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
      if (arr[i].value < arr[i - 1].value) {
        arr[i].state = "swapping";
        arr[i - 1].state = "swapping";
        swaps++;
        yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        swapped = true;
      }
      arr[i].state = "default";
      arr[i - 1].state = "default";
    }
    arr[start].state = "sorted";
    start++;
  }
  for (const b of arr) b.state = "sorted";
  yield { array: arr.map((b) => ({ ...b })), comparisons, swaps };
}

function getSortGenerator(name: AlgorithmName, arr: Bar[]): Generator<SortStep> {
  switch (name) {
    case "bubble": return bubbleSort(arr);
    case "selection": return selectionSort(arr);
    case "insertion": return insertionSort(arr);
    case "merge": return mergeSort(arr);
    case "quick": return quickSort(arr);
    case "heap": return heapSort(arr);
    case "shell": return shellSort(arr);
    case "cocktail": return cocktailSort(arr);
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SortingPage() {
  const [size, setSize] = useState(60);
  const [speed, setSpeed] = useState(85);
  const [algorithm, setAlgorithm] = useState<AlgorithmName>("quick");
  const [bars, setBars] = useState<Bar[]>(() => generateArray(60));
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [comparisons, setComparisons] = useState(0);
  const [swapCount, setSwapCount] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const generatorRef = useRef<Generator<SortStep> | null>(null);
  const runningRef = useRef(false);
  const soundRef = useRef(true);
  const speedRef = useRef(85);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barsRef = useRef<Bar[]>(bars);
  const animFrameRef = useRef(0);

  soundRef.current = soundOn;
  speedRef.current = speed;
  barsRef.current = bars;

  // Draw bars on canvas for performance
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const arr = barsRef.current;
    const n = arr.length;
    const gap = n > 100 ? 0 : n > 50 ? 1 : 2;
    const totalGap = gap * (n - 1);
    const barWidth = Math.max(1, (rect.width - totalGap) / n);
    const maxVal = n;

    for (let i = 0; i < n; i++) {
      const barHeight = (arr[i].value / maxVal) * (rect.height - 4);
      const x = i * (barWidth + gap);
      const y = rect.height - barHeight;

      // Gradient effect for default bars
      if (arr[i].state === "default") {
        const grad = ctx.createLinearGradient(x, y, x, rect.height);
        grad.addColorStop(0, "hsl(210, 70%, 60%)");
        grad.addColorStop(1, "hsl(210, 50%, 40%)");
        ctx.fillStyle = grad;
      } else if (arr[i].state === "sorted") {
        const grad = ctx.createLinearGradient(x, y, x, rect.height);
        grad.addColorStop(0, "hsl(145, 70%, 55%)");
        grad.addColorStop(1, "hsl(145, 55%, 35%)");
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = BAR_COLORS[arr[i].state];
      }

      if (barWidth >= 3) {
        ctx.beginPath();
        const r = Math.min(2, barWidth / 3);
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, rect.height);
        ctx.lineTo(x, rect.height);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    }
  }, []);

  // Redraw whenever bars change
  useEffect(() => {
    draw();
  }, [bars, draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => draw());
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  // Main sorting loop
  const step = useCallback(() => {
    if (!runningRef.current || !generatorRef.current) return;

    // Speed maps: 0=slowest (100ms), 100=fastest (0ms)
    // We do multiple steps per frame at high speeds
    const stepsPerFrame = speedRef.current > 90 ? 8 : speedRef.current > 70 ? 3 : 1;
    const delayMs = Math.max(0, Math.round((100 - speedRef.current) * 1.5));

    let lastResult: SortStep | null = null;
    for (let s = 0; s < stepsPerFrame; s++) {
      const result = generatorRef.current.next();
      if (result.done) {
        runningRef.current = false;
        setRunning(false);
        setDone(true);
        if (lastResult) {
          setBars(lastResult.array);
          setComparisons(lastResult.comparisons);
          setSwapCount(lastResult.swaps);
        }
        // Final sweep animation
        const finalArr = barsRef.current.map((b) => ({ ...b, state: "sorted" as BarState }));
        setBars(finalArr);
        return;
      }
      lastResult = result.value;
    }

    if (lastResult) {
      setBars(lastResult.array);
      setComparisons(lastResult.comparisons);
      setSwapCount(lastResult.swaps);

      // Play sound for comparing/swapping bars
      if (soundRef.current) {
        const active = lastResult.array.find(
          (b) => b.state === "comparing" || b.state === "swapping"
        );
        if (active) playTone(active.value, lastResult.array.length);
      }
    }

    if (delayMs > 0) {
      setTimeout(() => {
        animFrameRef.current = requestAnimationFrame(step);
      }, delayMs);
    } else {
      animFrameRef.current = requestAnimationFrame(step);
    }
  }, []);

  const startSort = useCallback(() => {
    if (done) {
      // Reset first
      const newArr = generateArray(size);
      setBars(newArr);
      barsRef.current = newArr;
      setComparisons(0);
      setSwapCount(0);
      setDone(false);
      generatorRef.current = getSortGenerator(algorithm, newArr);
    } else if (!generatorRef.current) {
      generatorRef.current = getSortGenerator(algorithm, barsRef.current);
    }
    runningRef.current = true;
    setRunning(true);
    animFrameRef.current = requestAnimationFrame(step);
  }, [algorithm, done, size, step]);

  const pauseSort = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  const resetArray = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setDone(false);
    cancelAnimationFrame(animFrameRef.current);
    generatorRef.current = null;
    const newArr = generateArray(size);
    setBars(newArr);
    barsRef.current = newArr;
    setComparisons(0);
    setSwapCount(0);
  }, [size]);

  const shuffleArray = useCallback(() => {
    if (running) return;
    generatorRef.current = null;
    setDone(false);
    const newArr = generateArray(size);
    setBars(newArr);
    barsRef.current = newArr;
    setComparisons(0);
    setSwapCount(0);
  }, [running, size]);

  // Handle size changes
  useEffect(() => {
    if (!running) {
      generatorRef.current = null;
      setDone(false);
      const newArr = generateArray(size);
      setBars(newArr);
      barsRef.current = newArr;
      setComparisons(0);
      setSwapCount(0);
    }
  }, [size, running]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      runningRef.current = false;
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " ") {
        e.preventDefault();
        if (running) pauseSort();
        else startSort();
      } else if (e.key === "r" || e.key === "R") {
        resetArray();
      } else if (e.key === "s" || e.key === "S") {
        shuffleArray();
      } else if (e.key === "m" || e.key === "M") {
        setSoundOn((p) => !p);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [running, pauseSort, startSort, resetArray, shuffleArray]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick() { setDropdownOpen(false); }
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [dropdownOpen]);

  const algoInfo = ALGORITHMS[algorithm];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Controls bar */}
      <div className="flex-none border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          {/* Algorithm selector */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!running) setDropdownOpen((p) => !p);
              }}
              disabled={running}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{algoInfo.name}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-border bg-popover shadow-xl z-50 py-1 overflow-hidden">
                {(Object.entries(ALGORITHMS) as [AlgorithmName, AlgorithmInfo][]).map(
                  ([key, info]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setAlgorithm(key);
                        setDropdownOpen(false);
                        if (!running) {
                          generatorRef.current = null;
                          setDone(false);
                          setComparisons(0);
                          setSwapCount(0);
                          const newArr = generateArray(size);
                          setBars(newArr);
                          barsRef.current = newArr;
                        }
                      }}
                      className={[
                        "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors",
                        key === algorithm
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground/80 hover:bg-accent/50",
                      ].join(" ")}
                    >
                      <span>{info.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {info.complexity}
                      </span>
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Play / Pause */}
          <button
            onClick={() => (running ? pauseSort() : startSort())}
            className={[
              "flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all",
              running
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30"
                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30",
            ].join(" ")}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            <span className="hidden sm:inline">{running ? "Pause" : done ? "Restart" : "Sort"}</span>
          </button>

          {/* Shuffle */}
          <button
            onClick={shuffleArray}
            disabled={running}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Shuffle (S)"
          >
            <Shuffle size={14} />
            <span className="hidden sm:inline">Shuffle</span>
          </button>

          {/* Reset */}
          <button
            onClick={resetArray}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Reset (R)"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <div className="hidden sm:block w-px h-6 bg-border" />

          {/* Size slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              Size: {size}
            </span>
            <input
              type="range"
              min={10}
              max={200}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              disabled={running}
              className="w-20 sm:w-28 accent-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Speed slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              Speed: {speed}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-20 sm:w-28 accent-blue-500"
            />
          </div>

          <div className="hidden sm:block w-px h-6 bg-border" />

          {/* Sound toggle */}
          <button
            onClick={() => setSoundOn((p) => !p)}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            title="Toggle sound (M)"
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground font-mono">
            <span>
              Comparisons:{" "}
              <span className="text-foreground font-semibold">{comparisons.toLocaleString()}</span>
            </span>
            <span>
              Swaps:{" "}
              <span className="text-foreground font-semibold">{swapCount.toLocaleString()}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Algorithm description */}
      <div className="flex-none px-4 py-2 bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto flex items-center gap-3 text-xs">
          <span className="font-mono font-semibold text-foreground/70">{algoInfo.complexity}</span>
          <span className="text-muted-foreground">{algoInfo.description}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.comparing }} />
              Comparing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.swapping }} />
              Swapping
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.pivot }} />
              Pivot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BAR_COLORS.sorted }} />
              Sorted
            </span>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 p-4 sm:p-6 flex items-end">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ imageRendering: size > 100 ? "pixelated" : "auto" }}
        />
      </div>

      {/* Footer with keyboard shortcuts */}
      <div className="flex-none border-t border-border px-4 py-2 bg-muted/20">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-6 text-[11px] text-muted-foreground/60">
          {[
            ["Space", "Play/Pause"],
            ["S", "Shuffle"],
            ["R", "Reset"],
            ["M", "Sound"],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
