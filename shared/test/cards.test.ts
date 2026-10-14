import { describe, expect, it } from "vitest";
import {
  BLACK_JOKER_ID,
  cardName,
  cardWeight,
  createDeck,
  RED_JOKER_ID,
  sortHand,
} from "../src/cards";

// 牌 id 速查：suit*13 + (rank-1)；rank: 1=A, 2=2, 3=3, ..., 13=K
const card = (suit: number, rank: number) => suit * 13 + rank - 1;

describe("牌定义", () => {
  it("整副牌 54 张", () => {
    expect(createDeck().length).toBe(54);
  });

  it("权重映射：3→1, 4→2, ..., K→11, A→12, 2→13", () => {
    expect(cardWeight(card(0, 3))).toBe(1); // ♠3
    expect(cardWeight(card(1, 4))).toBe(2); // ♥4
    expect(cardWeight(card(2, 10))).toBe(8); // ♦10
    expect(cardWeight(card(0, 11))).toBe(9); // ♠J
    expect(cardWeight(card(1, 12))).toBe(10); // ♥Q
    expect(cardWeight(card(2, 13))).toBe(11); // ♦K
    expect(cardWeight(card(0, 1))).toBe(12); // ♠A
    expect(cardWeight(card(1, 2))).toBe(13); // ♥2
  });

  it("王权重为 0", () => {
    expect(cardWeight(BLACK_JOKER_ID)).toBe(0);
    expect(cardWeight(RED_JOKER_ID)).toBe(0);
  });

  it("sortHand：按权重升序，王在最后", () => {
    const hand = [
      card(0, 2),
      card(1, 3),
      card(2, 1),
      BLACK_JOKER_ID,
      RED_JOKER_ID,
    ];
    const sorted = sortHand(hand);
    // 2(权重13) < 3(权重1) → 3在前; A(权重12) → 中间; 王在最后
    expect(cardWeight(sorted[0]!)).toBeLessThanOrEqual(cardWeight(sorted[1]!));
    expect(sorted[sorted.length - 1]).toBe(RED_JOKER_ID);
    expect(sorted[sorted.length - 2]).toBe(BLACK_JOKER_ID);
  });

  it("cardName 调试输出", () => {
    expect(cardName(card(1, 3))).toBe("♥3");
    expect(cardName(card(0, 1))).toBe("♠A");
    expect(cardName(RED_JOKER_ID)).toBe("大王");
    expect(cardName(BLACK_JOKER_ID)).toBe("小王");
  });
});
