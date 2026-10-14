import { describe, expect, it } from "vitest";
import { chooseFreePlay, chooseResponse } from "../src/ai";
import { Game } from "../src/game";

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

function countCards(g: Game): number {
  return (
    g.players.reduce((s, p) => s + p.hand.length, 0) +
    g.stockCount +
    g.playedCardsCount
  );
}

describe("牌数守恒调试", () => {
  it("追踪 2 人局 seed=0 的牌数变化", () => {
    const g = new Game(2, 0);
    const initial = countCards(g);
    expect(initial).toBe(54);

    let guard = 0;
    while (g.phase !== "GAME_OVER" && ++guard < 200) {
      const p = g.currentPlayer;
      const hand = g.players[p].hand;

      if (g.phase === "WAITING_LEAD") {
        const cards = chooseFreePlay(hand, 2);
        if (cards.length === 0) break;
        g.playCards(p, cards);
      } else if (g.phase === "WAITING_RESPONSE") {
        const lastPlay = g.lastPlay!;
        const opponentMin = g.players
          .filter((_, i) => i !== p && !g.players[i].finished)
          .reduce((min, pl) => Math.min(min, pl.hand.length), 99);
        const resp = chooseResponse(hand, lastPlay, opponentMin);
        g.respond(p, resp);
      }

      // 每一步都应守恒
      expect(countCards(g)).toBe(54);
    }

    // 最终检查
    const final = countCards(g);
    expect(final).toBe(54);
  });
});
