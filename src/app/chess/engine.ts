// ─────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
export type Color = "w" | "b";
export interface Piece {
  type: PieceType;
  color: Color;
}
export type Square = Piece | null;
export type Board = Square[][];
export interface Move {
  fr: number;
  fc: number;
  tr: number;
  tc: number;
}

// ─────────────────────────────────────────────
//  Display
// ─────────────────────────────────────────────
export const UNICODE: Record<Color, Record<PieceType, string>> = {
  w: { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙" },
  b: { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" },
};

// ─────────────────────────────────────────────
//  Board helpers
// ─────────────────────────────────────────────
export function initBoard(): Board {
  const b: Board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    b[0][c] = { type: back[c], color: "b" };
    b[1][c] = { type: "P", color: "b" };
    b[6][c] = { type: "P", color: "w" };
    b[7][c] = { type: back[c], color: "w" };
  }
  return b;
}

function inBounds(r: number, c: number) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function getRawMoves(
  board: Board,
  r: number,
  c: number
): [number, number][] {
  const piece = board[r][c];
  if (!piece) return [];
  const { type, color } = piece;
  const moves: [number, number][] = [];
  const dir = color === "w" ? -1 : 1;

  const enemy = (tr: number, tc: number) =>
    inBounds(tr, tc) && board[tr][tc] !== null && board[tr][tc]!.color !== color;
  const empty = (tr: number, tc: number) =>
    inBounds(tr, tc) && board[tr][tc] === null;
  const free = (tr: number, tc: number) =>
    inBounds(tr, tc) && board[tr][tc]?.color !== color;

  const slide = (dr: number, dc: number) => {
    let tr = r + dr,
      tc = c + dc;
    while (inBounds(tr, tc)) {
      if (board[tr][tc] === null) {
        moves.push([tr, tc]);
      } else {
        if (board[tr][tc]!.color !== color) moves.push([tr, tc]);
        break;
      }
      tr += dr;
      tc += dc;
    }
  };

  switch (type) {
    case "P": {
      if (empty(r + dir, c)) {
        moves.push([r + dir, c]);
        const startRow = color === "w" ? 6 : 1;
        if (r === startRow && empty(r + 2 * dir, c))
          moves.push([r + 2 * dir, c]);
      }
      if (enemy(r + dir, c - 1)) moves.push([r + dir, c - 1]);
      if (enemy(r + dir, c + 1)) moves.push([r + dir, c + 1]);
      break;
    }
    case "N":
      for (const [dr, dc] of [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ] as [number, number][])
        if (free(r + dr, c + dc)) moves.push([r + dr, c + dc]);
      break;
    case "B":
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      break;
    case "R":
      slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      break;
    case "Q":
      slide(-1, -1); slide(-1, 1); slide(1, -1); slide(1, 1);
      slide(-1, 0); slide(1, 0); slide(0, -1); slide(0, 1);
      break;
    case "K":
      for (const [dr, dc] of [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1],
      ] as [number, number][])
        if (free(r + dr, c + dc)) moves.push([r + dr, c + dc]);
      break;
  }
  return moves;
}

export function applyMove(
  board: Board,
  fr: number,
  fc: number,
  tr: number,
  tc: number
): Board {
  const next = board.map((row) => [...row]);
  next[tr][tc] = next[fr][fc];
  next[fr][fc] = null;
  if (next[tr][tc]?.type === "P" && (tr === 0 || tr === 7))
    next[tr][tc] = { type: "Q", color: next[tr][tc]!.color };
  return next;
}

export function findKing(board: Board, color: Color): [number, number] | null {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.type === "K" && board[r][c]?.color === color)
        return [r, c];
  return null;
}

export function isInCheck(board: Board, color: Color): boolean {
  const king = findKing(board, color);
  if (!king) return false;
  const [kr, kc] = king;
  const opp: Color = color === "w" ? "b" : "w";
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === opp)
        if (getRawMoves(board, r, c).some(([tr, tc]) => tr === kr && tc === kc))
          return true;
  return false;
}

export function getLegalMoves(
  board: Board,
  r: number,
  c: number
): [number, number][] {
  const piece = board[r][c];
  if (!piece) return [];
  return getRawMoves(board, r, c).filter(([tr, tc]) => {
    const next = applyMove(board, r, c, tr, tc);
    return !isInCheck(next, piece.color);
  });
}

export function hasAnyMoves(board: Board, color: Color): boolean {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color)
        if (getLegalMoves(board, r, c).length > 0) return true;
  return false;
}

// ─────────────────────────────────────────────
//  Engine — evaluation
//
//  Board orientation:
//    row 0 = rank 8  (black's back rank, top of screen)
//    row 7 = rank 1  (white's back rank, bottom of screen)
//
//  All PST tables are defined from white's perspective:
//    PST[0] = rank 8 side (where white advances TO)
//    PST[7] = rank 1 side (where white starts FROM)
//  For black pieces we mirror: PST[7 - r][c]
//  Score is always from white's perspective (+good for white, −good for black)
// ─────────────────────────────────────────────

const PIECE_VALUES: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 20000,
};

/* eslint-disable */
const PST: Record<PieceType, number[][]> = {
  P: [
    [  0,   0,   0,   0,   0,   0,   0,   0],
    [ 50,  50,  50,  50,  50,  50,  50,  50],
    [ 10,  10,  20,  30,  30,  20,  10,  10],
    [  5,   5,  10,  25,  25,  10,   5,   5],
    [  0,   0,   0,  20,  20,   0,   0,   0],
    [  5,  -5, -10,   0,   0, -10,  -5,   5],
    [  5,  10,  10, -20, -20,  10,  10,   5],
    [  0,   0,   0,   0,   0,   0,   0,   0],
  ],
  N: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20,   0,   0,   0,   0, -20, -40],
    [-30,   0,  10,  15,  15,  10,   0, -30],
    [-30,   5,  15,  20,  20,  15,   5, -30],
    [-30,   0,  15,  20,  20,  15,   0, -30],
    [-30,   5,  10,  15,  15,  10,   5, -30],
    [-40, -20,   0,   5,   5,   0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  B: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,   5,  10,  10,   5,   0, -10],
    [-10,   5,   5,  10,  10,   5,   5, -10],
    [-10,   0,  10,  10,  10,  10,   0, -10],
    [-10,  10,  10,  10,  10,  10,  10, -10],
    [-10,   5,   0,   0,   0,   0,   5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  R: [
    [  0,   0,   0,   0,   0,   0,   0,   0],
    [  5,  10,  10,  10,  10,  10,  10,   5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [ -5,   0,   0,   0,   0,   0,   0,  -5],
    [  0,   0,   0,   5,   5,   0,   0,   0],
  ],
  Q: [
    [-20, -10, -10,  -5,  -5, -10, -10, -20],
    [-10,   0,   0,   0,   0,   0,   0, -10],
    [-10,   0,   5,   5,   5,   5,   0, -10],
    [ -5,   0,   5,   5,   5,   5,   0,  -5],
    [  0,   0,   5,   5,   5,   5,   0,  -5],
    [-10,   5,   5,   5,   5,   5,   0, -10],
    [-10,   0,   5,   0,   0,   0,   0, -10],
    [-20, -10, -10,  -5,  -5, -10, -10, -20],
  ],
  K: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [ 20,  20,   0,   0,   0,   0,  20,  20],
    [ 20,  30,  10,   0,   0,  10,  30,  20],
  ],
};
/* eslint-enable */

function pst(type: PieceType, color: Color, r: number, c: number): number {
  // White advances toward row 0; table defined from that perspective.
  // Black advances toward row 7; mirror rows for them.
  const row = color === "w" ? r : 7 - r;
  return PST[type][row][c];
}

function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = PIECE_VALUES[p.type] + pst(p.type, p.color, r, c);
      score += p.color === "w" ? val : -val;
    }
  return score;
}

// ─────────────────────────────────────────────
//  Engine — search
// ─────────────────────────────────────────────

function getAllMoves(board: Board, color: Color): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.color === color)
        for (const [tr, tc] of getLegalMoves(board, r, c))
          moves.push({ fr: r, fc: c, tr, tc });
  return moves;
}

function minimax(
  board: Board,
  depth: number,
  alpha: number,
  beta: number,
  color: Color
): number {
  if (depth === 0) return evaluate(board);

  const moves = getAllMoves(board, color);
  if (moves.length === 0) {
    if (isInCheck(board, color)) return color === "w" ? -99999 : 99999;
    return 0; // stalemate
  }

  const opp: Color = color === "w" ? "b" : "w";
  if (color === "w") {
    let best = -Infinity;
    for (const { fr, fc, tr, tc } of moves) {
      const val = minimax(applyMove(board, fr, fc, tr, tc), depth - 1, alpha, beta, opp);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { fr, fc, tr, tc } of moves) {
      const val = minimax(applyMove(board, fr, fc, tr, tc), depth - 1, alpha, beta, opp);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/** Returns the best move for `color` at the given search depth. */
export function getBestMove(
  board: Board,
  color: Color,
  depth = 3
): Move | null {
  const moves = getAllMoves(board, color);
  if (moves.length === 0) return null;

  const opp: Color = color === "w" ? "b" : "w";
  let bestMove: Move | null = null;
  let bestScore = color === "w" ? -Infinity : Infinity;

  for (const move of moves) {
    const score = minimax(
      applyMove(board, move.fr, move.fc, move.tr, move.tc),
      depth - 1,
      -Infinity,
      Infinity,
      opp
    );
    if (color === "w" ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}
