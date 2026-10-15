/**
 * 网络层：Colyseus 连接封装
 */
import { Client, Room } from "colyseus.js";

// WebSocket 地址：优先使用 VITE_WS 环境变量，否则根据页面协议自动选择
const WS_URL =
  (import.meta.env.VITE_WS as string | undefined)?.trim() ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${
    location.hostname
  }:2567`;
const HTTP_URL = WS_URL.replace(/^ws/, "http");
const DEVICE_KEY = "gdy.device";
const RECONNECT_KEY = "gdy.reconnect";

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    // 随机生成 16 字节设备标识（历史上误用全零数组，导致所有设备共用同一 ID）
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** HTTP 接口基地址（api.ts 复用） */
export function httpBase(): string {
  return HTTP_URL;
}

/** 本地保存的可恢复对局信息（刷新页面后用于重连） */
export interface SavedMatch {
  token: string;
  roomId: string;
  code: string;
}

export function getSavedMatch(): SavedMatch | null {
  try {
    const raw = localStorage.getItem(RECONNECT_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as SavedMatch;
    return m && m.token && m.roomId ? m : null;
  } catch {
    return null;
  }
}

function saveMatch(room: Room<any>): void {
  const token = (room as { reconnectionToken?: string }).reconnectionToken;
  if (!token) return;
  try {
    localStorage.setItem(
      RECONNECT_KEY,
      JSON.stringify({
        token,
        roomId: room.roomId,
        code: String((room.state as { code?: string })?.code ?? ""),
      } satisfies SavedMatch)
    );
  } catch {
    // 隐私模式等场景下忽略
  }
}

function clearSavedMatch(): void {
  localStorage.removeItem(RECONNECT_KEY);
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

  /** 直接按 roomId 加入（断线重连 - 等待期重进房间） */
  async joinById(roomId: string, name: string): Promise<void> {
    await this.leave().catch(() => undefined);
    this.bind(
      await this.client.joinById(roomId, { name, deviceId: deviceId() })
    );
  }

  /** 用本地保存的 reconnectionToken 恢复对局（刷新页面后回到原座位） */
  async reconnect(): Promise<void> {
    const saved = getSavedMatch();
    if (!saved) throw new Error("没有可恢复的对局");
    await this.leave().catch(() => undefined);
    try {
      const room = await this.client.reconnect(saved.token);
      this.bind(room);
    } catch {
      clearSavedMatch();
      throw new Error("对局已结束或座位已释放");
    }
  }

  private bind(room: Room<any>): void {
    this.room = room;
    saveMatch(room);
    room.onMessage("joined", (m: { seat: number }) => {
      this.mySeat = m.seat;
    });
    // 重连时服务端不会重发 joined，从 state 反推自己的座位
    const syncSeatFromState = () => {
      if (this.mySeat >= 0) return;
      const players = (room.state as { players?: Map<string, { seat: number }> })
        ?.players;
      players?.forEach((p, sessionId) => {
        if (String(sessionId) === room.sessionId) this.mySeat = p.seat;
      });
    };
    room.onMessage("hand", (hand: number[]) => {
      this.hand = hand;
      this.onHand?.();
    });
    room.onMessage("roundOver", (r: RoundOver) => this.onRoundOver?.(r));
    room.onMessage("error", (e: { message: string }) =>
      this.onError?.(e.message)
    );
    room.onStateChange(() => {
      syncSeatFromState();
      this.onState?.(room.state);
    });
    room.onLeave(() => {
      this.room = null;
      this.mySeat = -1;
      this.hand = [];
      clearSavedMatch();
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
    this.mySeat = -1;
    this.hand = [];
    clearSavedMatch();
    await room.leave(true);
  }
}
