/**
 * 干瞪眼行牌状态机（服务器权威，纯逻辑无 IO）
 *
 * 状态：WAITING_LEAD → WAITING_RESPONSE → (DRAWING) → WAITING_LEAD / GAME_OVER
 *
 * 流程：
 * 1. 庄家自由出牌 → WAITING_RESPONSE
 * 2. 下家依次接牌/过 → 有人接则继续 WAITING_RESPONSE
 * 3. 全员过 → DRAWING（各摸 1 张）→ 回到最后出牌者自由出牌
 * 4. 有人出完 → GAME_OVER
 */
import {
  createDeck,
  DEALER_HAND_SIZE,
  NON_DEALER_HAND_SIZE,
  sortHand,
} from "./cards";
import {
  canRespond,
  findFreePlays,
  findValidResponses,
  identifyPlay,
  Play,
  PlayType,
} from "./play";
import { mulberry32, Rng, shuffle } from "./rng";

export type Phase =
  | "WAITING_LEAD"
  | "WAITING_RESPONSE"
  | "DRAWING"
  | "GAME_OVER";

export interface PlayerState {
  hand: number[];
  finished: boolean;
  finishRank: number;
  /** 是否已报单（剩 1 张） */
  reported: boolean;
  /** 本局初始手牌数（用于春天判定） */
  initialHandSize: number;
}

export interface GameEvent {
  type: "PLAY" | "RESPOND" | "PASS" | "DRAW" | "GAME_END";
  player: number;
  /** PLAY/RESPOND 时出的牌 */
  cards?: number[];
  playType?: PlayType;
  /** DRAW 时摸到的牌 */
  drawn?: number;
  /** GAME_END 时的排名 */
  rankings?: number[];
}

export interface GameResult {
  /** 各玩家剩余手牌数 */
  remaining: number[];
  /** 各玩家输分（正数=赢，负数=输） */
  scores: number[];
  /** 本局炸弹数 */
  bombCount: number;
  /** 赢家座位 */
  winner: number;
}

export class RuleError extends Error {}

export class Game {
  readonly playerCount: number;
  readonly players: PlayerState[];
  private stock: number[] = [];
  currentPlayer = 0;
  phase: Phase = "WAITING_LEAD";
  /** 最后有效出牌（自由出牌时重置） */
  lastPlay: Play | null = null;
  /** 最后出牌的玩家座位 */
  lastPlayBy = -1;
  /** 本轮已过的玩家座位 */
  private passedPlayers = new Set<number>();
  /** 本局炸弹计数 */
  bombCount = 0;
  /** 已出牌区（打出的牌收集在此） */
  private playedCards: number[] = [];
  /** 完成名次记录 */
  private finishCounter = 0;
  /** 事件日志 */
  events: GameEvent[] = [];

  constructor(playerCount: number, seed = Date.now(), dealerSeat = 0) {
    if (playerCount < 2 || playerCount > 5) throw new RuleError("人数须为 2~5");
    this.playerCount = playerCount;
    this.players = Array.from({ length: playerCount }, () => ({
      hand: [],
      finished: false,
      finishRank: 0,
      reported: false,
      initialHandSize: 0,
    }));
    this.currentPlayer =
      ((dealerSeat % playerCount) + playerCount) % playerCount;
    this.deal(mulberry32(seed));
  }

  /** 获取牌堆剩余数 */
  get stockCount(): number {
    return this.stock.length;
  }

  /** 获取已出牌数 */
  get playedCardsCount(): number {
    return this.playedCards.length;
  }

  /* ───── 发牌 ───── */

  private deal(rng: Rng): void {
    const deck = shuffle(createDeck(), rng);
    let idx = 0;
    for (let i = 0; i < this.playerCount; i++) {
      const size =
        i === this.currentPlayer ? DEALER_HAND_SIZE : NON_DEALER_HAND_SIZE;
      this.players[i].hand = sortHand(deck.slice(idx, idx + size));
      this.players[i].initialHandSize = size;
      idx += size;
    }
    this.stock = deck.slice(idx);
  }

  /* ───── 自由出牌（WAITING_LEAD） ───── */

  playCards(player: number, cardIds: number[]): GameEvent[] {
    if (this.phase !== "WAITING_LEAD")
      throw new RuleError(`当前阶段为 ${this.phase}`);
    if (player !== this.currentPlayer) throw new RuleError("未轮到该玩家");

    const p = this.players[player];
    if (p.finished) throw new RuleError("该玩家已出完");

    // 验证牌在手
    for (const c of cardIds) {
      if (!p.hand.includes(c)) throw new RuleError("手牌中没有这张牌");
    }

    // 识别牌型
    const play = identifyPlay(cardIds);
    if (!play) throw new RuleError("不合法的牌型");

    // 执行出牌
    this.removeCards(player, cardIds);
    this.lastPlay = play;
    this.lastPlayBy = player;
    this.passedPlayers.clear();

    if (
      play.type === "BOMB3" ||
      play.type === "BOMB4" ||
      play.type === "ROCKET"
    ) {
      this.bombCount++;
    }

    const ev: GameEvent = {
      type: "PLAY",
      player,
      cards: [...cardIds],
      playType: play.type,
    };
    this.events.push(ev);

    // 检查是否出完
    if (this.players[player].hand.length === 0) {
      this.finishPlayer(player);
      return [ev];
    }

    // 报单检测
    if (this.players[player].hand.length === 1) {
      this.players[player].reported = true;
    }

    // 进入响应阶段
    this.phase = "WAITING_RESPONSE";
    this.advanceToNextResponder();
    return [ev];
  }

  /* ───── 接牌 / 过（WAITING_RESPONSE） ───── */

  respond(player: number, cardIds: number[] | null): GameEvent[] {
    if (this.phase !== "WAITING_RESPONSE")
      throw new RuleError(`当前阶段为 ${this.phase}`);
    if (player !== this.currentPlayer) throw new RuleError("未轮到该玩家");

    const p = this.players[player];
    if (p.finished) throw new RuleError("该玩家已出完");

    // 过
    if (cardIds === null || cardIds.length === 0) {
      this.passedPlayers.add(player);
      const ev: GameEvent = { type: "PASS", player };
      this.events.push(ev);
      this.advanceAfterPass();
      return [ev];
    }

    // 验证牌在手
    for (const c of cardIds) {
      if (!p.hand.includes(c)) throw new RuleError("手牌中没有这张牌");
    }

    // 识别牌型
    const play = identifyPlay(cardIds);
    if (!play) throw new RuleError("不合法的牌型");

    // 验证能否接牌
    if (!canRespond(this.lastPlay!, play)) throw new RuleError("不合法的接牌");

    // 执行接牌
    this.removeCards(player, cardIds);
    this.lastPlay = play;
    this.lastPlayBy = player;
    this.passedPlayers.clear();

    if (
      play.type === "BOMB3" ||
      play.type === "BOMB4" ||
      play.type === "ROCKET"
    ) {
      this.bombCount++;
    }

    const ev: GameEvent = {
      type: "RESPOND",
      player,
      cards: [...cardIds],
      playType: play.type,
    };
    this.events.push(ev);

    // 检查是否出完
    if (this.players[player].hand.length === 0) {
      this.finishPlayer(player);
      return [ev];
    }

    // 报单检测
    if (this.players[player].hand.length === 1) {
      this.players[player].reported = true;
    }

    // 继续等待下家响应
    this.advanceToNextResponder();
    return [ev];
  }

  /* ───── 查询当前可接牌型 ───── */

  validResponses(player: number): Play[] {
    if (player !== this.currentPlayer) return [];
    if (this.phase === "WAITING_LEAD") {
      return findFreePlays(this.players[player].hand);
    }
    if (this.phase === "WAITING_RESPONSE" && this.lastPlay) {
      return findValidResponses(this.lastPlay, this.players[player].hand);
    }
    return [];
  }

  /* ───── 结算 ───── */

  result(): GameResult {
    if (this.phase !== "GAME_OVER") throw new RuleError("对局未结束");

    const remaining = this.players.map((p) => p.hand.length);
    const winner = this.players.findIndex((p) => p.finishRank === 1);

    // 计算输分
    const bombMultiplier = 1 + this.bombCount;
    const scores = this.players.map((p, i) => {
      if (i === winner) return 0; // 先算输家，赢家最后取反
      let loss = p.hand.length;
      // 春天：一张未出 → 双倍
      if (p.hand.length === p.initialHandSize) loss *= 2;
      return -(loss * bombMultiplier);
    });

    // 赢家获得所有输家的分数（零和）
    const totalLoss = scores.reduce((s, v) => s + v, 0);
    scores[winner] = -totalLoss;

    return { remaining, scores, bombCount: this.bombCount, winner };
  }

  /* ───── 内部方法 ───── */

  private removeCards(player: number, cardIds: number[]): void {
    const hand = this.players[player].hand;
    for (const c of cardIds) {
      const idx = hand.indexOf(c);
      if (idx < 0) throw new RuleError("手牌中没有这张牌");
      hand.splice(idx, 1);
      this.playedCards.push(c);
    }
  }

  private finishPlayer(player: number): void {
    this.players[player].finished = true;
    this.players[player].finishRank = ++this.finishCounter;
    this.phase = "GAME_OVER";
    this.events.push({ type: "GAME_END", player });
  }

  private advanceToNextResponder(): void {
    const next = this.nextActivePlayer(this.currentPlayer);
    if (next === this.lastPlayBy) {
      // 所有人都过了（或只剩一人）
      this.drawAll();
      return;
    }
    this.currentPlayer = next;
  }

  private advanceAfterPass(): void {
    // 检查是否所有其他活跃玩家都已过
    const activePlayers = this.getActivePlayers();
    const allPassed = activePlayers.every(
      (s) => s === this.lastPlayBy || this.passedPlayers.has(s)
    );

    if (allPassed) {
      this.drawAll();
      return;
    }

    // 下一个未过的活跃玩家
    let next = this.nextActivePlayer(this.currentPlayer);
    while (this.passedPlayers.has(next) && next !== this.lastPlayBy) {
      next = this.nextActivePlayer(next);
    }

    if (next === this.lastPlayBy) {
      this.drawAll();
      return;
    }

    this.currentPlayer = next;
  }

  /** 全员摸牌 */
  private drawAll(): void {
    this.phase = "DRAWING";
    for (let i = 0; i < this.playerCount; i++) {
      if (this.players[i].finished || this.stock.length === 0) continue;
      const card = this.stock.pop()!;
      this.players[i].hand.push(card);
      this.players[i].hand = sortHand(this.players[i].hand);
      this.events.push({ type: "DRAW", player: i, drawn: card });
    }
    // 回到最后出牌者自由出牌
    this.currentPlayer = this.lastPlayBy;
    this.lastPlay = null;
    this.passedPlayers.clear();
    this.phase = "WAITING_LEAD";
  }

  private nextActivePlayer(from: number): number {
    let s = (from + 1) % this.playerCount;
    let guard = 0;
    while (this.players[s].finished && ++guard < this.playerCount) {
      s = (s + 1) % this.playerCount;
    }
    return s;
  }

  private getActivePlayers(): number[] {
    return this.players
      .map((_, i) => i)
      .filter((i) => !this.players[i].finished);
  }
}
