/**
 * HTTP 数据层：战绩 / 排行榜 / 断线重连 / 账号体系
 * 与 net.ts（WebSocket 对局通道）互补，全部走服务端 Express 接口
 */
import { deviceId, httpBase } from "./net";

const BASE = httpBase();
const NAME_KEY = "gdy.name";
const ACCOUNT_KEY = "gdy.account";

export interface Profile {
  deviceId: string;
  accountId?: string;
  name: string;
  games: number;
  wins: number;
  totalNet: number;
}

export interface ActiveMatch {
  roomId: string;
  code: string;
  seat: number;
  phase: string;
}

export interface AccountCreds {
  accountId: string;
  token: string;
}

/* ---------- 昵称 ---------- */

export function playerName(): string {
  return localStorage.getItem(NAME_KEY)?.trim() || "无名客";
}

export function setPlayerName(name: string): void {
  const v = name.trim().slice(0, 8) || "无名客";
  localStorage.setItem(NAME_KEY, v);
}

/* ---------- 账号凭证（本地保存，用于多设备恢复） ---------- */

export function getAccountCreds(): AccountCreds | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as AccountCreds;
    return c && c.accountId && c.token ? c : null;
  } catch {
    return null;
  }
}

export function setAccountCreds(creds: AccountCreds): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(creds));
}

/** 排行榜里「我」的标识：绑了账号用 accountId，否则用设备 ID */
export function myProfileId(): string {
  return getAccountCreds()?.accountId ?? deviceId();
}

/* ---------- 接口 ---------- */

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`请求失败(${res.status})`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!res.ok) throw new Error(data?.error || `请求失败(${res.status})`);
  return data as T;
}

/** 我的战绩（游客按设备，绑定后按账号） */
export function fetchProfile(): Promise<Profile | null> {
  return get<Profile | null>(`/api/profile/${deviceId()}`);
}

/** 排行榜（按总积分取前 N） */
export function fetchLeaderboard(limit = 20): Promise<Profile[]> {
  return get<Profile[]>(`/api/leaderboard?limit=${limit}`);
}

/** 是否有未完成的对局（刷新/闪退后回到牌桌） */
export async function fetchActiveMatch(): Promise<ActiveMatch | null> {
  try {
    return await get<ActiveMatch>(`/api/active-match/${deviceId()}`);
  } catch {
    return null; // 404 = 没有进行中的对局
  }
}

/** 创建正式账号（昵称带入） */
export function createAccount(
  name: string
): Promise<{ accountId: string; token: string; profile: Profile }> {
  return post(`/api/account/create`, { name });
}

/** 把当前设备绑定到账号（游客战绩合并入账号） */
export function bindAccount(
  accountId: string,
  token: string
): Promise<{ ok: boolean; profile: Profile }> {
  return post(`/api/account/bind`, { accountId, token, deviceId: deviceId() });
}

/** 当前设备已绑定的账号 */
export function fetchBoundAccount(): Promise<{
  accountId: string | null;
  profile: Profile | null;
}> {
  return get(`/api/account/bound/${deviceId()}`);
}
