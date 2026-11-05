// The workspace board: 3 columns by 2 rows of spots. Cards you open or place are yours and stay
// until you close them; a locked card cannot be moved or displaced. The scene's own cards fill the
// free spots and leave with the scene. With nothing of yours on the board, it is the scene's layout.
import type { PanelId } from "./types";

export const COLS = 3, ROWS = 2, SPOTS = COLS * ROWS;
/** One entry per spot, row by row. */
export type Board = (PanelId | null)[];
export const emptyBoard = (): Board => Array(SPOTS).fill(null);

export interface Placed { id: PanelId; spot: number; mine: boolean }

/** What is on screen: your cards where you put them, then the scene's cards in the free spots. */
export function arrange(board: Board, scene: readonly PanelId[]): Placed[] {
  const out: Placed[] = board.flatMap((id, spot) => (id ? [{ id, spot, mine: true }] : []));
  const free = board.map((id, spot) => (id ? -1 : spot)).filter((x) => x >= 0);
  for (const id of scene) {
    if (board.includes(id) || !free.length) continue;
    out.push({ id, spot: free.shift()!, mine: false });
  }
  return out.sort((a, b) => a.spot - b.spot);
}

/** Rows in use: one row unless something sits in the second. */
export const rowsUsed = (placed: Placed[]) => (placed.some((p) => p.spot >= COLS) ? 2 : 1);

/** Opens a card in the first free spot (after the cards on screen), or does nothing if the board is full. */
export function openCard(board: Board, id: PanelId, onScreen: Placed[] = []): Board {
  if (board.includes(id)) return board;
  const taken = new Set([...onScreen.map((p) => p.spot), ...board.map((x, i) => (x ? i : -1))]);
  let spot = board.findIndex((x, i) => !x && !taken.has(i));
  if (spot < 0) spot = board.findIndex((x) => !x);
  if (spot < 0) return board;
  const next = [...board];
  next[spot] = id;
  return next;
}

export const closeCard = (board: Board, id: PanelId): Board => board.map((x) => (x === id ? null : x));

/**
 * Puts `id` on `spot`. A card of yours already there swaps into the spot `id` came from, or into
 * the first free spot when `id` was a scene card. Locked cards neither move nor get displaced.
 */
export function placeCard(board: Board, locked: readonly PanelId[], id: PanelId, spot: number, onScreen: Placed[] = []): Board {
  if (spot < 0 || spot >= SPOTS || locked.includes(id)) return board;
  void onScreen; // scene cards reflow into the free spots on their own (arrange)
  const occupant = board[spot];
  if (occupant === id) return board;
  if (occupant && locked.includes(occupant)) return board;
  const from = board.indexOf(id);
  const next = [...board];
  next[spot] = id;
  if (from >= 0) next[from] = occupant;
  else if (occupant) {
    const free = next.findIndex((x) => !x);
    if (free < 0) return board; // full: nowhere for your card to go
    next[free] = occupant;
  }
  return next;
}

/** Locking a scene card keeps it: it becomes yours where it is. */
export function lockCard(board: Board, locked: readonly PanelId[], id: PanelId, onScreen: Placed[] = []): { board: Board; locked: PanelId[] } {
  if (locked.includes(id)) return { board, locked: locked.filter((x) => x !== id) };
  let next = board;
  if (!board.includes(id)) {
    const p = onScreen.find((x) => x.id === id);
    next = p ? placeCard(board, locked, id, p.spot, onScreen) : openCard(board, id, onScreen);
  }
  return { board: next, locked: [...locked, id] };
}

/** Reads a saved board safely. */
export function loadBoard(raw: string | null, valid: readonly PanelId[]): Board {
  try {
    const b = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(b) || b.length !== SPOTS) return emptyBoard();
    const seen = new Set<PanelId>();
    return b.map((x) => (valid.includes(x) && !seen.has(x) ? (seen.add(x), x) : null));
  } catch { return emptyBoard(); }
}
