/**
 * 入口：界面切换与出牌交互（DOM 渲染 MVP）
 */
import { cardFromId, cardName, cardWeight, isJoker, isRed } from "@gdy/shared";
import { Net, RoundOver } from "./net";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const net = new Net();
let maxPlayers = 4;
let selectedCards: Set<number> = new Set();
let lastRoundOver: RoundOver | null = null;

// ---------- 倒计时 ----------
let countdownTimer = 0;
let countdownValue = 0;
function startCountdown(seconds: number): void {
  clearInterval(countdownTimer);
  countdownValue = seconds;
  updateCountdownDisplay();
  countdownTimer = window.setInterval(() => {
    countdownValue--;
    if (countdownValue <= 0) {
      clearInterval(countdownTimer);
      countdownValue = 0;
    }
    updateCountdownDisplay();
  }, 1000);
}
function stopCountdown(): void {
  clearInterval(countdownTimer);
  countdownValue = 0;
  updateCountdownDisplay();
}
function updateCountdownDisplay(): void {
  const el = document.getElementById("countdown");
  if (el) {
    el.textContent = countdownValue > 0 ? `${countdownValue}s` : "";
  }
}

// ---------- toast ----------
let toastTimer = 0;
function toast(msg: string, ms = 2200): void {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add("hidden"), ms);
}

// ---------- 界面切换 ----------
function show(id: "lobby" | "room" | "table" | "result"): void {
  (["lobby", "room", "table", "result"] as const).forEach((s) =>
    $(s).classList.toggle("hidden", s !== id)
  );
}

// ---------- 大厅 ----------
const nameInput = $<HTMLInputElement>("name");
nameInput.value = localStorage.getItem("gdy.name") ?? "";

function playerName(): string {
  const raw = nameInput.value.trim().slice(0, 8);
  const v = raw || "无名客";
  if (nameInput.value !== raw) nameInput.value = raw;
  localStorage.setItem("gdy.name", v);
  return v;
}

$("counts").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  maxPlayers = Number(btn.dataset.n);
  Array.from($("counts").children).forEach((b) =>
    b.classList.toggle("on", b === btn)
  );
});

$("btn-create").onclick = async () => {
  try {
    await net.create(playerName(), maxPlayers);
    show("room");
  } catch (e) {
    toast((e as Error).message || "创建失败");
  }
};

$("btn-join").onclick = () => {
  const input = $<HTMLInputElement>("room-code-input");
  const code = input.value.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    toast("请输入 6 位房号");
    return;
  }
  net
    .joinByCode(playerName(), code)
    .then(() => show("room"))
    .catch((e) => toast((e as Error).message));
};

$("btn-join-code").onclick = () => $("btn-join").click();

// ---------- 房间 ----------
function renderRoom(state: any): void {
  $("room-code").textContent = state.code;
  const seats = $("seats");
  seats.innerHTML = "";
  const players: any[] = [];
  state.players.forEach((p: any, id: string) => {
    players.push({ ...p, sessionId: String(id || p.sessionId) });
  });
  players.sort((a, b) => a.seat - b.seat);

  for (let i = 0; i < state.maxPlayers; i++) {
    const p = players.find((x) => x.seat === i);
    const div = document.createElement("div");
    const mine = !!p && p.sessionId === net.room?.sessionId;
    div.className = "seat" + (p ? "" : " empty") + (mine ? " mine" : "");
    if (p) {
      const tag = p.ready ? "已准备" : p.isAi ? "机器人" : "等待中";
      div.innerHTML = `<div class="who">${p.name}${
        mine ? "（我）" : ""
      }</div><div class="tag">${tag}</div>`;
    } else {
      div.innerHTML = `<div class="who">空座</div>`;
    }
    seats.appendChild(div);
  }

  const need = state.maxPlayers - players.length;
  const unready = players.filter((p) => !p.ready).length;
  const status = $("room-status");
  if (need > 0) status.textContent = `还差 ${need} 人`;
  else if (unready > 0) status.textContent = `人数已满 · ${unready} 人未准备`;
  else status.textContent = "全员已准备 · 即将开局";

  const me = players.find((x) => x.sessionId === net.room?.sessionId);
  $<HTMLButtonElement>("btn-ready").textContent = me?.ready
    ? "取消准备"
    : "准备";
  $<HTMLButtonElement>("btn-ai").disabled = players.length >= state.maxPlayers;
}

$("btn-ready").onclick = () => {
  const me = net.state?.players.get(net.room!.sessionId);
  net.ready(!me?.ready);
};
$("btn-ai").onclick = () => net.addAi();
$("btn-quit").onclick = async () => {
  await net.leave();
  show("lobby");
};

// ---------- 牌桌渲染 ----------
function cardHtml(id: number, selected: boolean): string {
  if (id === 52)
    return `<div class="card joker-small${
      selected ? " selected" : ""
    }" data-id="${id}"><span class="rank-main">小</span></div>`;
  if (id === 53)
    return `<div class="card joker-big${
      selected ? " selected" : ""
    }" data-id="${id}"><span class="rank-main">大</span></div>`;
  const c = cardFromId(id);
  const red = isRed(id);
  const suitSym =
    { S: "♠", H: "♥", D: "♦", C: "♣" }[c.suit as "S" | "H" | "D" | "C"] ?? "";
  const rankSym =
    ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
      c.rank - 1
    ] ?? "?";
  const cls = `card${red ? " red" : ""}${selected ? " selected" : ""}`;
  return `<div class="${cls}" data-id="${id}"><span class="suit">${suitSym}</span><span class="rank-main">${rankSym}</span></div>`;
}

function renderHand(): void {
  const el = $("hand");
  // 手牌按点数排序（权重从小到大）
  const sorted = [...net.hand].sort((a, b) => cardWeight(a) - cardWeight(b));
  el.innerHTML = sorted
    .map((id) => cardHtml(id, selectedCards.has(id)))
    .join("");
}

function renderTable(state: any): void {
  if (!state || state.phase !== "PLAYING") return;
  const mySeat = net.mySeat;

  // 对手
  const opps = $("opponents");
  const players: any[] = [];
  state.players.forEach((p: any) => players.push(p));
  players.sort((a, b) => a.seat - b.seat);
  opps.innerHTML = players
    .filter((p) => p.seat !== mySeat)
    .map((p) => {
      const active = state.currentSeat === p.seat;
      const cls = `opp${active ? " active" : ""}${
        p.finished ? " finished" : ""
      }`;
      const rep = p.reported ? ` <span class="reported-tag">报单</span>` : "";
      return `<div class="${cls}"><div class="opp-name">${
        p.name
      }${rep}</div><div class="opp-count">${p.handCount}张${
        p.finished ? " 已出完" : ""
      }</div></div>`;
    })
    .join("");

  // 最后出牌
  const lp = state.lastPlay;
  const lpEl = $("last-play");
  if (lp && lp.playType && lp.cards?.length) {
    const who = players.find((p) => p.seat === lp.playerSeat);
    const label = who ? `${who.name}：` : "";
    lpEl.innerHTML =
      `<span style="margin-right:8px;color:#aaa">${label}</span>` +
      [...lp.cards].map((id) => cardHtml(id, false)).join("");
  } else {
    lpEl.innerHTML = `<span style="color:#666">自由出牌</span>`;
  }

  // 牌堆 & 炸弹
  $(
    "stock-info"
  ).textContent = `牌堆 ${state.stockCount}张 · 炸弹 ×${state.bombCount}`;

  // 回合提示 + 倒计时
  const hint = $("turn-hint");
  if (state.currentSeat === mySeat) {
    stopCountdown();
    if (state.gamePhase === "WAITING_LEAD") hint.textContent = "轮到你出牌";
    else if (state.gamePhase === "WAITING_RESPONSE")
      hint.textContent = "轮到你接牌（或过）";
    else hint.textContent = "";
  } else {
    const cur = players.find((p) => p.seat === state.currentSeat);
    hint.textContent = cur ? `等待 ${cur.name}…` : "";
    // 对手回合启动倒计时（10秒）
    if (countdownValue === 0 || countdownValue > 10) {
      startCountdown(10);
    }
  }

  // 过牌按钮
  const btnPass = $("btn-pass");
  const canPass =
    state.currentSeat === mySeat && state.gamePhase === "WAITING_RESPONSE";
  btnPass.classList.toggle("hidden", !canPass);
}

// ---------- 出牌交互 ----------
$("hand").addEventListener("click", (e) => {
  const cardEl = (e.target as HTMLElement).closest(
    ".card"
  ) as HTMLElement | null;
  if (!cardEl) return;
  const id = Number(cardEl.dataset.id);
  if (isNaN(id)) return;

  const state = net.state;
  if (!state || state.phase !== "PLAYING" || state.currentSeat !== net.mySeat)
    return;

  if (state.gamePhase === "WAITING_LEAD") {
    // 自由出牌：点击即出
    if (selectedCards.has(id)) {
      // 已选中 → 确认出牌（带动画）
      const cards = [...selectedCards];
      selectedCards.clear();
      // 添加出牌动画
      cards.forEach((cid) => {
        const el = document.querySelector(`.card[data-id="${cid}"]`);
        if (el) el.classList.add("playing");
      });
      setTimeout(() => {
        net.play(cards);
        renderHand();
      }, 200);
    } else {
      // 选中/取消选中
      if (selectedCards.has(id)) selectedCards.delete(id);
      else selectedCards.add(id);
      renderHand();
    }
  } else if (state.gamePhase === "WAITING_RESPONSE") {
    // 接牌：选中后点"出牌"或再次点击确认
    if (selectedCards.has(id)) {
      const cards = [...selectedCards];
      selectedCards.clear();
      // 添加接牌动画
      cards.forEach((cid) => {
        const el = document.querySelector(`.card[data-id="${cid}"]`);
        if (el) el.classList.add("responding");
      });
      setTimeout(() => {
        net.respond(cards);
        renderHand();
      }, 200);
    } else {
      if (selectedCards.has(id)) selectedCards.delete(id);
      else selectedCards.add(id);
      renderHand();
    }
  }
});

$("btn-pass").onclick = () => {
  selectedCards.clear();
  net.respond(null);
  renderHand();
};

// ---------- 结算 ----------
function renderResult(r: RoundOver): void {
  const state = net.state;
  if (!state) return;
  const players: any[] = [];
  state.players.forEach((p: any) => players.push(p));
  players.sort((a, b) => a.seat - b.seat);

  $("result-title").textContent = "本局结算";
  $("result-list").innerHTML = players
    .map((p) => {
      const s = r.scores[p.seat] ?? 0;
      const cls = `result-row${p.seat === net.mySeat ? " me" : ""}`;
      const sCls = s > 0 ? "win" : s < 0 ? "lose" : "";
      return `<div class="${cls}"><span class="name">${
        p.name
      }</span><span class="score ${sCls}">${s > 0 ? "+" : ""}${s}</span></div>`;
    })
    .join("");
  show("result");
}

$("btn-again").onclick = () => {
  lastRoundOver = null;
  net.nextRound();
  show("room");
};
$("btn-exit").onclick = async () => {
  await net.leave();
  show("lobby");
};

// ---------- 网络回调 ----------
net.onState = (state) => {
  if (state.phase === "WAITING") {
    renderRoom(state);
    show("room");
  } else if (state.phase === "PLAYING") {
    renderTable(state);
    renderHand();
    show("table");
  } else if (state.phase === "ROUND_OVER") {
    // 等 onRoundOver
  }
};

net.onHand = () => {
  selectedCards.clear();
  renderHand();
};

net.onRoundOver = (r) => {
  lastRoundOver = r;
  renderResult(r);
};

net.onError = (msg) => {
  toast(msg);
  selectedCards.clear();
  renderHand();
};

net.onLeave = () => {
  show("lobby");
};
