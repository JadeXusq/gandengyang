/**
 * 牌定义与基础规则：54 张牌（含大小王）
 *
 * 牌 id 编码：0..51 = suit*13 + (rank-1)，52 = 小王，53 = 大王
 * 花色顺序：0=♠ 1=♥ 2=♦ 3=♣
 * 干瞪眼有效 rank：3(=1) .. A(=12), 2(=13)
 * rank 1(Ace) 和 rank 2 在标准牌中不存在（3 最小，2 最大通过 rank 14 表示）
 *
 * 实际映射：
 *   id % 13 + 1 → rawRank: 1..13
 *   rawRank 1 = 3, 2 = 4, ..., 10 = 10, 11 = J, 12 = Q, 0(13) = K, ???
 *
 * 简化方案：复用标准 52 张编码，但 weight 映射为干瞪眼的顺序
 *   rawRank (id%13+1): 1=A, 2=2, 3=3, ..., 13=K
 *   干瞪眼 weight: 3→1, 4→2, ..., K→11, A→12, 2→13
 *   即 weight = rawRank <= 1 ? 12 : rawRank <= 2 ? 13 : rawRank - 2
 */

export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number] | "JOKER";

export const BLACK_JOKER_ID = 52;
export const RED_JOKER_ID = 53;
export const DECK_SIZE = 54;

/** 庄家手牌数 */
export const DEALER_HAND_SIZE = 6;
/** 闲家手牌数 */
export const NON_DEALER_HAND_SIZE = 5;

export interface Card {
  id: number;
  suit: Suit;
  /** 原始 rank：1=A, 2..10, 11=J, 12=Q, 13=K；王为 0 */
  rank: number;
}

export function cardFromId(id: number): Card {
  if (id === BLACK_JOKER_ID) return { id, suit: "JOKER", rank: 0 };
  if (id === RED_JOKER_ID) return { id, suit: "JOKER", rank: 0 };
  const suit = SUITS[Math.floor(id / 13)];
  const rank = (id % 13) + 1;
  return { id, suit, rank };
}

export function isJoker(id: number): boolean {
  return id === BLACK_JOKER_ID || id === RED_JOKER_ID;
}

export function isRed(id: number): boolean {
  if (id === RED_JOKER_ID) return true;
  if (id === BLACK_JOKER_ID) return false;
  const suit = SUITS[Math.floor(id / 13)];
  return suit === "H" || suit === "D";
}

/**
 * 干瞪眼点数权重：3→1, 4→2, ..., K→11, A→12, 2→13
 * 王返回 0（不参与权重比较）
 */
export function cardWeight(id: number): number {
  if (isJoker(id)) return 0;
  const rank = (id % 13) + 1; // 1=A, 2..10, 11=J, 12=Q, 13=K
  if (rank === 1) return 12; // A → 12
  if (rank === 2) return 13; // 2 → 13
  return rank - 2; // 3→1, 4→2, ..., 13(K)→11
}

/** 从权重反推原始 rank（用于调试/显示）：weight 1..13 → rank 3..A,2 */
export function weightToRank(w: number): number {
  if (w <= 11) return w + 2; // weight 1→rank 3, ..., 11→13(K)
  if (w === 12) return 1; // A
  return 2; // 2
}

/** 手牌展示序：按权重升序，同权重红前黑后，王在最后 */
export function sortHand(ids: number[]): number[] {
  return [...ids].sort((a, b) => {
    const ja = isJoker(a);
    const jb = isJoker(b);
    if (ja !== jb) return ja ? 1 : -1;
    if (ja && jb) return a - b;
    const wa = cardWeight(a);
    const wb = cardWeight(b);
    if (wa !== wb) return wa - wb;
    const redA = isRed(a) ? 0 : 1;
    const redB = isRed(b) ? 0 : 1;
    if (redA !== redB) return redA - redB;
    return a - b;
  });
}

export function createDeck(): number[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/** 牌面文字（调试/日志用），如 ♠3、♥A、大王 */
export function cardName(id: number): string {
  if (id === RED_JOKER_ID) return "大王";
  if (id === BLACK_JOKER_ID) return "小王";
  const c = cardFromId(id);
  const suitSym = { S: "♠", H: "♥", D: "♦", C: "♣" }[
    c.suit as "S" | "H" | "D" | "C"
  ];
  const rankSym = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ][c.rank - 1];
  return suitSym + rankSym;
}
