/**
 * 干瞪眼对局房间（服务器权威）
 */
import { ArraySchema } from "@colyseus/schema";
import { Client, Room } from "colyseus";
import {
  chooseFreePlay,
  chooseResponse,
  Game,
  RuleError,
  TURN_MS,
  AI_DELAY_MS,
  RECONNECT_MS,
} from "@gdy/shared";
import {
  registerCode,
  registerDeviceSeat,
  unregisterCode,
  unregisterDeviceSeat,
  unregisterRoomDevices,
} from "./roomCodes";
import { recordResult } from "./store";
import { LastPlaySchema, PlayerSchema, RoomState } from "./state";

const NAME_MAX_LEN = 8;

export interface JoinOptions {
  name?: string;
  maxPlayers?: number;
  deviceId?: string;
  spectate?: boolean;
}

export class GameRoom extends Room<RoomState> {
  private game: Game | null = null;
  private turnTimer: { clear(): void } | null = null;
  private aiCounter = 0;
  private devices = new Map<PlayerSchema, string>();
  private spectators = new Set<string>();

  onCreate(options: JoinOptions): void {
    const maxPlayers = clampPlayers(options.maxPlayers ?? 4);
    this.maxClients = maxPlayers + 8;
    this.setState(new RoomState());
    this.state.maxPlayers = maxPlayers;
    this.state.code = registerCode(this.roomId);
    this.setMetadata({ code: this.state.code, maxPlayers });

    this.onMessage("ready", (client, ready: boolean) =>
      this.onReady(client, ready)
    );
    this.onMessage("addAi", (client) => this.onAddAi(client));
    this.onMessage("removeAi", (client, seat: number) =>
      this.onRemoveAi(client, seat)
    );
    this.onMessage("play", (client, msg: { cards: number[] }) =>
      this.onPlay(client, msg)
    );
    this.onMessage("respond", (client, msg: { cards: number[] | null }) =>
      this.onRespond(client, msg)
    );
    this.onMessage("nextRound", (client) => this.onNextRound(client));
    this.onMessage("ping", () => undefined);
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (options.spectate) {
      this.spectators.add(client.sessionId);
      client.send("joined", {
        seat: -1,
        code: this.state.code,
        spectate: true,
      });
      return;
    }
    if (this.state.phase !== "WAITING") {
      throw new Error("对局已开始，请选择观战");
    }
    const seat = this.freeSeat();
    if (seat < 0) throw new Error("房间已满");
    const p = new PlayerSchema();
    p.sessionId = client.sessionId;
    p.seat = seat;
    p.name = (options.name || `玩家${seat + 1}`).slice(0, NAME_MAX_LEN);
    if (options.deviceId) this.devices.set(p, options.deviceId);
    this.state.players.set(client.sessionId, p);
    if (!this.state.hostSessionId) this.state.hostSessionId = client.sessionId;
    this.syncDeviceSeat(p);
    client.send("joined", { seat, code: this.state.code, spectate: false });
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (this.spectators.has(client.sessionId)) {
      this.spectators.delete(client.sessionId);
      return;
    }
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    if (this.state.phase === "WAITING" || consented) {
      const id = this.devices.get(p);
      this.devices.delete(p);
      if (id) unregisterDeviceSeat(id);
      this.state.players.delete(client.sessionId);
      this.reassignHost();
      return;
    }
    p.connected = false;
    this.driveIfAutoTurn();
    const leftSession = client.sessionId;
    try {
      await this.allowReconnection(client, RECONNECT_MS / 1000);
      if (p.sessionId !== leftSession) return;
      p.connected = true;
      p.sessionId = client.sessionId;
      this.sendHand(p.seat);
    } catch {
      if (p.sessionId === leftSession && !p.connected) p.isAi = true;
    }
  }

  onDispose(): void {
    unregisterRoomDevices(this.roomId);
    unregisterCode(this.state.code);
  }

  /* ───── 等待阶段 ───── */

  private onReady(client: Client, ready: boolean): void {
    if (this.state.phase === "PLAYING") return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = ready;
    this.startIfAllReady();
  }

  private onAddAi(client: Client): void {
    if (!this.isHost(client) || this.state.phase === "PLAYING") return;
    const seat = this.freeSeat();
    if (seat < 0) return;
    const p = new PlayerSchema();
    p.sessionId = `ai:${++this.aiCounter}`;
    p.seat = seat;
    p.name = `机器人 ${seat}`;
    p.isAi = true;
    p.ready = true;
    this.state.players.set(p.sessionId, p);
    this.startIfAllReady();
  }

  private onRemoveAi(client: Client, seat: number): void {
    if (!this.isHost(client) || this.state.phase === "PLAYING") return;
    const target = [...this.state.players.values()].find(
      (p) => p.seat === seat && p.isAi
    );
    if (target) this.state.players.delete(target.sessionId);
  }

  private startIfAllReady(): void {
    const players = [...this.state.players.values()];
    if (players.length < 2) return;
    if (players.length !== this.state.maxPlayers) return;
    if (!players.every((p) => p.ready)) return;
    this.startRound();
  }

  private onNextRound(client: Client): void {
    if (this.state.phase !== "ROUND_OVER") return;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.ready = true;
    if ([...this.state.players.values()].every((x) => x.ready || x.isAi)) {
      this.startRound();
    }
  }

  /* ───── 对局 ───── */

  private startRound(): void {
    const count = this.state.players.size;
    this.game = new Game(count, Date.now());
    this.state.phase = "PLAYING";
    this.state.players.forEach((p) => {
      p.ready = false;
      p.score = 0;
      p.finished = false;
      p.finishRank = 0;
      p.reported = false;
    });
    this.syncGame();
    this.state.players.forEach((p) => this.sendHand(p.seat));
    this.beginTurn();
  }

  private onPlay(client: Client, msg: { cards: number[] }): void {
    const p = this.state.players.get(client.sessionId);
    if (!this.game || !p || this.state.phase !== "PLAYING") return;
    try {
      this.game.playCards(p.seat, msg.cards);
      this.afterMove(p.seat);
    } catch (e) {
      if (e instanceof RuleError) client.send("error", { message: e.message });
      else throw e;
    }
  }

  private onRespond(client: Client, msg: { cards: number[] | null }): void {
    const p = this.state.players.get(client.sessionId);
    if (!this.game || !p || this.state.phase !== "PLAYING") return;
    try {
      this.game.respond(p.seat, msg.cards);
      this.afterMove(p.seat);
    } catch (e) {
      if (e instanceof RuleError) client.send("error", { message: e.message });
      else throw e;
    }
  }

  private afterMove(seat: number): void {
    this.syncGame();
    this.sendHand(seat);
    if (this.game!.phase === "GAME_OVER") {
      this.endRound();
    } else {
      this.beginTurn();
    }
  }

  private beginTurn(): void {
    const g = this.game!;
    const seat = g.currentPlayer;
    const p = this.playerBySeat(seat);
    const auto = !p || p.isAi || !p.connected;

    this.state.currentSeat = seat;
    this.state.gamePhase = g.phase;
    this.turnTimer?.clear();

    if (auto) {
      this.state.turnDeadline = Date.now() + AI_DELAY_MS;
      this.turnTimer = this.clock.setTimeout(
        () => this.autoPlay(),
        AI_DELAY_MS
      );
      return;
    }
    this.state.turnDeadline = Date.now() + TURN_MS;
    this.turnTimer = this.clock.setTimeout(() => this.autoPlay(), TURN_MS);
  }

  private driveIfAutoTurn(): void {
    if (this.state.phase !== "PLAYING" || !this.game) return;
    const p = this.playerBySeat(this.game.currentPlayer);
    if (!p || p.isAi || !p.connected) this.beginTurn();
  }

  private autoPlay(): void {
    const g = this.game;
    if (!g || this.state.phase !== "PLAYING") return;
    const seat = g.currentPlayer;
    const hand = g.players[seat].hand;

    if (g.phase === "WAITING_LEAD") {
      const cards = chooseFreePlay(hand, this.state.maxPlayers);
      if (cards.length === 0) return;
      try {
        g.playCards(seat, cards);
        this.afterMove(seat);
      } catch {
        // AI 出牌异常则过
      }
    } else if (g.phase === "WAITING_RESPONSE") {
      const lastPlay = g.lastPlay!;
      const opponentMin = g.players
        .filter((_, i) => i !== seat && !g.players[i].finished)
        .reduce((min, pl) => Math.min(min, pl.hand.length), 99);
      const resp = chooseResponse(hand, lastPlay, opponentMin);
      try {
        g.respond(seat, resp);
        this.afterMove(seat);
      } catch {
        // AI 接牌异常则过
        g.respond(seat, null);
        this.afterMove(seat);
      }
    }
  }

  private endRound(): void {
    this.turnTimer?.clear();
    this.turnTimer = null;
    const result = this.game!.result();
    this.state.players.forEach((p) => {
      p.score = result.scores[p.seat] ?? 0;
      p.totalNet += p.score;
      p.ready = false;
      const deviceId = this.devices.get(p);
      if (deviceId && !p.isAi) recordResult(deviceId, p.name, p.score);
    });
    this.state.phase = "ROUND_OVER";
    this.state.currentSeat = -1;
    this.state.turnDeadline = 0;
    this.state.gamePhase = "";
    this.syncAllDeviceSeats();
    this.broadcast("roundOver", {
      scores: result.scores,
      remaining: result.remaining,
      bombCount: result.bombCount,
      winner: result.winner,
    });
  }

  /* ───── 同步 ───── */

  private syncGame(): void {
    const g = this.game!;
    this.state.stockCount = g.stockCount;
    this.state.bombCount = g.bombCount;
    this.state.gamePhase = g.phase;
    if (g.lastPlay) {
      this.state.lastPlay.playType = g.lastPlay.type;
      this.state.lastPlay.cards = new ArraySchema<number>(...g.lastPlay.cards);
      this.state.lastPlay.startWeight = g.lastPlay.startWeight;
      this.state.lastPlay.length = g.lastPlay.length;
      this.state.lastPlay.playerSeat = g.lastPlayBy;
    } else {
      this.state.lastPlay.playType = "";
      this.state.lastPlay.cards = new ArraySchema<number>();
      this.state.lastPlay.startWeight = 0;
      this.state.lastPlay.length = 0;
      this.state.lastPlay.playerSeat = -1;
    }
    this.state.players.forEach((p) => {
      const gp = g.players[p.seat];
      if (gp) {
        p.handCount = gp.hand.length;
        p.finished = gp.finished;
        p.finishRank = gp.finishRank;
        p.reported = gp.reported;
      }
    });
  }

  private sendHand(seat: number): void {
    const p = this.playerBySeat(seat);
    if (!p || p.isAi || !p.connected || !this.game) return;
    const client = this.clients.find((c) => c.sessionId === p.sessionId);
    client?.send("hand", this.game.players[seat].hand);
  }

  /* ───── 工具 ───── */

  private playerBySeat(seat: number): PlayerSchema | undefined {
    return [...this.state.players.values()].find((p) => p.seat === seat);
  }

  private freeSeat(): number {
    const taken = new Set([...this.state.players.values()].map((p) => p.seat));
    for (let i = 0; i < this.state.maxPlayers; i++) if (!taken.has(i)) return i;
    return -1;
  }

  private isHost(client: Client): boolean {
    return client.sessionId === this.state.hostSessionId;
  }

  private reassignHost(): void {
    if (this.state.players.has(this.state.hostSessionId)) return;
    const next = [...this.state.players.values()].find((p) => !p.isAi);
    this.state.hostSessionId = next?.sessionId ?? "";
  }

  private syncDeviceSeat(p: PlayerSchema): void {
    const id = this.devices.get(p);
    if (!id) return;
    registerDeviceSeat(id, {
      roomId: this.roomId,
      code: this.state.code,
      seat: p.seat,
      phase: this.state.phase,
    });
  }

  private syncAllDeviceSeats(): void {
    this.state.players.forEach((p) => this.syncDeviceSeat(p));
  }
}

function clampPlayers(n: number): number {
  return Math.min(5, Math.max(2, Math.floor(n)));
}
