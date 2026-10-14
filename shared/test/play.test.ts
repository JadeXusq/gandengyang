import { describe, expect, it } from "vitest";
import {
  canRespond,
  findFreePlays,
  findValidResponses,
  identifyPlay,
  Play,
} from "../src/play";

const card = (suit: number, rank: number) => suit * 13 + rank - 1;

describe("牌型识别", () => {
  it("单张", () => {
    const p = identifyPlay([card(0, 7)]);
    expect(p?.type).toBe("SINGLE");
    expect(p?.startWeight).toBe(5);
  });

  it("对子", () => {
    const p = identifyPlay([card(0, 5), card(1, 5)]);
    expect(p?.type).toBe("PAIR");
    expect(p?.startWeight).toBe(3);
  });

  it("顺子 3-4-5", () => {
    const p = identifyPlay([card(0, 3), card(1, 4), card(2, 5)]);
    expect(p?.type).toBe("STRAIGHT");
    expect(p?.startWeight).toBe(1);
    expect(p?.length).toBe(3);
  });

  it("顺子 Q-K-A", () => {
    const p = identifyPlay([card(0, 12), card(1, 13), card(2, 1)]);
    expect(p?.type).toBe("STRAIGHT");
    expect(p?.startWeight).toBe(10);
    expect(p?.length).toBe(3);
  });

  it("连对 对5-对6-对7", () => {
    const cards = [
      card(0, 5),
      card(1, 5),
      card(2, 6),
      card(3, 6),
      card(0, 7),
      card(1, 7),
    ];
    const p = identifyPlay(cards);
    expect(p?.type).toBe("DPRIGHT");
    expect(p?.startWeight).toBe(3);
    expect(p?.length).toBe(3);
  });

  it("炸弹（3张）", () => {
    const p = identifyPlay([card(0, 8), card(1, 8), card(2, 8)]);
    expect(p?.type).toBe("BOMB3");
    expect(p?.startWeight).toBe(6);
  });

  it("炸弹（4张）", () => {
    const p = identifyPlay([
      card(0, 11),
      card(1, 11),
      card(2, 11),
      card(3, 11),
    ]);
    expect(p?.type).toBe("BOMB4");
    expect(p?.startWeight).toBe(9);
  });

  it("王炸", () => {
    const p = identifyPlay([52, 53]);
    expect(p?.type).toBe("ROCKET");
  });

  it("非法牌型返回 null", () => {
    expect(identifyPlay([card(0, 3), card(1, 5)])).toBeNull();
    expect(identifyPlay([card(0, 3), card(1, 3), card(2, 5)])).toBeNull();
  });

  it("顺子不含 2", () => {
    const p = identifyPlay([card(0, 12), card(1, 13), card(2, 2)]);
    expect(p).toBeNull();
  });
});

describe("接牌判定", () => {
  const single7: Play = {
    type: "SINGLE",
    cards: [card(0, 7)],
    startWeight: 5,
    length: 1,
  };

  it("正好大 1 可接", () => {
    const single8: Play = {
      type: "SINGLE",
      cards: [card(0, 8)],
      startWeight: 6,
      length: 1,
    };
    expect(canRespond(single7, single8)).toBe(true);
  });

  it("跨级不可接", () => {
    const single9: Play = {
      type: "SINGLE",
      cards: [card(0, 9)],
      startWeight: 7,
      length: 1,
    };
    expect(canRespond(single7, single9)).toBe(false);
  });

  it("2 可接任何单张", () => {
    const single2: Play = {
      type: "SINGLE",
      cards: [card(0, 2)],
      startWeight: 13,
      length: 1,
    };
    expect(canRespond(single7, single2)).toBe(true);
  });

  it("炸弹可接任何非炸弹", () => {
    const bomb: Play = {
      type: "BOMB3",
      cards: [card(0, 5), card(1, 5), card(2, 5)],
      startWeight: 3,
      length: 3,
    };
    expect(canRespond(single7, bomb)).toBe(true);
  });

  it("王炸可接一切", () => {
    const rocket: Play = {
      type: "ROCKET",
      cards: [52, 53],
      startWeight: 0,
      length: 1,
    };
    expect(canRespond(single7, rocket)).toBe(true);
    const bomb: Play = {
      type: "BOMB4",
      cards: [card(0, 5), card(1, 5), card(2, 5), card(3, 5)],
      startWeight: 3,
      length: 4,
    };
    expect(canRespond(bomb, rocket)).toBe(true);
  });

  it("炸弹接炸弹：4张 > 3张", () => {
    const bomb3: Play = {
      type: "BOMB3",
      cards: [card(0, 5), card(1, 5), card(2, 5)],
      startWeight: 3,
      length: 3,
    };
    const bomb4: Play = {
      type: "BOMB4",
      cards: [card(0, 4), card(1, 4), card(2, 4), card(3, 4)],
      startWeight: 2,
      length: 4,
    };
    expect(canRespond(bomb3, bomb4)).toBe(true);
  });

  it("同牌型同长度权重正好大 1", () => {
    const pair5: Play = {
      type: "PAIR",
      cards: [card(0, 5), card(1, 5)],
      startWeight: 3,
      length: 2,
    };
    const pair6: Play = {
      type: "PAIR",
      cards: [card(0, 6), card(1, 6)],
      startWeight: 4,
      length: 2,
    };
    expect(canRespond(pair5, pair6)).toBe(true);
    const pair7: Play = {
      type: "PAIR",
      cards: [card(0, 7), card(1, 7)],
      startWeight: 5,
      length: 2,
    };
    expect(canRespond(pair5, pair7)).toBe(false);
  });
});

describe("findValidResponses", () => {
  it("单张 7 → 可接 8 和 2", () => {
    const lastPlay: Play = {
      type: "SINGLE",
      cards: [card(0, 7)],
      startWeight: 5,
      length: 1,
    };
    const hand = [card(0, 8), card(1, 3), card(2, 2)]; // 8, 3, 2
    const responses = findValidResponses(lastPlay, hand);
    const singles = responses.filter((r) => r.type === "SINGLE");
    expect(singles.some((s) => s.startWeight === 6)).toBe(true); // 8
    expect(singles.some((s) => s.startWeight === 13)).toBe(true); // 2
  });

  it("百搭不能单独出：单王 + 无关牌无法接 7", () => {
    const lastPlay: Play = {
      type: "SINGLE",
      cards: [card(0, 7)],
      startWeight: 5,
      length: 1,
    };
    const hand = [52, card(1, 3)]; // 小王 + 3（3 不是 8 也不是 2）
    const responses = findValidResponses(lastPlay, hand);
    const singles = responses.filter((r) => r.type === "SINGLE");
    // 百搭不能单独出，3 也不是 8 或 2 → 无合法单张响应
    expect(singles.length).toBe(0);
  });
});

describe("findFreePlays", () => {
  it("基本手牌包含单张、对子", () => {
    const hand = [card(0, 3), card(1, 3), card(2, 5), card(3, 7)];
    const plays = findFreePlays(hand);
    expect(plays.some((p) => p.type === "SINGLE")).toBe(true);
    expect(plays.some((p) => p.type === "PAIR")).toBe(true);
  });

  it("王炸在自由出牌中可用", () => {
    const hand = [52, 53, card(0, 3), card(1, 4), card(2, 5)];
    const plays = findFreePlays(hand);
    expect(plays.some((p) => p.type === "ROCKET")).toBe(true);
  });
});
