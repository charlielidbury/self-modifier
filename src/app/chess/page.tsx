"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

type Snapshot = {
  board: Board;
  status: string;
  lastMove: [[number, number], [number, number]] | null;
  moveHistory: string[];
};

export default function ChessPage() {
  const [board, setBoard] = useState<Board>(initBoard);
  const [turn, setTurn] = useState<Color>("w");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [legalMoves, setLegalMoves] = useState<[number, number][]>([]);
  const [status, setStatus] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);
  const [lastMove, setLastMove] = useState<[[number, number], [number, number]] | null>(null);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<DifficultyLabel>("Hard");
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{
    sr: number; sc: number; r: number; c: number;
  } | null>(null);
  const historyEndRef = useRef<HTMLTableRowElement>(null);
  const [pgnCopied, setPgnCopied] = useState(false);

  const isGameOver =
    status.includes("Checkmate") || status.includes("Stalemate");

  // Auto-scroll move history to bottom when moves are added
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [moveHistory]);

  // ── Engine move (black) ──────────────────────────────────────────────────
  useEffect(() => {
    if (turn !== "b" || isGameOver || isThinking) return;

    setIsThinking(true);
    const depth = DIFFICULTIES.find((d) => d.label === difficulty)?.depth ?? 3;
    // Yield to the browser so the board re-renders before we block the thread.
    const id = setTimeout(() => {
      const move = getBestMove(board, "b", depth);
      if (move) {
        const next = applyMove(board, move.fr, move.fc, move.tr, move.tc);
        const san = toSAN(board, move.fr, move.fc, move.tr, move.tc, next, "b");
        setBoard(next);
        setTurn("w");
        setStatus(getStatus(next, "b"));
        setLastMove([[move.fr, move.fc], [move.tr, move.tc]]);
        setMoveHistory((h) => [...h, san]);
      }
      setIsThinking(false);
    }, 30);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, board, difficulty]);

  // ── Undo ──────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setBoard(prev.board);
      setTurn("w");
      setStatus(prev.status);
      setLastMove(prev.lastMove);
      setMoveHistory(prev.moveHistory);
      setSelected(null);
      setLegalMoves([]);
      return stack.slice(0, -1);
    });
  }, []);

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
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, isThinking, undoStack.length]);

  // ── Player click ─────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (r: number, c: number) => {
      if (isGameOver || isThinking || turn !== "w") return;

      const piece = board[r][c];

      if (selected) {
        const [sr, sc] = selected;
        const isLegal = legalMoves.some(([lr, lc]) => lr === r && lc === c);

        if (isLegal) {
          // Check if this move is a pawn promotion (white pawn reaching row 0)
          const movingPiece = board[sr][sc];
          if (movingPiece?.type === "P" && movingPiece.color === "w" && r === 0) {
            // Pause and ask the player which piece to promote to
            setSelected(null);
            setLegalMoves([]);
            setPendingPromotion({ sr, sc, r, c });
            return;
          }

          // Save snapshot before committing the move so it can be undone
          setUndoStack((stack) => [
            ...stack,
            { board, status, lastMove, moveHistory },
          ]);
          const next = applyMove(board, sr, sc, r, c);
          const san = toSAN(board, sr, sc, r, c, next, "w");
          setBoard(next);
          setTurn("b");
          setStatus(getStatus(next, "w"));
          setLastMove([[sr, sc], [r, c]]);
          setSelected(null);
          setLegalMoves([]);
          setMoveHistory((h) => [...h, san]);
          return;
        }

        if (piece?.color === "w") {
          setSelected([r, c]);
          setLegalMoves(getLegalMoves(board, r, c));
          return;
        }

        setSelected(null);
        setLegalMoves([]);
        return;
      }

      if (piece?.color === "w") {
        setSelected([r, c]);
        setLegalMoves(getLegalMoves(board, r, c));
      }
    },
    [board, selected, legalMoves, turn, isGameOver, isThinking]
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
    setPendingPromotion(null);
  };

  // Called when the player selects a promotion piece from the dialog
  const confirmPromotion = useCallback((promoteTo: PieceType) => {
    if (!pendingPromotion) return;
    const { sr, sc, r, c } = pendingPromotion;
    setPendingPromotion(null);
    // Save snapshot for undo
    setUndoStack((stack) => [
      ...stack,
      { board, status, lastMove, moveHistory },
    ]);
    const next = applyMove(board, sr, sc, r, c, promoteTo);
    const san = toSAN(board, sr, sc, r, c, next, "w", promoteTo);
    setBoard(next);
    setTurn("b");
    setStatus(getStatus(next, "w"));
    setLastMove([[sr, sc], [r, c]]);
    setMoveHistory((h) => [...h, san]);
  }, [pendingPromotion, board, status, lastMove, moveHistory]);

  // Copy game moves as PGN to clipboard
  const copyPGN = useCallback(() => {
    if (moveHistory.length === 0) return;
    let pgn = "";
    for (let i = 0; i < moveHistory.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      pgn += `${moveNum}. ${moveHistory[i]}`;
      if (moveHistory[i + 1]) pgn += ` ${moveHistory[i + 1]}`;
      if (i + 2 < moveHistory.length) pgn += " ";
    }
    navigator.clipboard.writeText(pgn).then(() => {
      setPgnCopied(true);
      setTimeout(() => setPgnCopied(false), 2000);
    });
  }, [moveHistory]);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Chess</h1>

      {/* Status bar */}
      <div className="flex items-center gap-3 min-h-8">
        {isThinking && !isGameOver ? (
          <span className="text-sm text-muted-foreground animate-pulse">
            ♟ Engine thinking…
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
            ⬜ Your turn (White)
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
          onClick={() => setFlipped((f) => !f)}
          title="Flip board (view from Black's side)"
          className="px-3 py-1 text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-accent transition-colors"
        >
          ⇅ Flip
        </button>

        {/* Difficulty selector */}
        <div className="flex items-center gap-1.5 ml-2">
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

          {/* Rank labels — spacer at top aligns them with the board squares */}
          <div className="flex flex-col">
            <div className="h-7 mb-1" aria-hidden="true" />
            {(flipped ? [...RANKS].reverse() : RANKS).map((rank) => (
              <div
                key={rank}
                className="w-5 h-14 flex items-center justify-center text-xs text-muted-foreground select-none"
              >
                {rank}
              </div>
            ))}
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

            <div className="border border-border rounded overflow-hidden shadow-lg">
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

                    let bg = isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]";
                    if (isLastMove) bg = isLight ? "bg-[#cdd16f]" : "bg-[#aaa23a]";
                    if (isCheckedKing) bg = isLight ? "bg-[#ff6b6b]" : "bg-[#cc3333]";
                    if (isSelected) bg = "bg-yellow-400";

                    const interactive =
                      !isGameOver && !isThinking && turn === "w";

                    return (
                      <div
                        key={c}
                        onClick={() => handleClick(r, c)}
                        className={[
                          "w-14 h-14 flex items-center justify-center relative select-none",
                          bg,
                          interactive ? "cursor-pointer" : "cursor-default",
                        ].join(" ")}
                      >
                        {/* Legal-move dot */}
                        {isLegal && !isCapture && (
                          <div className="absolute w-5 h-5 rounded-full bg-black/20 pointer-events-none z-10" />
                        )}
                        {/* Capture ring */}
                        {isCapture && (
                          <div className="absolute inset-0 ring-4 ring-inset ring-black/30 pointer-events-none z-10" />
                        )}
                        {/* Piece */}
                        {piece && (
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

            {/* File labels */}
            <div className="flex mt-1">
              {(flipped ? [...FILES].reverse() : FILES).map((file) => (
                <div
                  key={file}
                  className="w-14 flex items-center justify-center text-xs text-muted-foreground select-none"
                >
                  {file}
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

        {/* Move History Panel */}
        <div className="flex flex-col w-44 border border-border rounded-lg overflow-hidden shadow bg-card h-[448px]">
          <div className="px-3 py-2 bg-muted/60 text-xs font-semibold text-muted-foreground border-b border-border shrink-0 flex items-center justify-between">
            Move History
            <button
              onClick={copyPGN}
              disabled={moveHistory.length === 0}
              title="Copy game moves as PGN (paste into Lichess, Chess.com, etc.)"
              className={[
                "ml-2 font-normal text-[10px] px-1.5 py-0.5 rounded transition-all",
                pgnCopied
                  ? "text-green-600 dark:text-green-400 opacity-100"
                  : "opacity-50 hover:opacity-100 hover:bg-muted",
                "disabled:opacity-20 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {pgnCopied ? "✓ Copied" : "Copy PGN"}
            </button>
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
                  {movePairs.map(([white, black], i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? "" : "bg-muted/30"}
                      ref={i === movePairs.length - 1 ? historyEndRef : null}
                    >
                      <td className="px-2 py-1 text-xs text-muted-foreground text-center">
                        {i + 1}
                      </td>
                      <td className="px-2 py-1">{white}</td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {black ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        You play White · Engine plays Black (depth {DIFFICULTIES.find((d) => d.label === difficulty)?.depth ?? 3})
      </p>

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
                  title={{ Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }[type]}
                  className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-secondary hover:bg-accent hover:border-primary transition-colors shadow-sm group"
                >
                  <span className="text-4xl leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8),0_0_1px_rgba(0,0,0,1)] group-hover:scale-110 transition-transform">
                    {UNICODE.w[type]}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {{ Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" }[type]}
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
