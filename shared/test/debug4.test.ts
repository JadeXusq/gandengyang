import { describe, expect, it } from "vitest";
import { chooseFreePlay, chooseResponse } from "../src/ai";
import { Game, RuleError } from "../src/game";
import { canRespond, identifyPlay } from "../src/play";

describe("4人局调试", () => {
  it("找出 4 人局中 findValidResponses 与 canRespond 的不一致", () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = new Game(4, seed);
      let guard = 0;
      while (g.phase !== "GAME_OVER") {
        if (++guard > 2000) throw new Error(`对局未收敛 seed=${seed}`);
        const p = g.currentPlayer;
        const hand = g.players[p].hand;

        if (g.phase === "WAITING_LEAD") {
          const cards = chooseFreePlay(hand, 4);
          if (cards.length === 0) throw new Error("AI 无法自由出牌");
          g.playCards(p, cards);
        } else if (g.phase === "WAITING_RESPONSE") {
          const lastPlay = g.lastPlay!;
          const opponentMin = g.players
            .filter((_, i) => i !== p && !g.players[i].finished)
            .reduce((min, pl) => Math.min(min, pl.hand.length), 99);
          const resp = chooseResponse(hand, lastPlay, opponentMin);

          if (resp !== null) {
            // 验证 AI 返回的牌
            const play = identifyPlay(resp);
            if (!play) {
              throw new Error(
                `seed=${seed}: identifyPlay returned null for cards=[${resp}]`
              );
            }
            if (!canRespond(lastPlay, play)) {
              throw new Error(
                `seed=${seed}: canRespond rejected play type=${play.type} startWeight=${play.startWeight} length=${play.length} cards=[${resp}] vs lastPlay type=${lastPlay.type} startWeight=${lastPlay.startWeight}`
              );
            }
          }

          try {
            g.respond(p, resp);
          } catch (e) {
            if (e instanceof RuleError) {
              throw new Error(
                `seed=${seed}: ${e.message}, resp=[${resp}], lastPlay type=${lastPlay.type} startWeight=${lastPlay.startWeight}`
              );
            }
            throw e;
          }
        }
      }
    }
  });
});
