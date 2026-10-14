/**
 * AI 策略（人机补位 / 超时托管共用）
 *
 * 自由出牌：优先出长牌型（消耗手牌），再单张最小
 * 接牌：贪心最小接，炸弹视对手剩余牌数决定是否使用
 */
import { findFreePlays, findValidResponses, Play } from "./play";

export type AiDifficulty = "easy" | "normal" | "hard";

/** 自由出牌选择 */
export function chooseFreePlay(
  hand: number[],
  _playerCount: number,
  _difficulty: AiDifficulty = "normal"
): number[] {
  const plays = findFreePlays(hand);
  if (plays.length === 0) return [];

  // 如果只剩一种出法，直接出
  if (plays.length === 1) return plays[0]!.cards;

  // 优先出顺子/连对（消耗多张）
  const longPlays = plays.filter(
    (p) => p.type === "STRAIGHT" || p.type === "DPRIGHT"
  );
  if (longPlays.length > 0) {
    longPlays.sort(
      (a, b) => b.length - a.length || a.startWeight - b.startWeight
    );
    return longPlays[0]!.cards;
  }

  // 出对子（最小权重优先）
  const pairs = plays.filter((p) => p.type === "PAIR");
  if (pairs.length > 0) {
    pairs.sort((a, b) => a.startWeight - b.startWeight);
    return pairs[0]!.cards;
  }

  // 出单张（最小权重优先，保留炸弹）
  const singles = plays.filter((p) => p.type === "SINGLE");
  if (singles.length > 0) {
    singles.sort((a, b) => a.startWeight - b.startWeight);
    return singles[0]!.cards;
  }

  // 只有炸弹，出最小的
  const bombs = plays.filter(
    (p) => p.type === "BOMB3" || p.type === "BOMB4" || p.type === "ROCKET"
  );
  if (bombs.length > 0) {
    bombs.sort((a, b) => a.startWeight - b.startWeight);
    return bombs[0]!.cards;
  }

  return plays[0]!.cards;
}

/** 接牌决策：返回 null 表示过 */
export function chooseResponse(
  hand: number[],
  lastPlay: Play,
  opponentMinHand: number,
  difficulty: AiDifficulty = "normal"
): number[] | null {
  const responses = findValidResponses(lastPlay, hand);
  if (responses.length === 0) return null;

  const nonBombs = responses.filter(
    (p) => p.type !== "BOMB3" && p.type !== "BOMB4" && p.type !== "ROCKET"
  );
  const bombs = responses.filter(
    (p) => p.type === "BOMB3" || p.type === "BOMB4" || p.type === "ROCKET"
  );

  // 优先出非炸弹（最小权重）
  if (nonBombs.length > 0) {
    nonBombs.sort((a, b) => a.startWeight - b.startWeight);
    return nonBombs[0]!.cards;
  }

  if (bombs.length === 0) return null;

  // easy 难度：不用炸弹
  if (difficulty === "easy") return null;

  // 对手剩牌少（<=2）时积极用炸弹
  if (opponentMinHand <= 2) {
    bombs.sort((a, b) => a.startWeight - b.startWeight);
    return bombs[0]!.cards;
  }

  // normal：50% 概率用炸弹
  if (difficulty === "normal" && Math.random() < 0.5) {
    bombs.sort((a, b) => a.startWeight - b.startWeight);
    return bombs[0]!.cards;
  }

  // hard：对手 <=3 张时用
  if (difficulty === "hard" && opponentMinHand <= 3) {
    bombs.sort((a, b) => a.startWeight - b.startWeight);
    return bombs[0]!.cards;
  }

  return null;
}
