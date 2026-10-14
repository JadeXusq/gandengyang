/**
 * 网络层：Colyseus 连接封装
 */
import { Client, Room } from "colyseus.js";

// WebSocket 地址：优先使用 VITE_WS 环境变量，否则根据页面协议自动选择
const WS_URL =
  (import.meta.env.VITE_WS as string | undefined)?.trim() ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;
const HTTP_URL = WS_URL.replace(/^ws/, "http");
const DEVICE_KEY = "gdy.device";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = Array.from(new Uint8Array(16), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export interface RoundOver {
  scores: number[];
  remaining: number[];
  bombCount: number;
  winner: number;
}

export class Net {
  private client = new Client(WS_URL);
  room: Room<any> | null = null;
  mySeat = -1;
  hand: number[] = [];

  onState?: (state: any) => void;
  onHand?: () => void;
  onRoundOver?: (r: RoundOver) => void;
  onError?: (msg: string) => void;
  onLeave?: () => void;

  get state(): any {
    return this.room?.state;
  }

  async create(name: string, maxPlayers: number): Promise<void> {
    await this.leave().catch(() => undefined);
    this.bind(
      await this.client.create("game", {
        name,
        maxPlayers,
        deviceId: deviceId(),
      })
    );
  }

  async joinByCode(name: string, code: string): Promise<void> {
    await this.leave().catch(() => undefined);
    const res = await fetch(`${HTTP_URL}/api/room/${code}`);
    if (!res.ok) throw new Error("房间不存在");
    const { roomId } = await res.json();
    this.bind(
      await this.client.joinById(roomId, { name, deviceId: deviceId() })
    );
  }

  private bind(room: Room<any>): void {
    this.room = room;
    room.onMessage("joined", (m: { seat: number }) => {
      this.mySeat = m.seat;
    });
    room.onMessage("hand", (hand: number[]) => {
      this.hand = hand;
      this.onHand?.();
    });
    room.onMessage("roundOver", (r: RoundOver) => this.onRoundOver?.(r));
    room.onMessage("error", (e: { message: string }) =>
      this.onError?.(e.message)
    );
    room.onStateChange(() => this.onState?.(room.state));
    room.onLeave(() => {
      this.room = null;
      this.onLeave?.();
    });
  }

  ready(v: boolean): void {
    this.room?.send("ready", v);
  }
  addAi(): void {
    this.room?.send("addAi");
  }
  play(cards: number[]): void {
    this.room?.send("play", { cards });
  }
  respond(cards: number[] | null): void {
    this.room?.send("respond", { cards });
  }
  nextRound(): void {
    this.room?.send("nextRound");
  }

  async leave(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.room = null;
    await room.leave(true);
  }
}
