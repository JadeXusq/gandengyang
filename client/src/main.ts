/**
 * 入口：界面切换与出牌交互（DOM 渲染 - 新版 UI）
 */
import { cardFromId, cardWeight, isRed } from "@gdy/shared";
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
      if (
        e.key === "Backspace" &&
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
  const name = localStorage.getItem("gdy.name") ?? "无名客";
  try {
    await net.create(name, maxPlayers);
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
  const name = localStorage.getItem("gdy.name") ?? "无名客";
  net
    .joinByCode(name, code)
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
  $("seat-count").textContent = `${joined} / ${state.maxPlayers} 已加入`;

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
function cardHtml(id: number, selected: boolean): string {
  if (id === 52)
    return `<div class="card-el joker-small${
      selected ? " selected" : ""
    }" data-id="${id}"><span class="rank-sym">小</span></div>`;
  if (id === 53)
    return `<div class="card-el joker-big${
      selected ? " selected" : ""
    }" data-id="${id}"><span class="rank-sym">大</span></div>`;
  const c = cardFromId(id);
  const red = isRed(id);
  const suitSym =
    { S: "♠", H: "♥", D: "♦", C: "♣" }[c.suit as "S" | "H" | "D" | "C"] ?? "";
  const rankSym =
    ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"][
      c.rank - 1
    ] ?? "?";
  const cls = `card-el${red ? " red" : ""}${selected ? " selected" : ""}`;
  return `<div class="${cls}" data-id="${id}"><span class="suit-sym">${suitSym}</span><span class="rank-sym">${rankSym}</span></div>`;
}

function renderHand(): void {
  const el = $("hand");
  const sorted = [...net.hand].sort((a, b) => cardWeight(a) - cardWeight(b));
  el.innerHTML = sorted
    .map((id) => cardHtml(id, selectedCards.has(id)))
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

  // 最后出牌
  const lp = state.lastPlay;
  const lpLabel = $("last-play-label");
  const lpEl = $("last-play");
  if (lp && lp.playType && lp.cards?.length) {
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
  } else {
    lpLabel.innerHTML = "";
    lpEl.innerHTML = `<span style="color:#5a8a6a;font-size:0.9rem">自由出牌</span>`;
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
  const winnerRank = players.findIndex((p) => p.seat === winner.seat) + 1;

  $("result-sub").textContent = `房间 ${
    state.code || ""
  } · 标准规则 · 炸弹加倍`;

  // 赢家卡片
  $("winner-name").textContent = winner.name;
  $("winner-desc").textContent = `出完手牌 · ${winner.remaining} 张剩余`;
  $("winner-score").textContent = `${winner.score > 0 ? "+" : ""}${
    winner.score
  }`;
  $("winner-badge").textContent = `第 ${winnerRank} 名 · 胜`;

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
  clearCodeInputs();
  show("lobby");
};
