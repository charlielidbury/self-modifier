"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Plus,
  Minus,
  Brain,
  Zap,
} from "lucide-react";

// ─── Neural Network from scratch ────────────────────────────────────────────

type ActivationFn = "relu" | "tanh" | "sigmoid";

const activate: Record<ActivationFn, (x: number) => number> = {
  relu: (x) => Math.max(0, x),
  tanh: (x) => Math.tanh(x),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
};

const activateDeriv: Record<ActivationFn, (x: number, out: number) => number> = {
  relu: (_x, out) => (out > 0 ? 1 : 0),
  tanh: (_x, out) => 1 - out * out,
  sigmoid: (_x, out) => out * (1 - out),
};

interface Layer {
  weights: Float64Array; // rows=outputSize, cols=inputSize  (row-major)
  biases: Float64Array;
  inputSize: number;
  outputSize: number;
}

interface Network {
  layers: Layer[];
  activation: ActivationFn;
}

function createNetwork(
  sizes: number[],
  activation: ActivationFn
): Network {
  const layers: Layer[] = [];
  for (let i = 0; i < sizes.length - 1; i++) {
    const inS = sizes[i];
    const outS = sizes[i + 1];
    const w = new Float64Array(outS * inS);
    const b = new Float64Array(outS);
    // Xavier initialization
    const scale = Math.sqrt(2 / (inS + outS));
    for (let j = 0; j < w.length; j++) w[j] = (Math.random() * 2 - 1) * scale;
    for (let j = 0; j < b.length; j++) b[j] = 0;
    layers.push({ weights: w, biases: b, inputSize: inS, outputSize: outS });
  }
  return { layers, activation };
}

function forward(net: Network, input: number[]): { preActs: number[][]; acts: number[][] } {
  const preActs: number[][] = [];
  const acts: number[][] = [input];
  let current = input;

  for (let l = 0; l < net.layers.length; l++) {
    const layer = net.layers[l];
    const pre: number[] = new Array(layer.outputSize);
    const act: number[] = new Array(layer.outputSize);
    const isLast = l === net.layers.length - 1;
    const fn = isLast ? activate.sigmoid : activate[net.activation];

    for (let j = 0; j < layer.outputSize; j++) {
      let sum = layer.biases[j];
      for (let i = 0; i < layer.inputSize; i++) {
        sum += layer.weights[j * layer.inputSize + i] * current[i];
      }
      pre[j] = sum;
      act[j] = fn(sum);
    }
    preActs.push(pre);
    acts.push(act);
    current = act;
  }
  return { preActs, acts };
}

function predict(net: Network, input: number[]): number {
  const { acts } = forward(net, input);
  return acts[acts.length - 1][0];
}

function trainBatch(
  net: Network,
  data: { x: number[]; y: number }[],
  lr: number
): number {
  const nLayers = net.layers.length;
  // Accumulate gradients
  const dWeights: Float64Array[] = net.layers.map((l) => new Float64Array(l.outputSize * l.inputSize));
  const dBiases: Float64Array[] = net.layers.map((l) => new Float64Array(l.outputSize));
  let totalLoss = 0;

  for (const sample of data) {
    const { preActs, acts } = forward(net, sample.x);
    const output = acts[acts.length - 1][0];
    const target = sample.y;

    // Binary cross-entropy loss
    const eps = 1e-7;
    const clipped = Math.max(eps, Math.min(1 - eps, output));
    totalLoss += -(target * Math.log(clipped) + (1 - target) * Math.log(1 - clipped));

    // Backprop
    const deltas: number[][] = new Array(nLayers);

    // Output layer delta (sigmoid + BCE simplifies to output - target)
    deltas[nLayers - 1] = [output - target];

    // Hidden layers
    for (let l = nLayers - 2; l >= 0; l--) {
      const layer = net.layers[l];
      const nextLayer = net.layers[l + 1];
      const delta: number[] = new Array(layer.outputSize);
      const fn = activateDeriv[net.activation];
      for (let j = 0; j < layer.outputSize; j++) {
        let sum = 0;
        for (let k = 0; k < nextLayer.outputSize; k++) {
          sum += nextLayer.weights[k * nextLayer.inputSize + j] * deltas[l + 1][k];
        }
        delta[j] = sum * fn(preActs[l][j], acts[l + 1][j]);
      }
      deltas[l] = delta;
    }

    // Accumulate
    for (let l = 0; l < nLayers; l++) {
      const layer = net.layers[l];
      for (let j = 0; j < layer.outputSize; j++) {
        dBiases[l][j] += deltas[l][j];
        for (let i = 0; i < layer.inputSize; i++) {
          dWeights[l][j * layer.inputSize + i] += deltas[l][j] * acts[l][i];
        }
      }
    }
  }

  // Apply gradients
  const scale = lr / data.length;
  for (let l = 0; l < nLayers; l++) {
    const layer = net.layers[l];
    for (let j = 0; j < layer.outputSize; j++) {
      layer.biases[j] -= scale * dBiases[l][j];
      for (let i = 0; i < layer.inputSize; i++) {
        layer.weights[j * layer.inputSize + i] -= scale * dWeights[l][j * layer.inputSize + i];
      }
    }
  }

  return totalLoss / data.length;
}

// ─── Dataset generators ─────────────────────────────────────────────────────

type DatasetName = "xor" | "circle" | "spiral" | "gaussian" | "moons";

function generateDataset(
  name: DatasetName,
  n: number = 300
): { x: number[]; y: number }[] {
  const data: { x: number[]; y: number }[] = [];

  switch (name) {
    case "xor": {
      for (let i = 0; i < n; i++) {
        const x1 = Math.random() * 2 - 1;
        const x2 = Math.random() * 2 - 1;
        data.push({ x: [x1, x2], y: x1 * x2 > 0 ? 1 : 0 });
      }
      break;
    }
    case "circle": {
      for (let i = 0; i < n; i++) {
        const x1 = Math.random() * 2 - 1;
        const x2 = Math.random() * 2 - 1;
        const r = x1 * x1 + x2 * x2;
        data.push({ x: [x1, x2], y: r < 0.5 ? 1 : 0 });
      }
      break;
    }
    case "spiral": {
      const half = Math.floor(n / 2);
      for (let cls = 0; cls < 2; cls++) {
        for (let i = 0; i < half; i++) {
          const t = (i / half) * 2 * Math.PI + (cls * Math.PI);
          const r = 0.4 + (i / half) * 0.5;
          const noise = (Math.random() - 0.5) * 0.15;
          const x1 = r * Math.cos(t) + noise;
          const x2 = r * Math.sin(t) + noise;
          data.push({ x: [x1, x2], y: cls });
        }
      }
      break;
    }
    case "gaussian": {
      const half2 = Math.floor(n / 2);
      for (let i = 0; i < half2; i++) {
        data.push({
          x: [gaussRand(-0.4, 0.25), gaussRand(-0.4, 0.25)],
          y: 0,
        });
        data.push({
          x: [gaussRand(0.4, 0.25), gaussRand(0.4, 0.25)],
          y: 1,
        });
      }
      break;
    }
    case "moons": {
      const half3 = Math.floor(n / 2);
      for (let i = 0; i < half3; i++) {
        const angle1 = Math.PI * (i / half3);
        data.push({
          x: [
            Math.cos(angle1) + gaussRand(0, 0.08),
            Math.sin(angle1) + gaussRand(0, 0.08),
          ],
          y: 0,
        });
        data.push({
          x: [
            1 - Math.cos(angle1) + gaussRand(0, 0.08),
            0.5 - Math.sin(angle1) + gaussRand(0, 0.08),
          ],
          y: 1,
        });
      }
      break;
    }
  }
  return data;
}

function gaussRand(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ─── Colors ─────────────────────────────────────────────────────────────────

function classColor(v: number, alpha = 1): string {
  // 0 = orange, 1 = blue
  const r = Math.round(255 * (1 - v) * 0.9 + 255 * v * 0.2);
  const g = Math.round(255 * (1 - v) * 0.5 + 255 * v * 0.5);
  const b = Math.round(255 * (1 - v) * 0.1 + 255 * v * 0.95);
  return `rgba(${r},${g},${b},${alpha})`;
}

function weightColor(w: number): string {
  const clamped = Math.max(-3, Math.min(3, w));
  const norm = (clamped + 3) / 6; // 0..1
  if (norm < 0.5) {
    // red to gray
    const t = norm * 2;
    return `rgb(${Math.round(220 - 100 * t)},${Math.round(60 + 100 * t)},${Math.round(60 + 100 * t)})`;
  } else {
    // gray to blue
    const t = (norm - 0.5) * 2;
    return `rgb(${Math.round(120 - 80 * t)},${Math.round(160 - 30 * t)},${Math.round(160 + 80 * t)})`;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

const DATASETS: { name: DatasetName; label: string }[] = [
  { name: "xor", label: "XOR" },
  { name: "circle", label: "Circle" },
  { name: "spiral", label: "Spiral" },
  { name: "gaussian", label: "Clusters" },
  { name: "moons", label: "Moons" },
];

const ACTIVATIONS: { name: ActivationFn; label: string }[] = [
  { name: "relu", label: "ReLU" },
  { name: "tanh", label: "Tanh" },
  { name: "sigmoid", label: "Sigmoid" },
];

const LEARNING_RATES = [0.003, 0.01, 0.03, 0.1, 0.3, 1.0];

export default function NeuralPage() {
  const [datasetName, setDatasetName] = useState<DatasetName>("spiral");
  const [activationFn, setActivationFn] = useState<ActivationFn>("tanh");
  const [hiddenLayers, setHiddenLayers] = useState<number[]>([6, 6]);
  const [learningRate, setLearningRate] = useState(0.03);
  const [playing, setPlaying] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [loss, setLoss] = useState(0);
  const [accuracy, setAccuracy] = useState(0);

  const networkRef = useRef<Network | null>(null);
  const dataRef = useRef<{ x: number[]; y: number }[]>([]);
  const boundaryCanvasRef = useRef<HTMLCanvasElement>(null);
  const networkCanvasRef = useRef<HTMLCanvasElement>(null);
  const lossHistoryRef = useRef<number[]>([]);
  const lossCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const playingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const sizes = useMemo(() => [2, ...hiddenLayers, 1], [hiddenLayers]);

  // Initialize network + data
  const reset = useCallback(() => {
    networkRef.current = createNetwork(sizes, activationFn);
    dataRef.current = generateDataset(datasetName, 400);
    lossHistoryRef.current = [];
    setEpoch(0);
    setLoss(0);
    setAccuracy(0);
  }, [sizes, activationFn, datasetName]);

  useEffect(() => {
    reset();
  }, [reset]);

  // One training step
  const step = useCallback(
    (epochs: number = 1) => {
      const net = networkRef.current;
      const data = dataRef.current;
      if (!net || !data.length) return;

      let l = 0;
      for (let i = 0; i < epochs; i++) {
        l = trainBatch(net, data, learningRate);
      }
      lossHistoryRef.current.push(l);
      if (lossHistoryRef.current.length > 500) lossHistoryRef.current.shift();

      // Compute accuracy
      let correct = 0;
      for (const s of data) {
        const p = predict(net, s.x);
        if ((p >= 0.5 ? 1 : 0) === s.y) correct++;
      }

      setEpoch((e) => e + epochs);
      setLoss(l);
      setAccuracy(correct / data.length);
    },
    [learningRate]
  );

  // Drawing functions
  const drawBoundary = useCallback(() => {
    const canvas = boundaryCanvasRef.current;
    const net = networkRef.current;
    const data = dataRef.current;
    if (!canvas || !net) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;

    // Decision boundary heatmap
    const resolution = 2; // pixel step
    const imgData = ctx.createImageData(w, h);

    // Determine data bounds
    let minX = -1.2, maxX = 1.2, minY = -1.2, maxY = 1.2;
    if (data.length > 0) {
      minX = Math.min(...data.map((d) => d.x[0])) - 0.3;
      maxX = Math.max(...data.map((d) => d.x[0])) + 0.3;
      minY = Math.min(...data.map((d) => d.x[1])) - 0.3;
      maxY = Math.max(...data.map((d) => d.x[1])) + 0.3;
      // Make square
      const range = Math.max(maxX - minX, maxY - minY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      minX = cx - range / 2;
      maxX = cx + range / 2;
      minY = cy - range / 2;
      maxY = cy + range / 2;
    }

    for (let py = 0; py < h; py += resolution) {
      for (let px = 0; px < w; px += resolution) {
        const x1 = minX + (px / w) * (maxX - minX);
        const x2 = minY + (py / h) * (maxY - minY);
        const v = predict(net, [x1, x2]);

        // Parse color
        const r = Math.round(255 * (1 - v) * 0.95 + 255 * v * 0.15);
        const g = Math.round(255 * (1 - v) * 0.45 + 255 * v * 0.45);
        const b = Math.round(255 * (1 - v) * 0.1 + 255 * v * 0.95);

        for (let dy = 0; dy < resolution && py + dy < h; dy++) {
          for (let dx = 0; dx < resolution && px + dx < w; dx++) {
            const idx = ((py + dy) * w + (px + dx)) * 4;
            imgData.data[idx] = r;
            imgData.data[idx + 1] = g;
            imgData.data[idx + 2] = b;
            imgData.data[idx + 3] = 140;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw data points
    for (const sample of data) {
      const px = ((sample.x[0] - minX) / (maxX - minX)) * w;
      const py = ((sample.x[1] - minY) / (maxY - minY)) * h;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = classColor(sample.y, 0.9);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, []);

  const drawNetwork = useCallback(() => {
    const canvas = networkCanvasRef.current;
    const net = networkRef.current;
    if (!canvas || !net) return;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const allSizes = [net.layers[0].inputSize, ...net.layers.map((l) => l.outputSize)];
    const nLayers = allSizes.length;
    const maxNodes = Math.max(...allSizes);

    const layerX = (i: number) => 40 + (i / (nLayers - 1)) * (w - 80);
    const nodeY = (layer: number, node: number) => {
      const count = allSizes[layer];
      const spacing = Math.min(30, (h - 40) / (count + 1));
      const totalH = spacing * (count - 1);
      return h / 2 - totalH / 2 + node * spacing;
    };

    // Draw connections
    for (let l = 0; l < net.layers.length; l++) {
      const layer = net.layers[l];
      for (let j = 0; j < layer.outputSize; j++) {
        for (let i = 0; i < layer.inputSize; i++) {
          const wt = layer.weights[j * layer.inputSize + i];
          const absW = Math.min(Math.abs(wt), 3);
          ctx.beginPath();
          ctx.moveTo(layerX(l), nodeY(l, i));
          ctx.lineTo(layerX(l + 1), nodeY(l + 1, j));
          ctx.strokeStyle = weightColor(wt);
          ctx.lineWidth = 0.5 + (absW / 3) * 2.5;
          ctx.globalAlpha = 0.3 + (absW / 3) * 0.7;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // Draw nodes
    for (let l = 0; l < nLayers; l++) {
      for (let n = 0; n < allSizes[l]; n++) {
        const x = layerX(l);
        const y = nodeY(l, n);
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);

        if (l === 0) {
          ctx.fillStyle = "#6366f1"; // indigo for inputs
        } else if (l === nLayers - 1) {
          ctx.fillStyle = "#f59e0b"; // amber for output
        } else {
          ctx.fillStyle = "#8b5cf6"; // violet for hidden
        }
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Labels
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#9ca3af";
    const labels = ["Input", ...net.layers.slice(0, -1).map((_, i) => `Hidden ${i + 1}`), "Output"];
    for (let l = 0; l < nLayers; l++) {
      ctx.fillText(labels[l], layerX(l), h - 8);
    }
  }, []);

  const drawLossChart = useCallback(() => {
    const canvas = lossCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const hist = lossHistoryRef.current;
    if (hist.length < 2) return;

    const maxLoss = Math.max(...hist, 0.01);

    // Grid lines
    ctx.strokeStyle = "rgba(128,128,128,0.1)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Loss line
    ctx.beginPath();
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    for (let i = 0; i < hist.length; i++) {
      const x = (i / (hist.length - 1)) * w;
      const y = h - (hist[i] / maxLoss) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gradient fill under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(167,139,250,0.15)");
    gradient.addColorStop(1, "rgba(167,139,250,0)");
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, []);

  // Animation loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (playingRef.current) {
        step(5); // 5 epochs per frame for speed
      }
      drawBoundary();
      drawNetwork();
      drawLossChart();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [step, drawBoundary, drawNetwork, drawLossChart]);

  // Layer controls
  const addLayer = () => {
    if (hiddenLayers.length < 5) {
      setHiddenLayers([...hiddenLayers, 4]);
      setPlaying(false);
    }
  };

  const removeLayer = () => {
    if (hiddenLayers.length > 1) {
      setHiddenLayers(hiddenLayers.slice(0, -1));
      setPlaying(false);
    }
  };

  const changeLayerSize = (idx: number, delta: number) => {
    const newLayers = [...hiddenLayers];
    newLayers[idx] = Math.max(1, Math.min(12, newLayers[idx] + delta));
    setHiddenLayers(newLayers);
    setPlaying(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-yellow-500/10 dark:bg-yellow-500/15">
              <Brain className="text-yellow-500" size={20} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Neural Network Playground
            </h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Build a neural network, pick a dataset, and watch it learn to classify in real time.
            Everything runs in your browser — no server, no libraries, pure backpropagation.
          </p>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
          {/* Dataset */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</span>
            <div className="flex gap-1">
              {DATASETS.map((d) => (
                <button
                  key={d.name}
                  onClick={() => { setDatasetName(d.name); setPlaying(false); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    datasetName === d.name
                      ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 ring-1 ring-yellow-500/30"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Activation */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Activation</span>
            <div className="flex gap-1">
              {ACTIVATIONS.map((a) => (
                <button
                  key={a.name}
                  onClick={() => { setActivationFn(a.name); setPlaying(false); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    activationFn === a.name
                      ? "bg-violet-500/20 text-violet-600 dark:text-violet-400 ring-1 ring-violet-500/30"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Learning Rate */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">LR</span>
            <select
              value={learningRate}
              onChange={(e) => setLearningRate(parseFloat(e.target.value))}
              className="px-2 py-1 rounded-md text-xs font-mono bg-muted/40 border border-border text-foreground"
            >
              {LEARNING_RATES.map((lr) => (
                <option key={lr} value={lr}>
                  {lr}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          {/* Playback Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { reset(); setPlaying(false); }}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
              title="Reset"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => step(1)}
              className="p-2 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
              title="Step"
            >
              <SkipForward size={16} />
            </button>
            <button
              onClick={() => setPlaying(!playing)}
              className={`p-2 rounded-lg transition-all ${
                playing
                  ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Decision Boundary Canvas */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Decision Boundary
              </span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: classColor(0) }} />
                  Class 0
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: classColor(1) }} />
                  Class 1
                </span>
              </div>
            </div>
            <div className="relative aspect-square max-h-[500px] w-full">
              <canvas
                ref={boundaryCanvasRef}
                width={500}
                height={500}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Right Panel */}
          <div className="flex flex-col gap-4">
            {/* Stats */}
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Training Stats
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-lg font-bold text-foreground font-mono">{epoch}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Epoch</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground font-mono">
                    {loss.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">Loss</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground font-mono">
                    {(accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">Accuracy</div>
                </div>
              </div>
            </div>

            {/* Loss Chart */}
            <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Loss Curve
                </span>
              </div>
              <div className="p-2">
                <canvas
                  ref={lossCanvasRef}
                  width={300}
                  height={100}
                  className="w-full h-[100px]"
                />
              </div>
            </div>

            {/* Architecture */}
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Architecture
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={removeLayer}
                    disabled={hiddenLayers.length <= 1}
                    className="p-1 rounded text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-all"
                    title="Remove layer"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    onClick={addLayer}
                    disabled={hiddenLayers.length >= 5}
                    className="p-1 rounded text-muted-foreground hover:bg-muted/60 disabled:opacity-30 transition-all"
                    title="Add layer"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Layer controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Input */}
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-sm font-bold text-indigo-500">
                    2
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1">In</span>
                </div>

                <Zap size={12} className="text-muted-foreground/40" />

                {/* Hidden layers */}
                {hiddenLayers.map((size, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => changeLayerSize(idx, -1)}
                        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <div className="w-10 h-10 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-sm font-bold text-violet-500">
                        {size}
                      </div>
                      <button
                        onClick={() => changeLayerSize(idx, 1)}
                        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">H{idx + 1}</span>
                  </div>
                ))}

                <Zap size={12} className="text-muted-foreground/40" />

                {/* Output */}
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-sm font-bold text-amber-500">
                    1
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1">Out</span>
                </div>
              </div>
            </div>

            {/* Network visualization */}
            <div className="rounded-xl border border-border bg-card/40 overflow-hidden flex-1">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Network Weights
                </span>
              </div>
              <div className="p-2">
                <canvas
                  ref={networkCanvasRef}
                  width={350}
                  height={200}
                  className="w-full h-[200px]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
