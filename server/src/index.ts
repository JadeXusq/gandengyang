import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom";
import { lookupDeviceSeat, resolveCode } from "./roomCodes";
import {
  bindDevice,
  boundAccountId,
  createAccount,
  getAccount,
  getProfile,
  leaderboard,
} from "./store";

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom).filterBy(["maxPlayers"]);

app.get("/api/room/:code", (req, res) => {
  const roomId = resolveCode(req.params.code);
  if (!roomId) return res.status(404).json({ error: "房间不存在" });
  res.json({ roomId });
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/active-match/:deviceId", (req, res) => {
  const seat = lookupDeviceSeat(String(req.params.deviceId || ""));
  if (!seat) return res.status(404).json({ error: "没有进行中的对局" });
  res.json(seat);
});

app.get("/api/leaderboard", (_req, res) => res.json(leaderboard()));

app.get("/api/profile/:deviceId", (req, res) => {
  res.json(getProfile(req.params.deviceId) ?? null);
});

app.post("/api/account/create", (req, res) => {
  const name = String(req.body?.name || "玩家").slice(0, 12);
  res.json(createAccount(name));
});

app.post("/api/account/bind", (req, res) => {
  try {
    const accountId = String(req.body?.accountId || "");
    const token = String(req.body?.token || "");
    const deviceId = String(req.body?.deviceId || "");
    const profile = bindDevice(accountId, token, deviceId);
    res.json({ ok: true, profile });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/account/bound/:deviceId", (req, res) => {
  const accountId = boundAccountId(req.params.deviceId);
  res.json({
    accountId: accountId ?? null,
    profile: accountId
      ? getAccount(accountId)
      : getProfile(req.params.deviceId) ?? null,
  });
});

app.get("/api/account/:accountId", (req, res) => {
  res.json(getAccount(req.params.accountId) ?? null);
});

gameServer.listen(PORT).then(() => {
  console.log(`[干瞪眼] 服务器已启动 port=${PORT}`);
});
