/**
 * 牌型识别与比较（干瞪眼核心模块）
 *
 * 牌型：SINGLE / PAIR / STRAIGHT / DPRIGHT / BOMB3 / BOMB4 / ROCKET
 * 接牌约束：同型 + 同长 + 起始权重正好大 1（2 可接任意单张/对子；炸弹 / 王炸例外）
 * 大小王为百搭：可替代除 2（weight 13）以外任意牌
 */
import { cardWeight, isJoker, BLACK_JOKER_ID, RED_JOKER_ID } from "./cards";

export type PlayType =
  | "SINGLE"
  | "PAIR"
  | "STRAIGHT"
  | "DPRIGHT"
  | "BOMB3"
  | "BOMB4"
  | "ROCKET";

export interface Play {
  type: PlayType;
  cards: number[];
  startWeight: number;
  length: number;
}

/* ───── 工具函数 ───── */

function groupByWeight(cards: number[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const c of cards) {
    const w = cardWeight(c);
    if (w === 0) continue;
    if (!m.has(w)) m.set(w, []);
    m.get(w)!.push(c);
  }
  return m;
}

function isBombType(t: PlayType): boolean {
  return t === "BOMB3" || t === "BOMB4" || t === "ROCKET";
}

/* ───── 从手牌中枚举合法接牌 ───── */

export function findValidResponses(lastPlay: Play, hand: number[]): Play[] {
  const results: Play[] = [];
  const jokers = hand.filter(isJoker);
  const nonJokers = hand.filter((c) => !isJoker(c));
  const byWeight = groupByWeight(nonJokers);

  // 王炸
  if (jokers.length === 2) {
    results.push({
      type: "ROCKET",
      cards: [BLACK_JOKER_ID, RED_JOKER_ID],
      startWeight: 0,
      length: 1,
    });
  }

  findBombResponses(lastPlay, byWeight, jokers, results);

  if (!isBombType(lastPlay.type)) {
    findSameTypeResponses(lastPlay, byWeight, jokers, results);
  }

  return results;
}

function findBombResponses(
  lastPlay: Play,
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  const lastIsBomb = lastPlay.type === "BOMB3" || lastPlay.type === "BOMB4";
  const lastBombWeight = lastIsBomb ? lastPlay.startWeight : -1;
  const lastBombLen = lastIsBomb ? lastPlay.length : 0;

  for (const [w, cards] of byWeight) {
    // 当 lastPlay 非炸弹时，同权重的炸弹不可接（canRespond 要求炸弹权重严格大于非炸弹）
    if (!lastIsBomb && w === lastPlay.startWeight) continue;

    if (lastIsBomb) {
      if (w < lastBombWeight) continue;
      if (w === lastBombWeight && cards.length <= lastBombLen) continue;
      if (w === lastBombWeight) {
        if (cards.length >= 3) results.push(makeBomb(w, cards.slice(0, 3)));
        if (cards.length >= 4) results.push(makeBomb(w, cards.slice(0, 4)));
        continue;
      }
    }
    if (cards.length >= 3) results.push(makeBomb(w, cards.slice(0, 3)));
    if (cards.length >= 4) results.push(makeBomb(w, cards.slice(0, 4)));
  }

  if (jokers.length >= 1) {
    for (const [w, cards] of byWeight) {
      if (lastIsBomb && w <= lastBombWeight) continue;
      if (!lastIsBomb && w === lastPlay.startWeight) continue;
      if (cards.length === 2)
        results.push({
          type: "BOMB3",
          cards: [...cards.slice(0, 2), jokers[0]!],
          startWeight: w,
          length: 3,
        });
      if (cards.length === 1 && jokers.length >= 2)
        results.push({
          type: "BOMB3",
          cards: [cards[0]!, jokers[0]!, jokers[1]!],
          startWeight: w,
          length: 3,
        });
    }
  }
  if (jokers.length >= 2) {
    for (const [w, cards] of byWeight) {
      if (lastIsBomb && w <= lastBombWeight) continue;
      if (!lastIsBomb && w === lastPlay.startWeight) continue;
      if (cards.length === 2)
        results.push({
          type: "BOMB4",
          cards: [...cards.slice(0, 2), jokers[0]!, jokers[1]!],
          startWeight: w,
          length: 4,
        });
    }
  }
}

function makeBomb(w: number, cards: number[]): Play {
  const t = cards.length >= 4 ? "BOMB4" : "BOMB3";
  return {
    type: t,
    cards: cards.slice(0, t === "BOMB4" ? 4 : 3),
    startWeight: w,
    length: cards.length >= 4 ? 4 : 3,
  };
}

function findSameTypeResponses(
  lastPlay: Play,
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  const targetW = lastPlay.startWeight + 1;

  switch (lastPlay.type) {
    case "SINGLE": {
      // 正常 +1
      if (targetW <= 13) {
        addSingleResponse(targetW, byWeight, jokers, results);
      }
      // 2 可接任意非 2 单张（当 +1 不是 2 时额外提供 2 作为选项）
      if (lastPlay.startWeight < 12) {
        addSingleResponse(13, byWeight, jokers, results);
      }
      break;
    }
    case "PAIR": {
      if (targetW <= 13) {
        addPairResponse(targetW, byWeight, jokers, results);
      }
      if (lastPlay.startWeight < 12) {
        addPairResponse(13, byWeight, jokers, results);
      }
      break;
    }
    case "STRAIGHT": {
      if (
        targetW <= 12 &&
        canFormSequence(targetW, lastPlay.length, byWeight, jokers.length)
      ) {
        results.push({
          type: "STRAIGHT",
          cards: pickSequence(targetW, lastPlay.length, byWeight, jokers),
          startWeight: targetW,
          length: lastPlay.length,
        });
      }
      break;
    }
    case "DPRIGHT": {
      if (
        targetW <= 12 &&
        canFormDoubleSequence(targetW, lastPlay.length, byWeight, jokers.length)
      ) {
        results.push({
          type: "DPRIGHT",
          cards: pickDoubleSequence(targetW, lastPlay.length, byWeight, jokers),
          startWeight: targetW,
          length: lastPlay.length,
        });
      }
      break;
    }
  }
}

function addSingleResponse(
  w: number,
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  const nat = byWeight.get(w);
  if (nat && nat.length >= 1) {
    results.push({
      type: "SINGLE",
      cards: [nat[0]!],
      startWeight: w,
      length: 1,
    });
  }
  // 百搭不能单独出（须配合实牌），故不在此添加纯王 SINGLE
}

function addPairResponse(
  w: number,
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  const nat = byWeight.get(w) ?? [];
  if (nat.length >= 2) {
    results.push({
      type: "PAIR",
      cards: nat.slice(0, 2),
      startWeight: w,
      length: 2,
    });
  }
  if (nat.length === 1 && jokers.length >= 1) {
    results.push({
      type: "PAIR",
      cards: [nat[0]!, jokers[0]!],
      startWeight: w,
      length: 2,
    });
  }
  if (nat.length === 0 && jokers.length >= 2) {
    results.push({
      type: "PAIR",
      cards: [jokers[0]!, jokers[1]!],
      startWeight: w,
      length: 2,
    });
  }
}

/* ───── 顺子/连对辅助 ───── */

function canFormSequence(
  startW: number,
  length: number,
  byWeight: Map<number, number[]>,
  jokerCount: number
): boolean {
  if (startW + length - 1 > 12) return false;
  // 起始位置必须有实牌，否则 identifyPlay 会推断出更低的 startWeight
  const startCards = byWeight.get(startW);
  if (!startCards || startCards.length === 0) return false;
  let need = 0;
  for (let w = startW; w < startW + length; w++) {
    if (!byWeight.has(w) || byWeight.get(w)!.length === 0) need++;
  }
  return need <= jokerCount;
}

function pickSequence(
  startW: number,
  length: number,
  byWeight: Map<number, number[]>,
  jokers: number[]
): number[] {
  const cards: number[] = [];
  let ji = 0;
  for (let w = startW; w < startW + length; w++) {
    const nat = byWeight.get(w);
    if (nat && nat.length > 0) cards.push(nat[0]!);
    else cards.push(jokers[ji++]!);
  }
  return cards;
}

function canFormDoubleSequence(
  startW: number,
  pairCount: number,
  byWeight: Map<number, number[]>,
  jokerCount: number
): boolean {
  if (startW + pairCount - 1 > 12) return false;
  // 起始位置至少有一张实牌
  const startCards = byWeight.get(startW) ?? [];
  if (startCards.length === 0) return false;
  let need = 0;
  for (let w = startW; w < startW + pairCount; w++) {
    const nat = byWeight.get(w) ?? [];
    if (nat.length < 2) need += 2 - nat.length;
  }
  return need <= jokerCount;
}

function pickDoubleSequence(
  startW: number,
  pairCount: number,
  byWeight: Map<number, number[]>,
  jokers: number[]
): number[] {
  const cards: number[] = [];
  let ji = 0;
  for (let w = startW; w < startW + pairCount; w++) {
    const nat = byWeight.get(w) ?? [];
    const used = Math.min(nat.length, 2);
    for (let i = 0; i < used; i++) cards.push(nat[i]!);
    for (let i = used; i < 2; i++) cards.push(jokers[ji++]!);
  }
  return cards;
}

/* ───── 自由出牌枚举 ───── */

export function findFreePlays(hand: number[]): Play[] {
  const results: Play[] = [];
  const jokers = hand.filter(isJoker);
  const nonJokers = hand.filter((c) => !isJoker(c));
  const byWeight = groupByWeight(nonJokers);

  for (const [w, cards] of byWeight)
    results.push({
      type: "SINGLE",
      cards: [cards[0]!],
      startWeight: w,
      length: 1,
    });

  for (const [w, cards] of byWeight)
    if (cards.length >= 2)
      results.push({
        type: "PAIR",
        cards: cards.slice(0, 2),
        startWeight: w,
        length: 2,
      });

  if (jokers.length >= 1)
    for (const [w, cards] of byWeight)
      if (cards.length === 1)
        results.push({
          type: "PAIR",
          cards: [cards[0]!, jokers[0]!],
          startWeight: w,
          length: 2,
        });

  if (jokers.length >= 2 && byWeight.size > 0) {
    const minW = Math.min(...byWeight.keys());
    results.push({
      type: "PAIR",
      cards: [jokers[0]!, jokers[1]!],
      startWeight: minW,
      length: 2,
    });
  }

  findFreeStraights(byWeight, jokers, results);
  findFreeDoublePairs(byWeight, jokers, results);

  for (const [w, cards] of byWeight) {
    if (cards.length >= 3)
      results.push({
        type: "BOMB3",
        cards: cards.slice(0, 3),
        startWeight: w,
        length: 3,
      });
    if (cards.length >= 4)
      results.push({
        type: "BOMB4",
        cards: cards.slice(0, 4),
        startWeight: w,
        length: 4,
      });
  }

  if (jokers.length === 2)
    results.push({
      type: "ROCKET",
      cards: [BLACK_JOKER_ID, RED_JOKER_ID],
      startWeight: 0,
      length: 1,
    });

  return results;
}

function findFreeStraights(
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  for (let len = 3; len <= 12; len++)
    for (let startW = 1; startW + len - 1 <= 12; startW++)
      if (canFormSequence(startW, len, byWeight, jokers.length))
        results.push({
          type: "STRAIGHT",
          cards: pickSequence(startW, len, byWeight, jokers),
          startWeight: startW,
          length: len,
        });
}

function findFreeDoublePairs(
  byWeight: Map<number, number[]>,
  jokers: number[],
  results: Play[]
): void {
  for (let len = 3; len <= 6; len++)
    for (let startW = 1; startW + len - 1 <= 12; startW++)
      if (canFormDoubleSequence(startW, len, byWeight, jokers.length))
        results.push({
          type: "DPRIGHT",
          cards: pickDoubleSequence(startW, len, byWeight, jokers),
          startWeight: startW,
          length: len,
        });
}

/* ───── 牌型识别 ───── */

export function identifyPlay(cards: number[]): Play | null {
  if (cards.length === 0) return null;

  if (
    cards.length === 2 &&
    cards.includes(BLACK_JOKER_ID) &&
    cards.includes(RED_JOKER_ID)
  )
    return { type: "ROCKET", cards: [...cards], startWeight: 0, length: 1 };

  const jokers = cards.filter(isJoker);
  const nonJokers = cards.filter((c) => !isJoker(c));
  const byWeight = groupByWeight(nonJokers);

  // 单王不能单独出
  if (jokers.length === cards.length) return null;

  if (jokers.length === 0) return identifyNatural(cards, byWeight);
  return identifyWithJokers(cards, nonJokers, jokers, byWeight);
}

function identifyNatural(
  cards: number[],
  byWeight: Map<number, number[]>
): Play | null {
  const n = cards.length;
  const weights = [...byWeight.keys()].sort((a, b) => a - b);

  if (n === 1)
    return {
      type: "SINGLE",
      cards: [...cards],
      startWeight: weights[0]!,
      length: 1,
    };
  if (weights.length === 1) {
    if (n === 2)
      return {
        type: "PAIR",
        cards: [...cards],
        startWeight: weights[0]!,
        length: 2,
      };
    if (n === 3)
      return {
        type: "BOMB3",
        cards: [...cards],
        startWeight: weights[0]!,
        length: 3,
      };
    if (n === 4)
      return {
        type: "BOMB4",
        cards: [...cards],
        startWeight: weights[0]!,
        length: 4,
      };
  }
  // 连对（优先于顺子）
  if (n >= 6 && n % 2 === 0) {
    const pw = [...byWeight.entries()]
      .filter(([, cs]) => cs.length === 2)
      .map(([w]) => w)
      .sort((a, b) => a - b);
    if (pw.length === n / 2 && isConsecutive(pw) && pw[pw.length - 1]! <= 12)
      return {
        type: "DPRIGHT",
        cards: [...cards],
        startWeight: pw[0]!,
        length: pw.length,
      };
  }
  // 顺子
  if (
    n >= 3 &&
    weights.length === n &&
    isConsecutive(weights) &&
    weights[n - 1]! <= 12
  )
    return {
      type: "STRAIGHT",
      cards: [...cards],
      startWeight: weights[0]!,
      length: n,
    };

  return null;
}

function identifyWithJokers(
  cards: number[],
  nonJokers: number[],
  jokers: number[],
  byWeight: Map<number, number[]>
): Play | null {
  const n = cards.length;
  const jc = jokers.length;

  // 对子（含百搭凑对）
  if (n === 2) {
    if (nonJokers.length === 1) {
      const w = cardWeight(nonJokers[0]!);
      if (w > 0)
        return { type: "PAIR", cards: [...cards], startWeight: w, length: 2 };
    }
    return null;
  }

  // 炸弹
  if (n === 3) {
    if (nonJokers.length === 3) {
      const ws = [...byWeight.keys()];
      if (ws.length === 1)
        return {
          type: "BOMB3",
          cards: [...cards],
          startWeight: ws[0]!,
          length: 3,
        };
    }
    if (nonJokers.length === 2 && jc === 1) {
      const ws = [...byWeight.keys()];
      if (ws.length === 1)
        return {
          type: "BOMB3",
          cards: [...cards],
          startWeight: ws[0]!,
          length: 3,
        };
    }
    if (nonJokers.length === 1 && jc === 2)
      return {
        type: "BOMB3",
        cards: [...cards],
        startWeight: cardWeight(nonJokers[0]!),
        length: 3,
      };
  }
  if (n === 4) {
    if (nonJokers.length === 4) {
      const ws = [...byWeight.keys()];
      if (ws.length === 1)
        return {
          type: "BOMB4",
          cards: [...cards],
          startWeight: ws[0]!,
          length: 4,
        };
      if (ws.length === 4) {
        const s = ws.sort((a, b) => a - b);
        if (isConsecutive(s) && s[3]! <= 12)
          return {
            type: "STRAIGHT",
            cards: [...cards],
            startWeight: s[0]!,
            length: 4,
          };
      }
    }
    if (nonJokers.length === 3 && jc === 1) {
      const ws = [...byWeight.keys()];
      if (ws.length === 1)
        return {
          type: "BOMB4",
          cards: [...cards],
          startWeight: ws[0]!,
          length: 4,
        };
    }
    if (nonJokers.length === 2 && jc === 2) {
      const ws = [...byWeight.keys()];
      if (ws.length === 1)
        return {
          type: "BOMB4",
          cards: [...cards],
          startWeight: ws[0]!,
          length: 4,
        };
    }
  }

  // 顺子（含百搭填充）
  if (n >= 3) {
    const aw = nonJokers.map((c) => cardWeight(c)).sort((a, b) => a - b);
    const minW = aw[0]!,
      maxW = aw[aw.length - 1]!;
    // 搜索下界为 minW：百搭只能填充 >= minW 的空位，不能低于最小额面
    for (let startW = minW; startW <= Math.min(minW, 12 - n + 1); startW++) {
      if (startW + n - 1 > 12) continue;
      let gaps = 0;
      for (let w = startW; w < startW + n; w++) if (!aw.includes(w)) gaps++;
      if (gaps === jc)
        return {
          type: "STRAIGHT",
          cards: [...cards],
          startWeight: startW,
          length: n,
        };
    }
  }

  return null;
}

/* ───── 接牌判定 ───── */

export function canRespond(lastPlay: Play, candidate: Play): boolean {
  if (candidate.type === "ROCKET") return true;

  const cBomb = candidate.type === "BOMB3" || candidate.type === "BOMB4";
  const lBomb = lastPlay.type === "BOMB3" || lastPlay.type === "BOMB4";

  if (cBomb && !lBomb) return true;
  if (cBomb && lBomb) {
    const cLen = candidate.type === "BOMB4" ? 4 : 3;
    const lLen = lastPlay.type === "BOMB4" ? 4 : 3;
    if (cLen > lLen) return true;
    if (cLen === lLen) return candidate.startWeight > lastPlay.startWeight;
    return false;
  }

  if (candidate.type !== lastPlay.type) return false;
  if (candidate.length !== lastPlay.length) return false;

  // 2 可接任意单张/对子
  if (
    (lastPlay.type === "SINGLE" || lastPlay.type === "PAIR") &&
    candidate.startWeight === 13 &&
    lastPlay.startWeight < 13
  )
    return true;

  return candidate.startWeight === lastPlay.startWeight + 1;
}

/* ───── 工具 ───── */

function isConsecutive(ws: number[]): boolean {
  if (ws.length < 2) return false;
  for (let i = 1; i < ws.length; i++)
    if (ws[i] !== ws[i - 1]! + 1) return false;
  return true;
}

export function playTypeName(t: PlayType): string {
  return {
    SINGLE: "单张",
    PAIR: "对子",
    STRAIGHT: "顺子",
    DPRIGHT: "连对",
    BOMB3: "炸弹(3)",
    BOMB4: "炸弹(4)",
    ROCKET: "王炸",
  }[t];
}
