/**
 * "More like this" (BUILD_PROMPT §7 ★): embedding nearest-neighbors over listings. Pure and
 * deterministic — given precomputed listing vectors it ranks candidates by cosine similarity to
 * a target listing. No model, no DB. Personality is not involved, so nothing here is secret.
 */
import { cosine } from "./vec";

export interface Vectored {
  id: string;
  vector: number[];
}

export interface Neighbor<T> {
  item: T;
  score: number;
}

/**
 * Rank `candidates` by cosine similarity to `target`, returning the top `k`. The candidate whose
 * id equals `excludeId` (typically the source listing itself) is skipped. Ties break by id so the
 * order is deterministic.
 */
export function moreLikeThis<T extends Vectored>(
  target: number[],
  candidates: T[],
  opts: { k?: number; excludeId?: string } = {},
): Neighbor<T>[] {
  const { k = 5, excludeId } = opts;
  return candidates
    .filter((c) => c.id !== excludeId && c.vector.length === target.length)
    .map((item) => ({ item, score: cosine(target, item.vector) }))
    .sort((a, b) => b.score - a.score || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0))
    .slice(0, k);
}
