"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type Board,
  type Color,
  UNICODE,
  initBoard,
  applyMove,
  isInCheck,
  getLegalMoves,
  hasAnyMoves,
  getBestMove,
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

export default function ChessPage() {
  const [board, setBoard] = useState<Board>(initBoard);
  const [turn, setTurn] = useState<Color>("w");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [legalMoves, setLegalMoves] = useState<[number, number][]>([]);
  const [status, setStatus] = useState<string>("");
  const [isThinking, setIsThinking] = useState(false);

  const isGameOver =
    status.includes("Checkmate") || status.includes("Stalemate");

  // ── Engine move (black) ──────────────────────────────────────────────────
  useEffect(() => {
    if (turn !== "b" || isGameOver || isThinking) return;

    setIsThinking(true);
    // Yield to the browser so the board re-renders before we block the thread.
    const id = setTimeout(() => {
      const move = getBestMove(board, "b", 3);
      if (move) {
        const next = applyMove(board, move.fr, move.fc, move.tr, move.tc);
        setBoard(next);
        setTurn("w");
        setStatus(getStatus(next, "b"));
      }
      setIsThinking(false);
    }, 30);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, board]);

  // ── Player click ─────────────────────────────────────────────────────────
  const handleClick = useCallback(
    (r: number, c: number) => {
      if (isGameOver || isThinking || turn !== "w") return;

      const piece = board[r][c];

      if (selected) {
        const [sr, sc] = selected;
        const isLegal = legalMoves.some(([lr, lc]) => lr === r && lc === c);

        if (isLegal) {
          const next = applyMove(board, sr, sc, r, c);
          setBoard(next);
          setTurn("b");
          setStatus(getStatus(next, "w"));
          setSelected(null);
          setLegalMoves([]);
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
  };

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
      </div>

      {/* Board */}
      <div className="flex gap-2 items-start">
        {/* Rank labels */}
        <div className="flex flex-col">
          {RANKS.map((rank) => (
            <div
              key={rank}
              className="w-5 h-14 flex items-center justify-center text-xs text-muted-foreground select-none"
            >
              {rank}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          <div className="border border-border rounded overflow-hidden shadow-lg">
            {board.map((row, r) => (
              <div key={r} className="flex">
                {row.map((piece, c) => {
                  const isLight = (r + c) % 2 === 0;
                  const isSelected = selected?.[0] === r && selected?.[1] === c;
                  const isLegal = legalMoves.some(
                    ([lr, lc]) => lr === r && lc === c
                  );
                  const isCapture = isLegal && board[r][c] !== null;

                  let bg = isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]";
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
            {FILES.map((file) => (
              <div
                key={file}
                className="w-14 flex items-center justify-center text-xs text-muted-foreground select-none"
              >
                {file}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        You play White · Engine plays Black (depth 3)
      </p>
    </div>
  );
}
