"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ExternalLink, Volume2, VolumeX } from "lucide-react";
import {
  type Board,
  type Color,
  type PieceType,
  UNICODE,
  initBoard,
  applyMove,
  isInCheck,
  findKing,
  getLegalMoves,
  hasAnyMoves,
  getBestMove,
  evaluate,
} from "./engine";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// Derive terminal status after a move is committed.
function getStatus(board: Board, justMoved: Color): string {
  const opp: Color = justMoved === "w" ? "b" : "w";
  const oppInCheck = isInCheck(board, opp);
  const oppHasMoves = hasAnyMoves(board, opp);
  if (!oppHasMoves) {
    return oppInCheck
      ? `Checkmate! ${justMoved === "w" ? "White" : "Black"} wins! 🎉`
      : "Stalemate — it's a draw.";
  }
  if (oppInCheck) return `${opp === "w" ? "White" : "Black"} is in check!`;
  return "";
}

// Convert a move to Standard Algebraic Notation
function toSAN(
  board: Board,
  fr: number,
  fc: number,
  tr: number,
  tc: number,
  nextBoard: Board,
  justMoved: Color,
  promoteTo?: PieceType
): string {
  const piece = board[fr][fc]!;
  const isCapture = board[tr][tc] !== null;
  const dest = FILES[tc] + (8 - tr);

  let san: string;
  if (piece.type === "P") {
    san = isCapture ? `${FILES[fc]}x${dest}` : dest;
    // Always annotate the promotion piece
    if (tr === 0 || tr === 7) san += `=${promoteTo ?? "Q"}`;
  } else {
    san = piece.type + (isCapture ? "x" : "") + dest;
  }

  // Append check (+) or checkmate (#) suffix
  const opp: Color = justMoved === "w" ? "b" : "w";
  if (isInCheck(nextBoard, opp)) {
    san += hasAnyMoves(nextBoard, opp) ? "+" : "#";
  }

  return san;
}

// ── Material tracking ────────────────────────────────────────────────────────
const PIECE_VALUES: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const INITIAL_COUNTS: Record<PieceType, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1, K: 1 };
const CAPTURE_ORDER: PieceType[] = ["Q", "R", "B", "N", "P"];

/** Returns pieces captured by each side and the net material advantage (+ = white leads). */
function getCapturedPieces(board: Board): {
  capturedByWhite: PieceType[]; // black pieces white has taken
  capturedByBlack: PieceType[]; // white pieces black has taken
  advantage: number;            // positive = white ahead
} {
  const onBoard: Record<Color, Record<PieceType, number>> = {
    w: { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0 },
    b: { K: 0, Q: 0, R: 0, B: 0, N: 0, P: 0 },
  };
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) onBoard[p.color][p.type]++;
    }

  const capturedByWhite: PieceType[] = [];
  const capturedByBlack: PieceType[] = [];
  let advantage = 0;

  for (const type of CAPTURE_ORDER) {
    const bMissing = INITIAL_COUNTS[type] - onBoard.b[type];
    for (let i = 0; i < bMissing; i++) {
      capturedByWhite.push(type);
      advantage += PIECE_VALUES[type];
    }
    const wMissing = INITIAL_COUNTS[type] - onBoard.w[type];
    for (let i = 0; i < wMissing; i++) {
      capturedByBlack.push(type);
      advantage -= PIECE_VALUES[type];
    }
  }

  return { capturedByWhite, capturedByBlack, advantage };
}

const DIFFICULTIES = [
  { label: "Easy",   depth: 1 },
  { label: "Medium", depth: 2 },
  { label: "Hard",   depth: 3 },
] as const;

type DifficultyLabel = (typeof DIFFICULTIES)[number]["label"];

const BOARD_THEMES = [
  { name: "Classic", light: "#f0d9b5", dark: "#b58863" },
  { name: "Green",   light: "#eeeed2", dark: "#769656" },
  { name: "Blue",    light: "#dee3e6", dark: "#8ca2ad" },
  { name: "Walnut",  light: "#e8cfa3", dark: "#6b3f27" },
] as const;

type BoardThemeName = (typeof BOARD_THEMES)[number]["name"];

// ── Time controls ─────────────────────────────────────────────────────────────
const TIME_CONTROLS = [
  { label: "∞",   seconds: 0   },
  { label: "1m",  seconds: 60  },
  { label: "3m",  seconds: 180 },
  { label: "5m",  seconds: 300 },
  { label: "10m", seconds: 600 },
] as const;

type TimeControlLabel = (typeof TIME_CONTROLS)[number]["label"];

// ── Chess opening book ────────────────────────────────────────────────────────
// Entries are listed from most-specific to least-specific so the greedy search
// naturally picks the longest matching line.
const OPENINGS: { moves: string[]; name: string }[] = [
  // ── Sicilian variations ──
  { moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], name: "Sicilian: Najdorf" },
  { moves: ["e4", "c5", "Nf3", "Nc6", "d4", "cxd4", "Nxd4", "g6"], name: "Sicilian: Dragon" },
  { moves: ["e4", "c5", "Nf3", "e6", "d4", "cxd4", "Nxd4"], name: "Sicilian: Scheveningen" },
  // ── Ruy Lopez ──
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6"], name: "Ruy Lopez: Open" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"], name: "Ruy Lopez: Morphy" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], name: "Ruy Lopez" },
  // ── Italian Game ──
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6"], name: "Giuoco Piano" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3"], name: "Giuoco Piano" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"], name: "Two Knights Defense" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], name: "Giuoco Piano" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"], name: "Italian Game" },
  // ── Scotch ──
  { moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4"], name: "Scotch Game" },
  { moves: ["e4", "e5", "Nf3", "Nc6", "d4"], name: "Scotch Game" },
  // ── Other e4 e5 ──
  { moves: ["e4", "e5", "Nf3", "Nf6"], name: "Petrov's Defense" },
  { moves: ["e4", "e5", "f4", "exf4"], name: "King's Gambit Accepted" },
  { moves: ["e4", "e5", "f4", "d5"], name: "Falkbeer Counter Gambit" },
  { moves: ["e4", "e5", "f4"], name: "King's Gambit" },
  { moves: ["e4", "e5", "Nf3", "Nc6"], name: "Open Game" },
  { moves: ["e4", "e5"], name: "Open Game" },
  // ── Sicilian ──
  { moves: ["e4", "c5", "Nf3", "d6"], name: "Sicilian: Classical" },
  { moves: ["e4", "c5", "Nf3"], name: "Sicilian Defense" },
  { moves: ["e4", "c5"], name: "Sicilian Defense" },
  // ── Other e4 defenses ──
  { moves: ["e4", "e6", "d4", "d5"], name: "French Defense" },
  { moves: ["e4", "e6"], name: "French Defense" },
  { moves: ["e4", "c6", "d4", "d5"], name: "Caro-Kann Defense" },
  { moves: ["e4", "c6"], name: "Caro-Kann Defense" },
  { moves: ["e4", "d6", "d4", "Nf6"], name: "Pirc Defense" },
  { moves: ["e4", "d6"], name: "Pirc Defense" },
  { moves: ["e4", "Nf6", "e5", "Nd5"], name: "Alekhine's Defense" },
  { moves: ["e4", "Nf6"], name: "Alekhine's Defense" },
  { moves: ["e4", "d5", "exd5"], name: "Scandinavian Defense" },
  { moves: ["e4", "d5"], name: "Scandinavian Defense" },
  { moves: ["e4", "g6"], name: "Modern Defense" },
  // ── d4 openings ──
  { moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"], name: "King's Indian Defense" },
  { moves: ["d4", "Nf6", "c4", "g6", "Nc3"], name: "King's Indian Defense" },
  { moves: ["d4", "Nf6", "c4", "g6"], name: "King's Indian Defense" },
  { moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"], name: "Nimzo-Indian Defense" },
  { moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6"], name: "Slav Defense" },
  { moves: ["d4", "d5", "c4", "c6"], name: "Slav Defense" },
  { moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6"], name: "Queen's Gambit Declined" },
  { moves: ["d4", "d5", "c4", "dxc4"], name: "Queen's Gambit Accepted" },
  { moves: ["d4", "d5", "c4", "e6"], name: "Queen's Gambit Declined" },
  { moves: ["d4", "d5", "c4"], name: "Queen's Gambit" },
  { moves: ["d4", "Nf6", "c4", "e6"], name: "Queen's Indian / Nimzo" },
  { moves: ["d4", "Nf6", "c4"], name: "Indian Defense" },
  { moves: ["d4", "d5"], name: "Queen's Pawn Game" },
  { moves: ["d4", "Nf6"], name: "Indian Defense" },
  // ── Flank openings ──
  { moves: ["Nf3", "d5", "c4"], name: "Réti Opening" },
  { moves: ["c4", "e5"], name: "English: Reversed Sicilian" },
  { moves: ["c4", "Nf6"], name: "English Opening" },
  { moves: ["c4"], name: "English Opening" },
  { moves: ["Nf3"], name: "Réti Opening" },
  // ── Generic first moves ──
  { moves: ["d4"], name: "Queen's Pawn Opening" },
  { moves: ["e4"], name: "King's Pawn Opening" },
];

/** Strip check (+), checkmate (#), and annotation (!?) symbols from a SAN move. */
function cleanSAN(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

/**
 * Return the most specific opening name for the given move history,
 * or null if no entry matches or the game has progressed too far.
 */
function getOpeningName(moves: string[]): string | null {
  if (moves.length === 0) return null;
  const cleaned = moves.map(cleanSAN);
  let best: { name: string; len: number } | null = null;
  for (const opening of OPENINGS) {
    const len = opening.moves.length;
    if (len > cleaned.length) continue;
    if (best && len <= best.len) continue; // prefer longer (more specific) match
    if (opening.moves.every((m, i) => m === cleaned[i])) {
      best = { name: opening.name, len };
    }
  }
  return best?.name ?? null;
}

type Snapshot = {
  board: Board;
  status: string;
  lastMove: [[number, number], [number, number]] | null;
  moveHistory: string[];
  turn: Color;
};

/** Format elapsed milliseconds as  m:ss  (e.g. "2:07") */
function formatClock(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Generate a FEN string for the current board position.
 * Castling availability is inferred from piece positions (heuristic — does not
 * track whether the king or rooks have previously moved).  En passant is
 * omitted ("-") since the engine does not expose the last double-pawn push.
 */
function toFEN(board: Board, turn: Color, moveHistory: string[]): string {
  // 1. Piece placement — ranks 8→1 map to rows 0→7
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) {
    let rank = "";
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) { rank += empty; empty = 0; }
        // Pawns are stored as "P" in PieceType; FEN also uses "P"/"p"
        const letter = piece.type; // K, Q, R, B, N, P
        rank += piece.color === "w" ? letter : letter.toLowerCase();
      }
    }
    if (empty > 0) rank += empty;
    ranks.push(rank);
  }
  const placement = ranks.join("/");

  // 2. Active colour
  const active = turn; // "w" | "b"

  // 3. Castling availability (heuristic based on piece positions)
  let castling = "";
  if (board[7][4]?.type === "K" && board[7][4]?.color === "w") {
    if (board[7][7]?.type === "R" && board[7][7]?.color === "w") castling += "K";
    if (board[7][0]?.type === "R" && board[7][0]?.color === "w") castling += "Q";
  }
  if (board[0][4]?.type === "K" && board[0][4]?.color === "b") {
    if (board[0][7]?.type === "R" && board[0][7]?.color === "b") castling += "k";
    if (board[0][0]?.type === "R" && board[0][0]?.color === "b") castling += "q";
  }
  if (!castling) castling = "-";

  // 4. En passant target square (not tracked — always "-")
  const enPassant = "-";

  // 5. Half-move clock (simplified — always 0)
  const halfMove = 0;

  // 6. Full-move number (starts at 1, increments after Black's move)
  const fullMove = Math.floor(moveHistory.length / 2) + 1;

  return `${placement} ${active} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
}

// ── Confetti celebration ──────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#f59e0b", "#10b981", "#3b82f6", "#ef4444",
  "#a855f7", "#ec4899", "#f97316", "#fbbf24",
  "#84cc16", "#06b6d4", "#ffffff",
];

function ConfettiOverlay() {
  const particles = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        width: 5 + Math.random() * 8,
        height: 4 + Math.random() * 12,
        delay: Math.random() * 1.5,
        duration: 2.2 + Math.random() * 1.8,
        borderRadius:
          i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "0 4px 0 4px",
        alt: i % 2 === 0,
      })),
    []
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-16px",
            width: `${p.width}px`,
            height: `${p.height}px`,
            backgroundColor: p.color,
            borderRadius: p.borderRadius,
            animationName: p.alt ? "confettiFallAlt" : "confettiFall",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationTimingFunction: "linear",
            animationFillMode: "forwards",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ChessPage() {
  const [board, setBoard] = useState<Board>(initBoard);
  const [turn, setTurn] = useState<Color>("w");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [legalMoves, setLegalMoves] = useState<[number, number][]>([]);
  const [status, setStatus] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState<[[number, number], [number, number]] | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  // Increments each time the move list changes so the flash overlay remounts and replays.
  const [moveAnimKey, setMoveAnimKey] = useState(0);
  // ── User preferences (persisted in localStorage) ─────────────────────────
  const [difficulty, setDifficulty] = useState<DifficultyLabel>(() => {
    if (typeof window === "undefined") return "Hard";
    try {
      const saved = localStorage.getItem("chess-prefs");
      if (saved) {
        const p = JSON.parse(saved);
        if (DIFFICULTIES.some((d) => d.label === p.difficulty)) return p.difficulty;
      }
    } catch { /* ignore */ }
    return "Hard";
  });
  const [vsAI, setVsAI] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("chess-prefs");
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.vsAI === "boolean") return p.vsAI;
      }
    } catch { /* ignore */ }
    return true;
  });
  const [playerColor, setPlayerColor] = useState<Color>(() => {
    if (typeof window === "undefined") return "w";
    try {
      const saved = localStorage.getItem("chess-prefs");
      if (saved) {
        const p = JSON.parse(saved);
        if (p.playerColor === "w" || p.playerColor === "b") return p.playerColor;
      }
    } catch { /* ignore */ }
    return "w";
  });
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{
    sr: number; sc: number; r: number; c: number; color: Color;
  } | null>(null);
  const historyEndRef = useRef<HTMLTableRowElement>(null);
  const statsCountedRef = useRef(false);
  // ── Game duration tracking ─────────────────────────────────────────────────
  const gameStartRef = useRef<number>(Date.now());
  const [gameDuration, setGameDuration] = useState<number | null>(null);
  const [pgnCopied, setPgnCopied] = useState(false);
  const [fenCopied, setFenCopied] = useState(false);
  const boardInnerRef = useRef<HTMLDivElement>(null);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    fromR: number;
    fromC: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  // ── Win/Loss/Draw statistics (persisted in localStorage) ─────────────────
  const [stats, setStats] = useState<{ wins: number; losses: number; draws: number }>(() => {
    if (typeof window === "undefined") return { wins: 0, losses: 0, draws: 0 };
    try {
      const saved = localStorage.getItem("chess-stats");
      return saved ? JSON.parse(saved) : { wins: 0, losses: 0, draws: 0 };
    } catch {
      return { wins: 0, losses: 0, draws: 0 };
    }
  });
  const [hint, setHint] = useState<[[number, number], [number, number]] | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [boardTheme, setBoardTheme] = useState<BoardThemeName>(() => {
    if (typeof window === "undefined") return "Classic";
    try {
      const saved = localStorage.getItem("chess-prefs");
      if (saved) {
        const p = JSON.parse(saved);
        if (BOARD_THEMES.some((t) => t.name === p.boardTheme)) return p.boardTheme;
      }
    } catch { /* ignore */ }
    return "Classic";
  });

  // ── Time control ──────────────────────────────────────────────────────────
  const [timeControl, setTimeControl] = useState<TimeControlLabel>("∞");
  // Ref so the clock interval always reads the latest value without re-subscribing
  const timeControlSecondsRef = useRef(0);

  // ── Confetti state ────────────────────────────────────────────────────────
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sound effects ────────────────────────────────────────────────────────
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("chess-prefs");
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.soundEnabled === "boolean") return p.soundEnabled;
      }
    } catch { /* ignore */ }
    return true;
  });
  // Use a ref so the stable playChessSound callback can always read the latest value
  const soundEnabledRef = useRef(true);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Track the last second at which a tick sound was played per player.
  // Reset to -1 on new game / time-control changes to allow fresh ticking.
  const lastTickSecWhiteRef = useRef(-1);
  const lastTickSecBlackRef = useRef(-1);

  /** Play a short synthesised sound for a chess event. */
  const playChessSound = useCallback((type: "move" | "capture" | "check" | "checkmate" | "tick") => {
    if (!soundEnabledRef.current || typeof window === "undefined") return;
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;

      if (type === "checkmate") {
        // Descending four-note arpeggio: C5 → A4 → F4 → C4
        ([523, 440, 349, 262] as number[]).forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "sine";
          const t = now + i * 0.18;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.start(t);
          osc.stop(t + 0.3);
        });
        return;
      }

      if (type === "tick") {
        // Short metronome-like click for low-time warning (< 10 s)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1400, now);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.start(now);
        osc.stop(now + 0.05);
        return;
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "move") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(480, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "capture") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "check") {
        // Two quick pulses at different pitches
        osc.type = "square";
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.32);
      }
    } catch {
      // AudioContext not supported or blocked by browser policy
    }
  }, []); // stable — reads soundEnabledRef at call time

  // Persist stats to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem("chess-stats", JSON.stringify(stats)); } catch { /* ignore */ }
  }, [stats]);

  // Persist user preferences whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("chess-prefs", JSON.stringify({
        difficulty,
        vsAI,
        playerColor,
        boardTheme,
        soundEnabled,
      }));
    } catch { /* ignore */ }
  }, [difficulty, vsAI, playerColor, boardTheme, soundEnabled]);

  // Record a result once per game (vs AI only)
  useEffect(() => {
    if (!vsAI || statsCountedRef.current) return;
    const playerWins = playerColor === "w" ? status.includes("White wins") : status.includes("Black wins");
    const playerLoses = playerColor === "w" ? status.includes("Black wins") : status.includes("White wins");
    if (playerWins) {
      statsCountedRef.current = true;
      setStats((s) => ({ ...s, wins: s.wins + 1 }));
    } else if (playerLoses) {
      statsCountedRef.current = true;
      setStats((s) => ({ ...s, losses: s.losses + 1 }));
    } else if (status.includes("Stalemate")) {
      statsCountedRef.current = true;
      setStats((s) => ({ ...s, draws: s.draws + 1 }));
    }
  }, [status, vsAI, playerColor]);

  // ── Game clocks ───────────────────────────────────────────────────────────
  // ms: elapsed when unlimited (0-based), remaining when timed (tc*1000-based)
  const [whiteTime, setWhiteTime] = useState(0);
  const [blackTime, setBlackTime] = useState(0);
  const turnStartRef = useRef<number>(Date.now()); // timestamp when current turn began

  // Sync ref and reset clocks whenever the time control setting changes
  useEffect(() => {
    const tc = TIME_CONTROLS.find((t) => t.label === timeControl)?.seconds ?? 0;
    timeControlSecondsRef.current = tc;
    setWhiteTime(tc > 0 ? tc * 1000 : 0);
    setBlackTime(tc > 0 ? tc * 1000 : 0);
    turnStartRef.current = Date.now();
    // Reset tick state so the new time control starts fresh
    lastTickSecWhiteRef.current = -1;
    lastTickSecBlackRef.current = -1;
  }, [timeControl]);

  // Reset the turn-start timestamp whenever the active player changes
  useEffect(() => {
    turnStartRef.current = Date.now();
  }, [turn]);

  // Tick the active player's clock every 100 ms while the game is live
  useEffect(() => {
    const gameOver = status.includes("Checkmate") || status.includes("Stalemate") || status.includes("on time");
    if (gameOver) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - turnStartRef.current;
      const tc = timeControlSecondsRef.current;
      if (tc > 0) {
        // Countdown mode — subtract elapsed from the active player's clock
        if (turn === "w") {
          setWhiteTime((t) => Math.max(0, t - elapsed));
        } else {
          setBlackTime((t) => Math.max(0, t - elapsed));
        }
      } else {
        // Count-up mode — track elapsed time (existing behaviour)
        if (turn === "w") {
          setWhiteTime((t) => t + elapsed);
        } else {
          setBlackTime((t) => t + elapsed);
        }
      }
      turnStartRef.current = Date.now();
    }, 100);
    return () => clearInterval(id);
  }, [turn, status]);

  // Detect when a player runs out of time
  useEffect(() => {
    const tc = TIME_CONTROLS.find((t) => t.label === timeControl)?.seconds ?? 0;
    if (tc === 0 || isGameOver) return;
    if (whiteTime === 0) setStatus("Black wins on time! ⏱");
    if (blackTime === 0) setStatus("White wins on time! ⏱");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteTime, blackTime]);

  const isGameOver =
    status.includes("Checkmate") || status.includes("Stalemate") || status.includes("on time");

  // ── Low-time tick sound ───────────────────────────────────────────────────
  // Plays a short metronome click once per second when the active player has
  // 10 seconds or fewer remaining. Respects the sound-enabled toggle.
  useEffect(() => {
    if (timeControlSecondsRef.current === 0 || isGameOver) return;
    const TICK_THRESHOLD = 10_000; // 10 seconds in ms
    if (turn === "w" && whiteTime > 0 && whiteTime <= TICK_THRESHOLD) {
      const sec = Math.ceil(whiteTime / 1000);
      if (sec !== lastTickSecWhiteRef.current) {
        lastTickSecWhiteRef.current = sec;
        playChessSound("tick");
      }
    }
    if (turn === "b" && blackTime > 0 && blackTime <= TICK_THRESHOLD) {
      const sec = Math.ceil(blackTime / 1000);
      if (sec !== lastTickSecBlackRef.current) {
        lastTickSecBlackRef.current = sec;
        playChessSound("tick");
      }
    }
  }, [whiteTime, blackTime, turn, isGameOver, playChessSound]);

  // Capture game duration the moment the game ends (transitions false → true)
  useEffect(() => {
    if (isGameOver) {
      setGameDuration(Date.now() - gameStartRef.current);
    }
  }, [isGameOver]);

  // Auto-scroll move history to bottom when moves are added
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moveHistory]);

  // Replay the last-move flash animation whenever the move list changes (move made or undone).
  useEffect(() => {
    setMoveAnimKey((k) => k + 1);
  }, [moveHistory]);

  // ── Engine move ───────────────────────────────────────────────────────────
  useEffect(() => {
    const aiColor: Color = playerColor === "w" ? "b" : "w";
    if (turn !== aiColor || isGameOver || isThinking || !vsAI) return;

    setIsThinking(true);
    const depth = DIFFICULTIES.find((d) => d.label === difficulty)?.depth ?? 3;
    // Yield to the browser so the board re-renders before we block the thread.
    const id = setTimeout(() => {
      const move = getBestMove(board, aiColor, depth);
      if (move) {
        const next = applyMove(board, move.fr, move.fc, move.tr, move.tc);
        const san = toSAN(board, move.fr, move.fc, move.tr, move.tc, next, aiColor);
        const newStatus = getStatus(next, aiColor);
        const wasCapture = board[move.tr][move.tc] !== null;
        setBoard(next);
        setTurn(playerColor);
        setStatus(newStatus);
        setLastMove([[move.fr, move.fc], [move.tr, move.tc]]);
        setMoveHistory((h) => [...h, san]);
        // Sound feedback
        if (newStatus.includes("Checkmate")) playChessSound("checkmate");
        else if (newStatus.includes("check")) playChessSound("check");
        else if (wasCapture) playChessSound("capture");
        else playChessSound("move");
      }
      setIsThinking(false);
    }, 30);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, board, difficulty, vsAI, playerColor]);

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setRedoStack((rs) => [...rs, { board, status, lastMove, moveHistory, turn }]);
      setBoard(prev.board);
      setTurn(prev.turn);
      setStatus(prev.status);
      setLastMove(prev.lastMove);
      setMoveHistory(prev.moveHistory);
      setSelected(null);
      setLegalMoves([]);
      setHint(null);
      return stack.slice(0, -1);
    });
  }, [board, status, lastMove, moveHistory, turn]);

  const redo = useCallback(() => {
    setRedoStack((rs) => {
      if (rs.length === 0) return rs;
      const next = rs[rs.length - 1];
      setUndoStack((stack) => [...stack, { board, status, lastMove, moveHistory, turn }]);
      setBoard(next.board);
      setTurn(next.turn);
      setStatus(next.status);
      setLastMove(next.lastMove);
      setMoveHistory(next.moveHistory);
      setSelected(null);
      setLegalMoves([]);
      setHint(null);
      return rs.slice(0, -1);
    });
  }, [board, status, lastMove, moveHistory, turn]);

  // Show a hint: compute best move for the player and highlight it briefly
  const showHint = useCallback(() => {
    if (!vsAI || isGameOver || isThinking || turn !== playerColor || isHinting) return;
    setIsHinting(true);
    setTimeout(() => {
      const move = getBestMove(board, playerColor, 3);
      if (move) {
        setHint([[move.fr, move.fc], [move.tr, move.tc]]);
        // Auto-clear hint after 3 seconds
        setTimeout(() => setHint(null), 3000);
      }
      setIsHinting(false);
    }, 30);
  }, [board, isGameOver, isThinking, turn, isHinting, vsAI, playerColor]);

  // Keyboard shortcuts: Ctrl+Z = undo, N = new game, F = flip board
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire when typing in a form element
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (isEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (!isThinking && undoStack.length > 0) {
          e.preventDefault();
          undo();
        }
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y"))
      ) {
        if (!isThinking && redoStack.length > 0) {
          e.preventDefault();
          redo();
        }
        return;
      }

      if (e.key === "n" || e.key === "N") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          reset();
        }
        return;
      }

      if (e.key === "f" || e.key === "F") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setFlipped((prev) => !prev);
        }
        return;
      }

      if (e.key === "h" || e.key === "H") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          showHint();
        }
        return;
      }

      if (e.key === "m" || e.key === "M") {
        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setSoundEnabled((s) => !s);
        }
        return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, isThinking, undoStack.length, redoStack.length, showHint]);

  // ── Auto-flip board when player color changes ─────────────────────────────
  useEffect(() => {
    setFlipped(playerColor === "b");
  }, [playerColor]);

  // ── Confetti on checkmate ─────────────────────────────────────────────────
  useEffect(() => {
    if (!status.includes("Checkmate")) return;
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    setConfettiKey((k) => k + 1);
    setShowConfetti(true);
    confettiTimerRef.current = setTimeout(() => setShowConfetti(false), 4500);
    return () => {
      if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    };
  }, [status]);

  // ── Player click ─────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (r: number, c: number) => {
      if (isGameOver || isThinking || (vsAI && turn !== playerColor)) return;

      const piece = board[r][c];

      if (selected) {
        const [sr, sc] = selected;
        const isLegal = legalMoves.some(([lr, lc]) => lr === r && lc === c);

        if (isLegal) {
          // Check if this move is a pawn promotion (either side reaching the back rank)
          const movingPiece = board[sr][sc];
          if (movingPiece?.type === "P" && (r === 0 || r === 7)) {
            // Pause and ask the player which piece to promote to
            setSelected(null);
            setLegalMoves([]);
            setPendingPromotion({ sr, sc, r, c, color: turn });
            return;
          }

          // Save snapshot before committing the move so it can be undone
          setUndoStack((stack) => [
            ...stack,
            { board, status, lastMove, moveHistory, turn },
          ]);
          setRedoStack([]);
          const next = applyMove(board, sr, sc, r, c);
          const san = toSAN(board, sr, sc, r, c, next, turn);
          const newStatus = getStatus(next, turn);
          setBoard(next);
          setTurn(turn === "w" ? "b" : "w");
          setStatus(newStatus);
          setLastMove([[sr, sc], [r, c]]);
          setSelected(null);
          setLegalMoves([]);
          setHint(null);
          setMoveHistory((h) => [...h, san]);
          // Sound feedback (check board[r][c] before state update, not undefined isCapture)
          const wasCapture = board[r][c] !== null;
          if (newStatus.includes("Checkmate")) playChessSound("checkmate");
          else if (newStatus.includes("check")) playChessSound("check");
          else if (wasCapture) playChessSound("capture");
          else playChessSound("move");
          return;
        }

        if (piece?.color === turn) {
          setSelected([r, c]);
          setLegalMoves(getLegalMoves(board, r, c));
          return;
        }

        setSelected(null);
        setLegalMoves([]);
        return;
      }

      if (piece?.color === turn) {
        setSelected([r, c]);
        setLegalMoves(getLegalMoves(board, r, c));
      }
    },
    [board, selected, legalMoves, turn, isGameOver, isThinking, vsAI, playerColor, playChessSound]
  );

  // ── Drag-and-drop piece movement ─────────────────────────────────────────
  const handlePieceMouseDown = useCallback(
    (r: number, c: number, e: React.MouseEvent) => {
      const piece = board[r][c];
      if (!piece || piece.color !== turn) return;
      if (isGameOver || isThinking || (vsAI && turn !== playerColor)) return;

      e.preventDefault();

      const moves = getLegalMoves(board, r, c);
      setSelected([r, c]);
      setLegalMoves(moves);

      let isDragStarted = false;
      const startX = e.clientX;
      const startY = e.clientY;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragStarted) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.sqrt(dx * dx + dy * dy) >= 5) {
            isDragStarted = true;
            setDragging({ fromR: r, fromC: c, clientX: ev.clientX, clientY: ev.clientY });
          }
        } else {
          setDragging((d) => d ? { ...d, clientX: ev.clientX, clientY: ev.clientY } : null);
        }
      };

      const onMouseUp = (ev: MouseEvent) => {
        cleanup();
        setDragging(null);

        if (!isDragStarted) return; // Was a plain click — onClick will handle it

        // Compute which board square the cursor is over
        const boardEl = boardInnerRef.current;
        if (!boardEl) return;
        const rect = boardEl.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return;
        const squareSize = rect.width / 8;
        const vc = Math.min(7, Math.max(0, Math.floor(x / squareSize)));
        const vr = Math.min(7, Math.max(0, Math.floor(y / squareSize)));
        const tr = flipped ? 7 - vr : vr;
        const tc = flipped ? 7 - vc : vc;

        const isLegal = moves.some(([lr, lc]) => lr === tr && lc === tc);
        if (!isLegal) return;

        // Pawn promotion
        if (piece.type === "P" && (tr === 0 || tr === 7)) {
          setSelected(null);
          setLegalMoves([]);
          setPendingPromotion({ sr: r, sc: c, r: tr, c: tc, color: turn });
          return;
        }

        // Commit the move
        setUndoStack((stack) => [
          ...stack,
          { board, status, lastMove, moveHistory, turn },
        ]);
        setRedoStack([]);
        const next = applyMove(board, r, c, tr, tc);
        const san = toSAN(board, r, c, tr, tc, next, turn);
        const newStatus = getStatus(next, turn);
        const wasCapture = board[tr][tc] !== null;
        setBoard(next);
        setTurn(turn === "w" ? "b" : "w");
        setStatus(newStatus);
        setLastMove([[r, c], [tr, tc]]);
        setSelected(null);
        setLegalMoves([]);
        setHint(null);
        setMoveHistory((h) => [...h, san]);
        if (newStatus.includes("Checkmate")) playChessSound("checkmate");
        else if (newStatus.includes("check")) playChessSound("check");
        else if (wasCapture) playChessSound("capture");
        else playChessSound("move");
      };

      const cleanup = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, turn, isGameOver, isThinking, vsAI, playerColor, flipped, status, lastMove, moveHistory, playChessSound]
  );

  const reset = () => {
    setBoard(initBoard());
    setTurn("w");
    setSelected(null);
    setLegalMoves([]);
    setStatus("");
    setIsThinking(false);
    setLastMove(null);
    setMoveHistory([]);
    setUndoStack([]);
    setRedoStack([]);
    setPendingPromotion(null);
    setHint(null);
    setDragging(null);
    const tc = TIME_CONTROLS.find((t) => t.label === timeControl)?.seconds ?? 0;
    setWhiteTime(tc > 0 ? tc * 1000 : 0);
    setBlackTime(tc > 0 ? tc * 1000 : 0);
    turnStartRef.current = Date.now();
    gameStartRef.current = Date.now();
    setGameDuration(null);
    statsCountedRef.current = false;
    // Reset low-time tick state so ticks fire fresh in the new game
    lastTickSecWhiteRef.current = -1;
    lastTickSecBlackRef.current = -1;
    // Clear any active confetti
    setShowConfetti(false);
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
  };

  // Called when the player selects a promotion piece from the dialog
  const confirmPromotion = useCallback((promoteTo: PieceType) => {
    if (!pendingPromotion) return;
    const { sr, sc, r, c, color } = pendingPromotion;
    setPendingPromotion(null);
    // Save snapshot for undo (restore to the promoting player's turn)
    setUndoStack((stack) => [
      ...stack,
      { board, status, lastMove, moveHistory, turn: color },
    ]);
    setRedoStack([]);
    const next = applyMove(board, sr, sc, r, c, promoteTo);
    const san = toSAN(board, sr, sc, r, c, next, color, promoteTo);
    const newStatus = getStatus(next, color);
    const wasCapture = board[r][c] !== null;
    setBoard(next);
    setTurn(color === "w" ? "b" : "w");
    setStatus(newStatus);
    setLastMove([[sr, sc], [r, c]]);
    setHint(null);
    setMoveHistory((h) => [...h, san]);
    // Sound feedback
    if (newStatus.includes("Checkmate")) playChessSound("checkmate");
    else if (newStatus.includes("check")) playChessSound("check");
    else if (wasCapture) playChessSound("capture");
    else playChessSound("move");
  }, [pendingPromotion, board, status, lastMove, moveHistory, playChessSound]);

  // Copy game moves as standard PGN to clipboard (with headers)
  const copyPGN = useCallback(() => {
    if (moveHistory.length === 0) return;

    // ── PGN Header tags ───────────────────────────────────────────────────────
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;

    const whiteName = vsAI
      ? (playerColor === "w" ? "Player" : `AI (${difficulty})`)
      : "White";
    const blackName = vsAI
      ? (playerColor === "b" ? "Player" : `AI (${difficulty})`)
      : "Black";

    // Standard result token
    let result = "*";
    if (status.includes("White wins") || status.includes("on time") && status.startsWith("White")) result = "1-0";
    else if (status.includes("Black wins") || status.includes("on time") && status.startsWith("Black")) result = "0-1";
    else if (status.includes("Stalemate")) result = "1/2-1/2";

    let pgn = `[Event "Casual Game"]\n`;
    pgn += `[Date "${dateStr}"]\n`;
    pgn += `[White "${whiteName}"]\n`;
    pgn += `[Black "${blackName}"]\n`;
    pgn += `[Result "${result}"]\n`;

    // Include opening name if one was detected
    const detectedOpening = getOpeningName(moveHistory);
    if (detectedOpening) {
      pgn += `[Opening "${detectedOpening}"]\n`;
    }

    pgn += "\n";

    // ── Move text ─────────────────────────────────────────────────────────────
    const moveParts: string[] = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      let pair = `${moveNum}. ${moveHistory[i]}`;
      if (moveHistory[i + 1]) pair += ` ${moveHistory[i + 1]}`;
      moveParts.push(pair);
    }
    pgn += moveParts.join(" ");
    if (result !== "*") pgn += ` ${result}`;

    navigator.clipboard.writeText(pgn).then(() => {
      setPgnCopied(true);
      setTimeout(() => setPgnCopied(false), 2000);
    });
  }, [moveHistory, vsAI, playerColor, difficulty, status]);

  // Copy current board position as FEN to the clipboard
  const copyFEN = useCallback(() => {
    const fen = toFEN(board, turn, moveHistory);
    navigator.clipboard.writeText(fen).then(() => {
      setFenCopied(true);
      setTimeout(() => setFenCopied(false), 2000);
    });
  }, [board, turn, moveHistory]);

  // Open current position in Lichess analysis board
  const openLichess = useCallback(() => {
    const fen = toFEN(board, turn, moveHistory);
    window.open(
      `https://lichess.org/analysis?fen=${encodeURIComponent(fen)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [board, turn, moveHistory]);

  // Group half-moves into pairs: [[white, black?], ...]
  const movePairs: [string, string | undefined][] = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    movePairs.push([moveHistory[i], moveHistory[i + 1]]);
  }

  // ── Captured pieces ───────────────────────────────────────────────────────
  const { capturedByWhite, capturedByBlack, advantage } = getCapturedPieces(board);

  // ── Check highlight ──────────────────────────────────────────────────────
  // Find the king that is currently in check (if any) for board highlighting
  const inCheckKingPos: [number, number] | null = (() => {
    if (isInCheck(board, 'w')) return findKing(board, 'w');
    if (isInCheck(board, 'b')) return findKing(board, 'b');
    return null;
  })();

  // ── Position evaluation bar ───────────────────────────────────────────────
  // Compute engine evaluation score (centipawns, + = white winning)
  const evalScore = (() => {
    if (status.includes("White wins")) return 99999;
    if (status.includes("Black wins")) return -99999;
    if (status.includes("Stalemate")) return 0;
    return evaluate(board);
  })();

  // Map score to 0–100% using tanh for soft clamping (100 = white completely winning)
  const evalPct = Math.max(1, Math.min(99, 50 + 50 * Math.tanh(evalScore / 400)));

  // Human-readable score label in pawn units
  const evalDisplay = Math.abs(evalScore) >= 99000
    ? (evalScore > 0 ? "1-0" : "0-1")
    : (evalScore >= 0 ? "+" : "") + (evalScore / 100).toFixed(1);

  // ── Opening name detection ────────────────────────────────────────────────
  // Only show during the opening phase (first 20 half-moves) and not after game over.
  const openingName = useMemo(
    () =>
      !isGameOver && moveHistory.length > 0 && moveHistory.length <= 20
        ? getOpeningName(moveHistory)
        : null,
    [moveHistory, isGameOver]
  );

  // ── Active board theme ───────────────────────────────────────────────────
  const activeTheme = BOARD_THEMES.find((t) => t.name === boardTheme)!;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-5">
      {/* Confetti overlay — only shown on checkmate */}
      {showConfetti && <ConfettiOverlay key={confettiKey} />}

      {/* Drag ghost piece — follows the cursor while dragging */}
      {dragging && (() => {
        const dragPiece = board[dragging.fromR][dragging.fromC];
        if (!dragPiece) return null;
        const SQUARE = 56;
        return (
          <div
            className="pointer-events-none fixed z-[200] flex items-center justify-center"
            style={{
              left: dragging.clientX - SQUARE / 2,
              top: dragging.clientY - SQUARE / 2,
              width: SQUARE,
              height: SQUARE,
              transform: "scale(1.2)",
            }}
          >
            <span
              className={`text-4xl leading-none select-none drop-shadow-lg ${
                dragPiece.color === "w"
                  ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_0_1px_rgba(0,0,0,1)]"
                  : "text-gray-900 [text-shadow:0_1px_2px_rgba(255,255,255,0.3)]"
              }`}
            >
              {UNICODE[dragPiece.color][dragPiece.type]}
            </span>
          </div>
        );
      })()}

      {/* Title + opening name grouped so gap-5 applies between this block and the controls */}
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Chess</h1>
        {openingName && (
          <span className="text-xs text-muted-foreground/80 italic select-none animate-in fade-in duration-300">
            {openingName}
          </span>
        )}
      </div>

      {/* Controls: two rows — actions on top, settings below */}
      <div className="flex flex-col items-center gap-2">

        {/* Row 1: Status + game-action buttons */}
        <div className="flex items-center gap-3 min-h-8 flex-wrap justify-center">
          {isThinking && !isGameOver ? (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              ♟ Engine thinking
              <span className="flex gap-0.5 items-center ml-0.5">
                <span className="inline-block w-1 h-1 rounded-full bg-current" style={{ animation: "dot-bounce 1.2s ease-in-out infinite 0s" }} />
                <span className="inline-block w-1 h-1 rounded-full bg-current" style={{ animation: "dot-bounce 1.2s ease-in-out infinite 0.2s" }} />
                <span className="inline-block w-1 h-1 rounded-full bg-current" style={{ animation: "dot-bounce 1.2s ease-in-out infinite 0.4s" }} />
              </span>
            </span>
          ) : status ? (
            <span
              className={`font-semibold text-sm px-3 py-1 rounded-full ${
                isGameOver
                  ? "bg-primary text-primary-foreground"
                  : "bg-yellow-400/20 text-yellow-600 dark:text-yellow-400"
              }`}
            >
              {status}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {vsAI
                ? playerColor === "w"
                  ? "⬜ Your turn (White)"
                  : "⬛ Your turn (Black)"
                : turn === "w"
                ? "⬜ White's turn"
                : "⬛ Black's turn"}
            </span>
          )}
          <button
            onClick={reset}
            className="px-3 py-1 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            New Game
          </button>
          <button
            onClick={undo}
            disabled={undoStack.length === 0 || isThinking}
            title="Undo last move (Ctrl+Z)"
            className="px-3 py-1 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↩ Undo
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0 || isThinking}
            title="Redo last undone move (Ctrl+Shift+Z)"
            className="px-3 py-1 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ↪ Redo
          </button>
          <button
            onClick={() => setFlipped((f) => !f)}
            title="Flip board (view from Black's side)"
            className="px-3 py-1 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            ⇅ Flip
          </button>
          <button
            onClick={showHint}
            disabled={!vsAI || isGameOver || isThinking || turn !== playerColor || isHinting}
            title={vsAI ? "Show best move hint (H)" : "Hints only available in vs AI mode"}
            className="px-3 py-1 text-sm rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isHinting ? "…" : "💡 Hint"}
          </button>

          {/* Sound toggle */}
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            title={soundEnabled ? "Mute sounds" : "Enable sounds"}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>

        {/* Row 2: Settings — mode, color, difficulty, time, board theme */}
        <div className="flex items-center gap-3 flex-wrap justify-center">

          {/* Mode selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground select-none">Mode:</span>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                onClick={() => setVsAI(true)}
                className={[
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  vsAI
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                ].join(" ")}
              >
                vs AI
              </button>
              <button
                onClick={() => setVsAI(false)}
                className={[
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  !vsAI
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                ].join(" ")}
              >
                2 Players
              </button>
            </div>
          </div>

          {/* Color selector — only relevant in vs AI mode */}
          {vsAI && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground select-none">Play as:</span>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                onClick={() => setPlayerColor("w")}
                title="Play as White (you move first)"
                className={[
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  playerColor === "w"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                ].join(" ")}
              >
                ⬜ White
              </button>
              <button
                onClick={() => setPlayerColor("b")}
                title="Play as Black (AI moves first)"
                className={[
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  playerColor === "b"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent",
                ].join(" ")}
              >
                ⬛ Black
              </button>
            </div>
          </div>
          )}

          {/* Difficulty selector — only relevant in vs AI mode */}
          {vsAI && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground select-none">Difficulty:</span>
            <div className="flex rounded-md overflow-hidden border border-border">
              {DIFFICULTIES.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setDifficulty(label)}
                  className={[
                    "px-2.5 py-1 text-xs font-medium transition-colors",
                    difficulty === label
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Time control selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground select-none">Time:</span>
            <div className="flex rounded-md overflow-hidden border border-border">
              {TIME_CONTROLS.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setTimeControl(label)}
                  className={[
                    "px-2 py-1 text-xs font-medium transition-colors",
                    timeControl === label
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Board theme selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground select-none">Board:</span>
            <div className="flex items-center gap-1">
              {BOARD_THEMES.map(({ name, light, dark }) => (
                <button
                  key={name}
                  onClick={() => setBoardTheme(name)}
                  title={name}
                  className={[
                    "w-6 h-6 rounded-sm overflow-hidden border-2 transition-all",
                    boardTheme === name
                      ? "border-primary scale-110 shadow-sm"
                      : "border-transparent hover:border-border",
                  ].join(" ")}
                  style={{
                    background: `linear-gradient(135deg, ${light} 50%, ${dark} 50%)`,
                  }}
                />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Board + Move History side by side */}
      <div className="flex gap-4 items-start">
        {/* Rank labels + board + file labels */}
        <div className="flex gap-2 items-start">
          {/* Evaluation bar — aligned with the board (same top spacer as rank labels) */}
          <div className="flex flex-col items-center">
            <div className="h-7 mb-1" aria-hidden="true" />
            <div
              className="w-3 rounded overflow-hidden border border-border shadow-sm"
              style={{ height: "448px" }}
              title={`Evaluation: ${evalDisplay}`}
            >
              {/* Black section (top) */}
              <div
                className="w-full bg-neutral-700 dark:bg-neutral-800"
                style={{
                  height: `${100 - evalPct}%`,
                  transition: "height 600ms cubic-bezier(0.4,0,0.2,1)",
                }}
              />
              {/* White section (bottom) */}
              <div
                className="w-full bg-white"
                style={{
                  height: `${evalPct}%`,
                  transition: "height 600ms cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
            <div className="text-[9px] font-mono text-muted-foreground mt-1 tabular-nums leading-none">
              {evalDisplay}
            </div>
          </div>

          <div className="flex flex-col">
            {/* Top captures row: black side when normal, white side when flipped */}
            <div className="flex items-center h-7 gap-0.5 mb-1 min-h-7">
              {(flipped ? capturedByWhite : capturedByBlack).map((type, i) => (
                <span key={i} className="text-lg leading-none select-none text-foreground/60">
                  {flipped ? UNICODE.b[type] : UNICODE.w[type]}
                </span>
              ))}
              {(flipped ? advantage > 0 : advantage < 0) && (
                <span className="text-xs font-semibold text-muted-foreground ml-1">
                  +{Math.abs(advantage)}
                </span>
              )}
            </div>

            <div ref={boardInnerRef} className="relative border border-border rounded overflow-hidden shadow-lg">
              {/* ── Game-over overlay ──────────────────────────────────────── */}
              {isGameOver && (
                <div className="chess-overlay-bg absolute inset-0 bg-black/45 backdrop-blur-[3px] flex items-center justify-center z-30">
                  <div className="chess-overlay-card bg-background/95 border border-border rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3 mx-4">
                    <span className="text-4xl select-none" aria-hidden="true">
                      {status.includes("on time")
                        ? "⏱"
                        : status.includes("White wins")
                        ? "♔"
                        : status.includes("Black wins")
                        ? "♚"
                        : "🤝"}
                    </span>
                    <p className="text-base font-semibold text-foreground text-center leading-snug">
                      {status}
                    </p>
                    {gameDuration !== null && (
                      <p className="text-xs text-muted-foreground/70 -mt-1 tabular-nums">
                        {moveHistory.length > 0
                          ? `${Math.ceil(moveHistory.length / 2)} move${Math.ceil(moveHistory.length / 2) !== 1 ? "s" : ""} · ${formatClock(gameDuration)}`
                          : formatClock(gameDuration)}
                      </p>
                    )}
                    <button
                      onClick={reset}
                      className="mt-1 px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      Play Again
                    </button>
                  </div>
                </div>
              )}
              {Array.from({ length: 8 }, (_, vr) => flipped ? 7 - vr : vr).map((r) => (
                <div key={r} className="flex">
                  {Array.from({ length: 8 }, (_, vc) => flipped ? 7 - vc : vc).map((c) => {
                    const piece = board[r][c];
                    const isLight = (r + c) % 2 === 0;
                    const isSelected = selected?.[0] === r && selected?.[1] === c;
                    const isLegal = legalMoves.some(
                      ([lr, lc]) => lr === r && lc === c
                    );
                    const isCapture = isLegal && board[r][c] !== null;
                    const isLastMove =
                      lastMove !== null &&
                      ((lastMove[0][0] === r && lastMove[0][1] === c) ||
                        (lastMove[1][0] === r && lastMove[1][1] === c));

                    const isCheckedKing =
                      inCheckKingPos !== null &&
                      inCheckKingPos[0] === r &&
                      inCheckKingPos[1] === c;

                    const isHintSquare =
                      hint !== null &&
                      ((hint[0][0] === r && hint[0][1] === c) ||
                        (hint[1][0] === r && hint[1][1] === c));

                    let bgColor: string = isLight ? activeTheme.light : activeTheme.dark;
                    if (isLastMove) bgColor = isLight ? "#cdd16f" : "#aaa23a";
                    if (isHintSquare) bgColor = isLight ? "#90c8f0" : "#4a9fd4";
                    if (isCheckedKing) bgColor = isLight ? "#ff6b6b" : "#cc3333";
                    if (isSelected) bgColor = "#f6f669";

                    const interactive =
                      !isGameOver && !isThinking && (!vsAI || turn === "w");

                    const isDragSource =
                      dragging !== null &&
                      dragging.fromR === r &&
                      dragging.fromC === c;

                    return (
                      <div
                        key={c}
                        onMouseDown={(e) => handlePieceMouseDown(r, c, e)}
                        onClick={() => handleClick(r, c)}
                        style={{ backgroundColor: bgColor }}
                        className={[
                          "w-14 h-14 flex items-center justify-center relative select-none",
                          interactive ? "cursor-pointer" : "cursor-default",
                        ].join(" ")}
                      >
                        {/* Last-move flash overlay — briefly pulses bright yellow then fades */}
                        {isLastMove && (
                          <div
                            key={moveAnimKey}
                            className="absolute inset-0 pointer-events-none z-[5]"
                            style={{
                              backgroundColor: "#f6f669",
                              animation: "chessSquareFlash 0.55s ease-out forwards",
                            }}
                          />
                        )}
                        {/* Legal-move dot */}
                        {isLegal && !isCapture && (
                          <div className="absolute w-5 h-5 rounded-full bg-black/20 pointer-events-none z-10" />
                        )}
                        {/* Capture ring */}
                        {isCapture && (
                          <div className="absolute inset-0 ring-4 ring-inset ring-black/30 pointer-events-none z-10" />
                        )}
                        {/* Rank label — shown on the left edge of the board only */}
                        {((!flipped && c === 0) || (flipped && c === 7)) && (
                          <span
                            className="absolute top-0.5 left-0.5 text-[10px] leading-none font-semibold select-none pointer-events-none z-10"
                            style={{ color: isLight ? activeTheme.dark : activeTheme.light }}
                          >
                            {8 - r}
                          </span>
                        )}
                        {/* File label — shown on the bottom row of the board only */}
                        {((!flipped && r === 7) || (flipped && r === 0)) && (
                          <span
                            className="absolute bottom-0.5 right-0.5 text-[10px] leading-none font-semibold select-none pointer-events-none z-10"
                            style={{ color: isLight ? activeTheme.dark : activeTheme.light }}
                          >
                            {FILES[c]}
                          </span>
                        )}
                        {/* Piece — hidden while being dragged (ghost follows cursor) */}
                        {piece && !isDragSource && (
                          <span
                            className={`text-4xl leading-none z-20 ${
                              piece.color === "w"
                                ? "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_0_1px_rgba(0,0,0,1)]"
                                : "text-gray-900 [text-shadow:0_1px_2px_rgba(255,255,255,0.3)]"
                            }`}
                          >
                            {UNICODE[piece.color][piece.type]}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Bottom captures row: white side when normal, black side when flipped */}
            <div className="flex items-center h-7 gap-0.5 mt-1 min-h-7">
              {(flipped ? capturedByBlack : capturedByWhite).map((type, i) => (
                <span key={i} className="text-lg leading-none select-none text-foreground/60">
                  {flipped ? UNICODE.w[type] : UNICODE.b[type]}
                </span>
              ))}
              {(flipped ? advantage < 0 : advantage > 0) && (
                <span className="text-xs font-semibold text-muted-foreground ml-1">
                  +{Math.abs(advantage)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Clocks + Move History */}
        <div className="flex flex-col gap-2">
          {/* Black clock (top — opponent) */}
          <div
            className={[
              "flex items-center justify-between px-3 py-1.5 rounded-lg border text-sm font-mono font-semibold transition-colors",
              turn === "b" && !isGameOver
                ? blackTime < 10000 && timeControlSecondsRef.current > 0
                  ? "bg-red-900/60 text-red-100 border-red-700 shadow-inner animate-pulse"
                  : blackTime < 30000 && timeControlSecondsRef.current > 0
                  ? "bg-red-900/60 text-red-100 border-red-700 shadow-inner"
                  : "bg-neutral-800 dark:bg-neutral-700 text-white border-neutral-600 shadow-inner"
                : "bg-card text-muted-foreground border-border opacity-60",
            ].join(" ")}
          >
            <span className="text-xs font-sans font-normal">⬛ Black</span>
            <span className="tabular-nums">{formatClock(blackTime)}</span>
          </div>

        {/* Move History Panel */}
        <div className="flex flex-col w-44 border border-border rounded-lg overflow-hidden shadow bg-card h-[448px]">
          <div className="px-3 py-2 bg-muted/60 text-xs font-semibold text-muted-foreground border-b border-border shrink-0 flex items-center justify-between">
            Move History
            <div className="flex items-center gap-1">
              {/* Copy FEN — current board position as Forsyth-Edwards Notation */}
              <button
                onClick={copyFEN}
                title="Copy board position as FEN (paste into Lichess analysis board, etc.)"
                className={[
                  "font-normal text-[10px] px-1.5 py-0.5 rounded transition-all",
                  fenCopied
                    ? "text-green-600 dark:text-green-400 opacity-100"
                    : "opacity-50 hover:opacity-100 hover:bg-muted",
                ].join(" ")}
              >
                {fenCopied ? "✓ FEN" : "FEN"}
              </button>
              {/* Copy PGN — full game move list */}
              <button
                onClick={copyPGN}
                disabled={moveHistory.length === 0}
                title="Copy game moves as PGN (paste into Lichess, Chess.com, etc.)"
                className={[
                  "font-normal text-[10px] px-1.5 py-0.5 rounded transition-all",
                  pgnCopied
                    ? "text-green-600 dark:text-green-400 opacity-100"
                    : "opacity-50 hover:opacity-100 hover:bg-muted",
                  "disabled:opacity-20 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {pgnCopied ? "✓ PGN" : "PGN"}
              </button>
              {/* Open position in Lichess analysis */}
              <button
                onClick={openLichess}
                title="Analyse current position on Lichess"
                className="flex items-center justify-center opacity-50 hover:opacity-100 hover:bg-muted rounded p-0.5 transition-all"
              >
                <ExternalLink size={10} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 text-sm font-mono">
            {movePairs.length === 0 ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                No moves yet
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="px-2 py-1 text-center w-8 font-normal">#</th>
                    <th className="px-2 py-1 text-left font-normal">White</th>
                    <th className="px-2 py-1 text-left font-normal">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {movePairs.map(([white, black], i) => {
                    const isLastPair = i === movePairs.length - 1;
                    // Odd length → white was last to move; even length → black was last
                    const highlightWhite = isLastPair && moveHistory.length % 2 === 1;
                    const highlightBlack = isLastPair && moveHistory.length % 2 === 0;
                    return (
                      <tr
                        key={i}
                        className={i % 2 === 0 ? "" : "bg-muted/30"}
                        ref={i === movePairs.length - 1 ? historyEndRef : null}
                      >
                        <td className="px-2 py-1 text-xs text-muted-foreground text-center">
                          {i + 1}
                        </td>
                        <td
                          className={[
                            "px-2 py-1 rounded-sm transition-colors",
                            highlightWhite
                              ? "bg-yellow-400/30 dark:bg-yellow-400/20 font-semibold text-foreground"
                              : "",
                          ].join(" ")}
                        >
                          {white}
                        </td>
                        <td
                          className={[
                            "px-2 py-1 rounded-sm transition-colors",
                            highlightBlack
                              ? "bg-yellow-400/30 dark:bg-yellow-400/20 font-semibold text-foreground"
                              : "text-muted-foreground",
                          ].join(" ")}
                        >
                          {black ?? ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

          {/* White clock (bottom — you) */}
          <div
            className={[
              "flex items-center justify-between px-3 py-1.5 rounded-lg border text-sm font-mono font-semibold transition-colors",
              turn === "w" && !isGameOver
                ? whiteTime < 10000 && timeControlSecondsRef.current > 0
                  ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-100 border-red-300 dark:border-red-700 shadow-inner animate-pulse"
                  : whiteTime < 30000 && timeControlSecondsRef.current > 0
                  ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-100 border-red-300 dark:border-red-700 shadow-inner"
                  : "bg-white dark:bg-neutral-200 text-neutral-900 border-neutral-300 shadow-inner"
                : "bg-card text-muted-foreground border-border opacity-60",
            ].join(" ")}
          >
            <span className="text-xs font-sans font-normal">⬜ White</span>
            <span className="tabular-nums">{formatClock(whiteTime)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {vsAI
          ? `You play ${playerColor === "w" ? "White" : "Black"} · Engine plays ${playerColor === "w" ? "Black" : "White"} (depth ${DIFFICULTIES.find((d) => d.label === difficulty)?.depth ?? 3})`
          : "Two-player mode · White vs Black (same device)"}
      </p>

      {/* Win / Loss / Draw statistics (vs AI only) */}
      {(() => {
        const total = stats.wins + stats.losses + stats.draws;
        const winPct  = total > 0 ? Math.round((stats.wins  / total) * 100) : 0;
        const lossPct = total > 0 ? Math.round((stats.losses / total) * 100) : 0;
        const drawPct = total > 0 ? 100 - winPct - lossPct : 0;
        return (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground select-none">vs AI record:</span>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                {stats.wins}W
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold tabular-nums text-red-500 dark:text-red-400">
                {stats.losses}L
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-semibold tabular-nums text-muted-foreground">
                {stats.draws}D
              </span>
              {total > 0 && (
                <span className="text-muted-foreground/60 tabular-nums">
                  ({winPct}% wins)
                </span>
              )}
              <button
                onClick={() => setStats({ wins: 0, losses: 0, draws: 0 })}
                title="Reset statistics"
                className="ml-1 text-[10px] text-muted-foreground opacity-40 hover:opacity-80 transition-opacity"
              >
                reset
              </button>
            </div>
            {/* Visual win-rate bar — only shown after at least one game */}
            {total > 0 && (
              <div
                className="flex h-1.5 w-48 overflow-hidden rounded-full bg-border"
                title={`${stats.wins}W / ${stats.losses}L / ${stats.draws}D`}
              >
                {stats.wins > 0 && (
                  <div
                    className="bg-green-500 dark:bg-green-400 transition-all duration-500"
                    style={{ width: `${winPct}%` }}
                  />
                )}
                {stats.draws > 0 && (
                  <div
                    className="bg-muted-foreground/40 transition-all duration-500"
                    style={{ width: `${drawPct}%` }}
                  />
                )}
                {stats.losses > 0 && (
                  <div
                    className="bg-red-500 dark:bg-red-400 transition-all duration-500"
                    style={{ width: `${lossPct}%` }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Pawn Promotion Dialog */}
      {pendingPromotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 flex flex-col items-center gap-4">
            <h2 className="text-base font-semibold text-foreground tracking-tight">
              Promote Pawn
            </h2>
            <p className="text-xs text-muted-foreground -mt-1">Choose a piece</p>
            <div className="flex gap-3">
              {(["Q", "R", "B", "N"] as PieceType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => confirmPromotion(type)}
                  title={(({ Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }) as Record<string, string>)[type]}
                  className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-secondary hover:bg-accent hover:border-primary transition-colors shadow-sm group"
                >
                  <span className={`text-4xl leading-none group-hover:scale-110 transition-transform ${
                    pendingPromotion?.color === "b"
                      ? "text-gray-900 [text-shadow:0_1px_2px_rgba(255,255,255,0.3)]"
                      : "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_0_1px_rgba(0,0,0,1)]"
                  }`}>
                    {UNICODE[pendingPromotion?.color ?? "w"][type]}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {(({ Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }) as Record<string, string>)[type]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
