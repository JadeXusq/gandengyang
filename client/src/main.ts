/**
 * 入口：界面切换与出牌交互（DOM 渲染 - 新版 UI）
 */
import { cardFromId, cardWeight, isRed } from "@gdy/shared";
import { Net, RoundOver, deviceId, getSavedMatch } from "./net";
import {
  ActiveMatch,
  Profile,
  bindAccount,
  createAccount,
  fetchActiveMatch,
  fetchBoundAccount,
  fetchLeaderboard,
  fetchProfile,
  getAccountCreds,
  myProfileId,
  playerName,
  setAccountCreds,
  setPlayerName,
} from "./api";

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
type OverlayId = "rank" | "me" | "rules" | "result";
type ScreenId = "lobby" | "room" | "table";

const MAIN_SCREENS: ScreenId[] = ["lobby", "room", "table"];
const OVERLAYS: OverlayId[] = ["rank", "me", "rules", "result"];

function show(id: ScreenId): void {
  MAIN_SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id));
  // 切换主屏时关闭所有覆盖层
  OVERLAYS.forEach((o) => $(o).classList.add("hidden"));
  if (id === "lobby") void refreshHome();
}

function openOverlay(id: OverlayId): void {
  $(id).classList.remove("hidden");
}
function closeOverlay(id: OverlayId): void {
  $(id).classList.add("hidden");
}

// ---------- 小工具 ----------
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string
  );
}

function fmtScore(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function winRate(p: Profile): string {
  return p.games > 0 ? `${Math.round((p.wins / p.games) * 100)}%` : "0%";
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function crownSvg(color: string): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="M4 17.5 2.8 9.2l4.6 3.4L12 5l4.6 7.6 4.6-3.4L20 17.5z"/></svg>`;
}

// ---------- 房号输入 ----------
function setupCodeInputs(): void {
  const digits = document.querySelectorAll(".code-digit");
  digits.forEach((input, idx) => {
    input.addEventListener("input", () => {
      const val = (input as HTMLInputElement).value.replace(/\D/g, "");
      (input as HTMLInputElement).value = val;
      if (val && idx < digits.length - 1) {
        (digits[idx + 1] as HTMLInputElement).focus();
      }
    });
    input.addEventListener("keydown", (e) => {
      // 注：当前环境的 lib.dom 事件映射经过裁剪，e 被推断为 Event，需断言取值
      if (
        (e as KeyboardEvent).key === "Backspace" &&
        !(input as HTMLInputElement).value &&
        idx > 0
      ) {
        (digits[idx - 1] as HTMLInputElement).focus();
      }
    });
    input.addEventListener("focus", () => (input as HTMLInputElement).select());
  });
}

function getRoomCode(): string {
  return Array.from(document.querySelectorAll(".code-digit"))
    .map((el) => (el as HTMLInputElement).value)
    .join("");
}

function clearCodeInputs(): void {
  document.querySelectorAll(".code-digit").forEach((el) => {
    (el as HTMLInputElement).value = "";
  });
}

setupCodeInputs();

// ---------- 大厅 ----------
$("counts").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(
    ".player-btn"
  ) as HTMLElement | null;
  if (!btn) return;
  maxPlayers = Number(btn.dataset.n);
  document
    .querySelectorAll(".player-btn")
    .forEach((b) => b.classList.toggle("on", b === btn));
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
  const code = getRoomCode();
  if (code.length !== 6) {
    toast("请输入 6 位房号");
    return;
  }
  net
    .joinByCode(playerName(), code)
    .then(() => show("room"))
    .catch((e) => toast((e as Error).message));
};

// ---------- 房间 ----------
function seatAvatarHtml(type: "spade" | "heart" | "robot" | "waiting"): string {
  const icons: Record<string, string> = {
    spade:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2C9 8 4 10 4 14a4 4 0 0 0 8 0 4 4 0 0 0 8 0c0-4-5-6-8-12z"/><path d="M12 18v4"/></svg>',
    heart:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    robot:
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
    waiting: "+",
  };
  return `<div class="seat-avatar ${type}">${icons[type]}</div>`;
}

function renderRoom(state: any): void {
  const code = String(state.code);
  $("room-code").textContent =
    code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  $("setting-players").textContent = `${state.maxPlayers} 人`;

  const seats = $("seats");
  seats.innerHTML = "";
  const players: any[] = [];
  state.players.forEach((p: any, id: string) => {
    players.push({ ...p, sessionId: String(id || p.sessionId) });
  });
  players.sort((a, b) => a.seat - b.seat);

  const avatarTypes = ["spade", "heart", "robot", "spade", "heart"];

  for (let i = 0; i < state.maxPlayers; i++) {
    const p = players.find((x) => x.seat === i);
    const div = document.createElement("div");
    const mine = !!p && p.sessionId === net.room?.sessionId;
    div.className = "seat" + (p ? "" : " empty") + (mine ? " mine" : "");

    if (p) {
      const avatarType = avatarTypes[i % avatarTypes.length] as
        | "spade"
        | "heart"
        | "robot";
      let tagCls = "waiting-tag",
        tagText = "等待加入";
      if (p.ready) {
        tagCls = "ready";
        tagText = "已准备";
      } else if (p.isAi) {
        tagCls = "robot-tag";
        tagText = "机器人";
      } else if (p.sessionId === String(state.hostSessionId)) {
        tagCls = "host-tag";
        tagText = "房主";
      }

      div.innerHTML = `
        ${seatAvatarHtml(avatarType)}
        <div class="seat-name">${p.name}${mine ? "" : ""}</div>
        <span class="seat-tag ${tagCls}">${tagText}</span>
      `;
    } else {
      div.innerHTML = `
        ${seatAvatarHtml("waiting")}
        <div class="seat-name">空座</div>
        <span class="seat-tag waiting-tag">等待加入</span>
      `;
    }
    seats.appendChild(div);
  }

  const joined = players.length;

  const me = players.find((x) => x.sessionId === net.room?.sessionId);
  $("btn-ready").textContent = me?.ready ? "取消准备" : "准备";
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

// 复制房号
$("btn-copy-code").onclick = () => {
  const code = $("room-code").textContent;
  navigator.clipboard
    ?.writeText(code)
    .then(() => toast("房号已复制"))
    .catch(() => {});
};

// ---------- 牌桌渲染 ----------
function cardHtml(
  id: number,
  selected: boolean,
  transform?: string,
  z?: number
): string {
  const style = transform
    ? ` style="transform:${transform};z-index:${z}"`
    : "";
  if (id === 52)
    return `<div class="card-el joker-small${
      selected ? " selected" : ""
    }" data-id="${id}"${style}><span class="rank-sym">小</span></div>`;
  if (id === 53)
    return `<div class="card-el joker-big${
      selected ? " selected" : ""
    }" data-id="${id}"${style}><span class="rank-sym">大</span></div>`;
  const c = cardFromId(id);
  const red = isRed(id);
  const suitSym =
    { S: "♠", H: "♥", D: "♦", C: "♣" }[c.suit as "S" | "H" | "D" | "C"] ?? "";
  const rankSym =
    ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
      c.rank - 1
    ] ?? "?";
  const cls = `card-el${red ? " red" : ""}${selected ? " selected" : ""}`;
  return `<div class="${cls}" data-id="${id}"${style}><span class="rank-sym">${rankSym}</span><span class="suit-sym">${suitSym}</span></div>`;
}

function renderHand(): void {
  const el = $("hand");
  const sorted = [...net.hand].sort((a, b) => cardWeight(a) - cardWeight(b));
  const n = sorted.length;
  const mid = (n - 1) / 2;
  const maxAngle = Math.min(32, Math.max(10, n * 3));
  const step = n > 1 ? maxAngle / (n - 1) : 0;
  // 横向间距：牌少时舒展（最多 64px），牌多时收紧（至少 22px 露出牌角）
  const spacing = n > 1 ? Math.min(64, Math.max(22, 620 / (n - 1))) : 0;
  el.innerHTML = sorted
    .map((id, i) => {
      const angle = (i - mid) * step;
      const selected = selectedCards.has(id);
      const z = selected ? 100 + i : i + 1;
      // 选中上抬 26px；边缘牌随弧面轻微上抬 2.5px/格
      const lift = (selected ? -26 : 0) - Math.abs(i - mid) * 2.5;
      const dx = (i - mid) * spacing;
      const transform = `translateX(calc(-50% + ${dx}px)) rotate(${angle}deg) translateY(${lift}px)`;
      return cardHtml(id, selected, transform, z);
    })
    .join("");
}

function renderTable(state: any): void {
  if (!state || state.phase !== "PLAYING") return;
  const mySeat = net.mySeat;

  $("table-room-code").textContent = `房号 ${state.code || ""}`;
  $("table-stock").textContent = `底牌 ${state.stockCount} 张`;
  $("table-bombs").textContent = `炸弹 ×${state.bombCount}`;

  // 对手
  const opps = $("opponents");
  const players: any[] = [];
  state.players.forEach((p: any) => players.push(p));
  players.sort((a, b) => a.seat - b.seat);

  const oppAvatarTypes = ["heart-opp", "spade-opp", "robot-opp"];
  const oppAvatarIcons: Record<string, string> = {
    "heart-opp":
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    "spade-opp":
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C9 8 4 10 4 14a4 4 0 0 0 8 0 4 4 0 0 0 8 0c0-4-5-6-8-12z"/><path d="M12 18v4"/></svg>',
    "robot-opp":
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>',
  };

  opps.innerHTML = players
    .filter((p) => p.seat !== mySeat)
    .map((p, idx) => {
      const active = state.currentSeat === p.seat;
      const cls = `opp${active ? " active" : ""}${
        p.finished ? " finished" : ""
      }`;
      const avType = oppAvatarTypes[idx % oppAvatarTypes.length];
      const rep = p.reported ? ` <span class="reported-tag">报单</span>` : "";
      return `<div class="${cls}">
        <div class="opp-avatar ${avType}">${oppAvatarIcons[avType]}</div>
        <div class="opp-name">${p.name}${rep}</div>
        <div class="opp-count">${p.handCount} 张${
        p.finished ? " 已出完" : ""
      }</div>
      </div>`;
    })
    .join("");

  // 我的信息
  const me = players.find((p) => p.seat === mySeat);
  $("my-name").textContent = me?.name ?? "我";
  $("my-count").textContent = `${net.hand.length} 张`;

  // 报单状态：剩 1 张时服务端自动报单，这里展示状态徽标
  const btnReport = $("btn-report");
  const showReport = !!me && me.handCount === 1 && !me.finished;
  btnReport.classList.toggle("hidden", !showReport);
  if (showReport) {
    btnReport.textContent = me.reported ? "已报单" : "报单";
    btnReport.classList.toggle("reported", !!me.reported);
  }

  // 最后出牌
  const lp = state.lastPlay;
  const lpLabel = $("last-play-label");
  const lpEl = $("last-play");
  if (lp && lp.cards && lp.cards.length) {
    const who = players.find((p) => p.seat === lp.playerSeat);
    const typeLabel =
      lp.playType === "STRAIGHT"
        ? "顺子"
        : lp.playType === "BOMB"
        ? "炸弹"
        : lp.playType === "SINGLE"
        ? "单张"
        : lp.playType === "PAIR"
        ? "对子"
        : lp.playType || "";
    lpLabel.innerHTML = who ? `${who.name} 出牌 · ${typeLabel}` : "";
    lpEl.innerHTML = [...lp.cards].map((id) => cardHtml(id, false)).join("");
  } else if (state.gamePhase === "WAITING_LEAD") {
    lpLabel.innerHTML = "";
    lpEl.innerHTML = `<span style="color:#7fb89a;font-size:1rem;letter-spacing:2px">自由出牌</span>`;
  } else {
    lpLabel.innerHTML = "";
    lpEl.innerHTML = `<span class="pass-bubble">不出</span>`;
  }

  // 回合提示
  const hint = $("turn-hint");
  const sub = $("turn-sub");
  if (state.currentSeat === mySeat) {
    stopCountdown();
    if (state.gamePhase === "WAITING_LEAD") {
      hint.textContent = "轮到你出牌";
      sub.textContent = "";
    } else if (state.gamePhase === "WAITING_RESPONSE") {
      hint.textContent = "轮到你接牌";
      // 提示可接的牌型
      if (lp && lp.cards?.length) {
        const lastCard = lp.cards[lp.cards.length - 1];
        const c = cardFromId(lastCard);
        const ranks = [
          "A",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "J",
          "Q",
          "K",
        ];
        const rankName = ranks[c.rank - 1] ?? "?";
        sub.textContent = `顺子 ${rankName} 起可接 · 也可出炸弹`;
      } else {
        sub.textContent = "";
      }
    } else {
      hint.textContent = "";
      sub.textContent = "";
    }
  } else {
    const cur = players.find((p) => p.seat === state.currentSeat);
    hint.textContent = cur ? `等待 ${cur.name}…` : "";
    sub.textContent = "";
    if (countdownValue === 0 || countdownValue > 10) {
      startCountdown(10);
    }
  }

  // 按钮显隐
  const btnPass = $("btn-pass");
  const canPass =
    state.currentSeat === mySeat && state.gamePhase === "WAITING_RESPONSE";
  btnPass.classList.toggle("hidden", !canPass);
}

// ---------- 出牌交互 ----------
$("hand").addEventListener("click", (e) => {
  const cardEl = (e.target as HTMLElement).closest(
    ".card-el"
  ) as HTMLElement | null;
  if (!cardEl) return;
  const id = Number(cardEl.dataset.id);
  if (isNaN(id)) return;

  const state = net.state;
  if (!state || state.phase !== "PLAYING" || state.currentSeat !== net.mySeat)
    return;

  if (state.gamePhase === "WAITING_LEAD") {
    if (selectedCards.has(id)) {
      const cards = [...selectedCards];
      selectedCards.clear();
      cards.forEach((cid) => {
        const el = document.querySelector(`.card-el[data-id="${cid}"]`);
        if (el) el.classList.add("playing");
      });
      setTimeout(() => {
        net.play(cards);
        renderHand();
      }, 200);
    } else {
      if (selectedCards.has(id)) selectedCards.delete(id);
      else selectedCards.add(id);
      renderHand();
    }
  } else if (state.gamePhase === "WAITING_RESPONSE") {
    if (selectedCards.has(id)) {
      const cards = [...selectedCards];
      selectedCards.clear();
      cards.forEach((cid) => {
        const el = document.querySelector(`.card-el[data-id="${cid}"]`);
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

$("btn-play").onclick = () => {
  if (selectedCards.size === 0) {
    toast("请先选择要出的牌");
    return;
  }
  const state = net.state;
  if (!state || state.phase !== "PLAYING" || state.currentSeat !== net.mySeat)
    return;

  const cards = [...selectedCards];
  selectedCards.clear();

  if (state.gamePhase === "WAITING_LEAD") {
    cards.forEach((cid) => {
      const el = document.querySelector(`.card-el[data-id="${cid}"]`);
      if (el) el.classList.add("playing");
    });
    setTimeout(() => {
      net.play(cards);
      renderHand();
    }, 200);
  } else if (state.gamePhase === "WAITING_RESPONSE") {
    cards.forEach((cid) => {
      const el = document.querySelector(`.card-el[data-id="${cid}"]`);
      if (el) el.classList.add("responding");
    });
    setTimeout(() => {
      net.respond(cards);
      renderHand();
    }, 200);
  }
};

$("btn-table-exit").onclick = async () => {
  await net.leave();
  show("lobby");
};

// ---------- 结算 ----------
function renderResult(r: RoundOver): void {
  const state = net.state;
  if (!state) return;
  const players: any[] = [];
  state.players.forEach((p: any) => players.push(p));
  players.sort((a, b) => a.seat - b.seat);

  // 按得分排序确定名次
  const ranked = players
    .map((p, idx) => ({
      ...p,
      origIdx: idx,
      score: r.scores[p.seat] ?? 0,
      remaining: r.remaining[p.seat] ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const winner = ranked[0];

  $("result-title").textContent =
    winner.seat === net.mySeat ? "胜 利" : "本局结束";
  $("result-sub").textContent = `房间 ${
    state.code || ""
  } · 标准规则 · 炸弹加倍`;

  // 赢家卡片
  $("winner-name").textContent = winner.name;
  $("winner-desc").textContent = `出完手牌 · ${winner.remaining} 张剩余`;
  $("winner-score").textContent = `${winner.score > 0 ? "+" : ""}${
    winner.score
  }`;

  // 其他玩家列表
  const listEl = $("result-list");
  listEl.innerHTML = ranked
    .slice(1)
    .map((p, idx) => {
      const rank = idx + 2;
      const rankCls = `r${rank}`;
      const avCls =
        p.seat === net.mySeat ? "av-me" : p.isAi ? "av-gray" : "av-red";
      const avLabel = p.seat === net.mySeat ? "我" : p.name.charAt(0);
      const scoreCls = p.score > 0 ? "positive" : p.score < 0 ? "negative" : "";
      const desc = p.isAi
        ? `剩 ${p.remaining} 张 · 机器人`
        : `剩 ${p.remaining} 张`;
      const rowCls = `result-row${p.seat === net.mySeat ? " me" : ""}`;
      return `<div class="${rowCls}">
        <div class="result-rank ${rankCls}">${rank}</div>
        <div class="result-avatar-sm ${avCls}">${avLabel}</div>
        <div class="result-player-info">
          <div class="result-player-name">${p.name}</div>
          <div class="result-player-desc">${desc}</div>
        </div>
        <div class="result-score ${scoreCls}">${p.score > 0 ? "+" : ""}${
        p.score
      }</div>
      </div>`;
    })
    .join("");

  // 统计
  $("stat-bomb").textContent = `炸弹 ×${r.bombCount} · 得分 ×${
    r.bombCount > 0 ? r.bombCount + 1 : 1
  }`;
  const totalDraw = r.remaining.reduce((a, b) => a + b, 0);
  $("stat-draw").textContent = `摸牌 ${totalDraw} 张`;
  const reportCount = players.filter((p) => p.reported).length;
  $("stat-report").textContent = `报单 ${reportCount} 次`;

  openOverlay("result");
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

// ---------- 首页数据（战绩 + 断线重连） ----------
let resumeMatch: ActiveMatch | null = null;

async function refreshHome(): Promise<void> {
  // 预取本地战绩（大厅已不展示战绩卡，元素移至「我的」弹窗）
  try {
    await fetchProfile();
  } catch {
    // 服务未启动时忽略
  }
  // 断线重连横幅
  try {
    const m = await fetchActiveMatch();
    resumeMatch = m;
    if (m) {
      const pretty =
        m.code.length === 6
          ? `${m.code.slice(0, 3)} ${m.code.slice(3)}`
          : m.code;
      $("resume-sub").textContent = `房间 ${pretty} · ${
        m.phase === "PLAYING" ? "对局进行中" : "等待玩家加入"
      }`;
      $("resume-card").classList.remove("hidden");
    } else {
      $("resume-card").classList.add("hidden");
    }
  } catch {
    // 忽略网络异常
  }
}

$("btn-resume").onclick = async () => {
  if (!resumeMatch) return;
  try {
    const saved = getSavedMatch();
    if (
      resumeMatch.phase === "PLAYING" &&
      saved &&
      saved.roomId === resumeMatch.roomId
    ) {
      // 刷新页面后凭 reconnectionToken 回到原座位
      await net.reconnect();
    } else if (resumeMatch.phase === "WAITING") {
      // 等待期直接重进房间
      await net.joinById(resumeMatch.roomId, playerName());
    } else {
      toast("对局已开始，暂时无法中途加入");
      return;
    }
    $("resume-card").classList.add("hidden");
  } catch (e) {
    toast((e as Error).message || "回到对局失败");
    void refreshHome();
  }
};

// ---------- 排行榜 ----------
async function renderLeaderboard(): Promise<void> {
  let rows: Profile[] = [];
  try {
    rows = await fetchLeaderboard();
  } catch {
    toast("排行榜加载失败，请稍后重试");
  }

  const podium = $("podium");
  const list = $("rank-list");
  const myRankCard = $("my-rank-card");

  if (rows.length === 0) {
    podium.innerHTML = "";
    list.innerHTML = `<div class="rank-empty">还没有排名数据，快去打几局吧</div>`;
    myRankCard.classList.add("hidden");
    return;
  }

  // 领奖台：第 2 名在左，第 1 名居中，第 3 名在右
  const order = [1, 0, 2];
  podium.innerHTML = order
    .map((dataIdx) => {
      const p = rows[dataIdx];
      if (!p) return "";
      const rank = dataIdx + 1;
      const crownColor =
        rank === 1 ? "#f5d76e" : rank === 2 ? "#c9d2cc" : "#c99a6b";
      return `<div class="podium-col rank${rank}">
        <span class="podium-crown">${crownSvg(crownColor)}</span>
        <div class="podium-avatar">${escapeHtml(p.name.charAt(0))}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-score">${fmtScore(p.totalNet)}</div>
        <div class="podium-bar">${rank}</div>
      </div>`;
    })
    .join("");

  const rest = rows.slice(3, 8);
  list.innerHTML =
    rest
      .map((p, i) => {
        const rank = i + 4;
        const isMe = p.deviceId === myProfileId();
        return `<div class="rank-row${isMe ? " me" : ""}">
          <div class="rank-num">${rank}</div>
          <div class="rank-avatar-sm${isMe ? " me" : ""}">${escapeHtml(
            p.name.charAt(0)
          )}</div>
          <div class="rank-info">
            <div class="rank-name">${escapeHtml(p.name)}</div>
            <div class="rank-stats">${p.games} 场 · 胜率 ${winRate(p)}</div>
          </div>
          <div class="rank-score">${fmtScore(p.totalNet)}</div>
        </div>`;
      })
      .join("") || `<div class="rank-empty">更多排名即将放出</div>`;

  // 我的排名
  const myIdx = rows.findIndex((p) => p.deviceId === myProfileId());
  const myRow = myIdx >= 0 ? rows[myIdx] : null;
  if (myRow) {
    myRankCard.classList.remove("hidden");
    $("my-rank-badge").textContent = String(myIdx + 1);
    $("my-rank-avatar").textContent = myRow.name.charAt(0);
    $("my-rank-name").textContent = myRow.name;
    $("my-rank-stats").textContent = `${myRow.games} 场 · 胜率 ${winRate(
      myRow
    )}`;
    $("my-rank-score").textContent = fmtScore(myRow.totalNet);
  } else {
    myRankCard.classList.add("hidden");
  }
}

// ---------- 个人中心 ----------
function fillProfileStats(p: Profile): void {
  $("me-games").textContent = String(p.games);
  $("me-wins").textContent = String(p.wins);
  $("me-winrate").textContent = winRate(p);
  $("me-net").textContent = fmtScore(p.totalNet);
}

async function renderProfile(): Promise<void> {
  $("profile-name").textContent = playerName();

  let profile: Profile | null = null;
  let accountId: string | null = null;
  try {
    const bound = await fetchBoundAccount();
    accountId = bound.accountId;
    profile = bound.profile;
  } catch {
    // 服务不在线时走本地展示
  }
  if (!profile) {
    try {
      profile = await fetchProfile();
    } catch {
      // 忽略
    }
  }
  if (profile) fillProfileStats(profile);

  $("profile-id").textContent = accountId
    ? `正式账号 · ID ${shortId(accountId)}`
    : `游客战绩 · ID ${shortId(deviceId())}`;

  const btn = $("btn-bind");
  const boundState = !!accountId || !!getAccountCreds();
  btn.textContent = boundState ? "已绑定" : "绑定账号";
  btn.classList.toggle("bound", boundState);
}

$("btn-bind").onclick = async () => {
  const btn = $("btn-bind");
  if (btn.classList.contains("bound")) {
    toast("当前设备已绑定账号");
    return;
  }
  btn.textContent = "绑定中…";
  try {
    const { accountId, token } = await createAccount(playerName());
    setAccountCreds({ accountId, token });
    await bindAccount(accountId, token);
    toast("绑定成功，游客战绩已合并");
    await renderProfile();
    void refreshHome();
  } catch (e) {
    toast((e as Error).message || "绑定失败");
    btn.textContent = "绑定账号";
  }
};

$("row-restore").onclick = () =>
  $("account-panel").classList.toggle("hidden");
$("btn-restore-cancel").onclick = () =>
  $("account-panel").classList.add("hidden");
$("btn-restore-confirm").onclick = async () => {
  const id = $<HTMLInputElement>("restore-id").value.trim();
  const token = $<HTMLInputElement>("restore-token").value.trim();
  if (!id || !token) {
    toast("请填写账号 ID 和凭证");
    return;
  }
  try {
    await bindAccount(id, token);
    setAccountCreds({ accountId: id, token });
    toast("账号恢复成功");
    $("account-panel").classList.add("hidden");
    await renderProfile();
    void refreshHome();
  } catch (e) {
    toast((e as Error).message || "恢复失败，请检查账号信息");
  }
};

// 昵称修改
$("btn-edit-name").onclick = () => {
  const row = $("name-edit-row");
  row.classList.toggle("hidden");
  if (!row.classList.contains("hidden")) {
    const input = $<HTMLInputElement>("name-input");
    input.value = playerName();
    input.focus();
  }
};
$("btn-save-name").onclick = () => {
  const v = $<HTMLInputElement>("name-input").value.trim();
  if (!v) {
    toast("昵称不能为空");
    return;
  }
  setPlayerName(v);
  $("profile-name").textContent = playerName();
  $("name-edit-row").classList.add("hidden");
  toast("昵称已保存");
};

// 音效开关（本地偏好，供后续音效实现读取）
const SOUND_KEY = "gdy.sound";
$("switch-sound").classList.toggle(
  "on",
  localStorage.getItem(SOUND_KEY) !== "off"
);
$("switch-sound").onclick = () => {
  const sw = $("switch-sound");
  const on = !sw.classList.contains("on");
  sw.classList.toggle("on", on);
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  toast(on ? "音效已开启" : "音效已关闭");
};

// ---------- 全局导航 ----------
// 大厅三个图标瓦片 → 打开覆盖层
(["btn-rank", "btn-me", "btn-rules"] as const).forEach((id) => {
  const tab = (document.getElementById(id) as HTMLElement)?.dataset
    .tab as OverlayId;
  $(id).onclick = () => openOverlay(tab);
});
// 覆盖层关闭按钮
document.querySelectorAll(".modal-close").forEach((b) => {
  b.addEventListener("click", () => {
    const t = (b as HTMLElement).dataset.close;
    if (t) closeOverlay(t as OverlayId);
  });
});

$("btn-rules-start").onclick = () => closeOverlay("rules");
$("row-rules").onclick = () => openOverlay("rules");
$("row-feedback").onclick = () => toast("反馈渠道即将开放，敬请期待");

// 分享房号
$("btn-share").onclick = () => {
  const code = ($("room-code").textContent ?? "").replace(/\s/g, "");
  if (!code) return;
  const text = `来一起玩干瞪眼！房间号：${code}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast("邀请已复制，发给好友吧"))
      .catch(() => toast(`房间号：${code}`));
  } else {
    toast(`房间号：${code}`);
  }
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
  clearCodeInputs();
  show("lobby");
};

// ---------- 舞台自适应缩放 ----------
function fitStage(): void {
  const stage = document.getElementById("stage");
  if (!stage) return;
  const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720, 1);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener("resize", fitStage);

// ---------- 启动 ----------
fitStage();
show("lobby");
