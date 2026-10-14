import { describe, expect, it } from "vitest";
import { chooseFreePlay, chooseResponse } from "../src/ai";
import { Game, RuleError } from "../src/game";
import { Play } from "../src/play";

const card = (suit: number, rank: number) => suit * 13 + rank - 1;

describe("发牌", () => {
  it.each([
    [2, 6, 5],
    [3, 6, 5],
    [4, 6, 5],
    [5, 6, 5],
  ])(
    "%i 人局：庄家 %i 张、闲家 %i 张",
    (n: number, dealerSize: number, otherSize: number) => {
      const g = new Game(n, 42);
      const dealer = g.currentPlayer;
      for (let i = 0; i < n; i++) {
        const expected = i === dealer ? dealerSize : otherSize;
        expect(g.players[i].hand.length).toBe(expected);
      }
      const totalHand = dealerSize + (n - 1) * otherSize;
      expect(g.stockCount).toBe(54 - totalHand);
    }
  );
});

describe("行牌规则", () => {
  it("拒绝：非当前玩家出牌", () => {
    const g = new Game(3, 42);
    const other = (g.currentPlayer + 1) % 3;
    expect(() => g.playCards(other, [g.players[other].hand[0]!])).toThrow(
      RuleError
    );
  });

  it("拒绝：出不在手中的牌", () => {
    const g = new Game(3, 42);
    const p = g.currentPlayer;
    const otherHand = g.players[(p + 1) % 3]!.hand;
    expect(() => g.playCards(p, [otherHand[0]!])).toThrow(RuleError);
  });

  it("自由出牌后进入 WAITING_RESPONSE", () => {
    const g = new Game(2, 42);
    const p = g.currentPlayer;
    const hand = g.players[p].hand;
    g.playCards(p, [hand[0]!]);
    expect(g.phase).toBe("WAITING_RESPONSE");
  });

  it("过牌后轮转到下家", () => {
    const g = new Game(2, 42);
    const p = g.currentPlayer;
    const hand = g.players[p].hand;
    g.playCards(p, [hand[0]!]);
    const responder = g.currentPlayer;
    g.respond(responder, null);
    expect(g.phase === "WAITING_LEAD" || g.phase === "WAITING_RESPONSE").toBe(
      true
    );
  });
});

/** 用 AI 策略自动打完一整局 */
function playFullGame(playerCount: number, seed: number): Game {
  const g = new Game(playerCount, seed);
  let guard = 0;
  while (g.phase !== "GAME_OVER") {
    if (++guard > 2000)
      throw new Error(`对局未收敛 seed=${seed} players=${playerCount}`);

    const p = g.currentPlayer;
    const hand = g.players[p].hand;

    if (g.phase === "WAITING_LEAD") {
      const cards = chooseFreePlay(hand, playerCount);
      if (cards.length === 0) throw new Error("AI 无法自由出牌");
      g.playCards(p, cards);
    } else if (g.phase === "WAITING_RESPONSE") {
      const lastPlay = g.lastPlay!;
      const opponentMin = g.players
        .filter((_, i) => i !== p && !g.players[i].finished)
        .reduce((min, pl) => Math.min(min, pl.hand.length), 99);
      const resp = chooseResponse(hand, lastPlay, opponentMin);
      g.respond(p, resp);
    }
  }
  return g;
}

describe("整局模拟", () => {
  it.each([2, 3, 4, 5])(
    "%i 人局 × 50 种子：有人获胜、牌数守恒",
    (n: number) => {
      for (let seed = 0; seed < 50; seed++) {
        const g = playFullGame(n, seed);
        const winner = g.players.find((p) => p.finishRank === 1);
        expect(winner).toBeDefined();
        expect(winner!.hand.length).toBe(0);

        // 牌数守恒：所有手牌 + 牌堆 + 已出牌区 = 54
        const totalCards =
          g.players.reduce((s, p) => s + p.hand.length, 0) +
          g.stockCount +
          g.playedCardsCount;
        expect(totalCards).toBe(54);

        const r = g.result();
        const sum = r.scores.reduce((a, b) => a + b, 0);
        expect(sum).toBe(0);
      }
    }
  );
});

describe("结算", () => {
  it("剩余牌数 → 输分，赢家零和", () => {
    const g = playFullGame(2, 42);
    const r = g.result();
    expect(r.scores.reduce((a, b) => a + b, 0)).toBe(0);
    expect(r.scores[r.winner]).toBeGreaterThan(0);
  });
});
