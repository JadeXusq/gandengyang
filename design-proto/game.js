/* ============================================
   干瞪眼 · 横屏游戏化原型交互逻辑
   ============================================ */

const $ = (id) => document.getElementById(id);
const stage = $("stage");

/* ---------- 舞台等比缩放 ---------- */
function fitStage() {
  const s = Math.min(window.innerWidth / 860, window.innerHeight / 401);
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
  // 竖屏窄屏时提示横屏
  const hint = document.querySelector(".rotate-hint");
  if (hint) hint.style.display = window.innerHeight > window.innerWidth * 1.15 ? "flex" : "none";
}
window.addEventListener("resize", fitStage);
fitStage();

/* ---------- 牌面渲染 ---------- */
const SUITS = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "小", 17: "大" };
const WEIGHT = { 3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,11:11,12:12,13:13,14:14,15:15,16:16,17:17 };

function rankLabel(r) { return RANK_LABEL[r] || String(r); }
function isRed(s) { return s === "H" || s === "D"; }

function cardInnerHTML(r, s) {
  if (s === "JOKER_S" || s === "JOKER_B") {
    const big = s === "JOKER_B";
    return `<div class="corner"><span class="r">${big ? "大" : "小"}</span><span class="s">王</span></div>
      <span class="big-s">🃏</span>`;
  }
  return `<div class="corner"><span class="r">${rankLabel(r)}</span><span class="s">${SUITS[s]}</span></div>
    <span class="big-s">${SUITS[s]}</span>`;
}

function makeCard(r, s, cls = "") {
  const el = document.createElement("div");
  el.className = `card ${cls}${isRed(s) ? " red" : ""}`;
  el.dataset.r = r;
  el.dataset.s = s;
  el.innerHTML = cardInnerHTML(r, s);
  return el;
}

// 水化静态牌（玩法说明里的演示牌）
document.querySelectorAll(".card[data-r]").forEach((el) => {
  el.innerHTML = cardInnerHTML(Number(el.dataset.r), el.dataset.s);
});

/* ---------- 屏幕导航 ---------- */
const SCREENS = ["scr-lobby", "scr-room", "scr-table", "scr-result"];
function show(id) {
  SCREENS.forEach((s) => $(s).classList.toggle("active", s === id));
}
function toast(msg, ms = 1800) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- Overlay ---------- */
function openOv(id) { $(id).classList.add("show"); }
document.querySelectorAll(".ov-close").forEach((b) =>
  b.addEventListener("click", () => $(b.dataset.close).classList.remove("show"))
);
document.querySelectorAll(".overlay").forEach((ov) =>
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("show"); })
);
$("btn-open-rank").addEventListener("click", () => openOv("ov-rank"));
$("btn-open-me").addEventListener("click", () => openOv("ov-me"));
$("btn-open-rules").addEventListener("click", () => openOv("ov-rules"));
$("me-rules").addEventListener("click", () => { $("ov-me").classList.remove("show"); openOv("ov-rules"); });
$("me-restore").addEventListener("click", () => toast("恢复账号：输入账号 ID 与凭证即可合并战绩"));
$("btn-bind").addEventListener("click", () => toast("已创建游客账号，可在不同设备恢复战绩"));

/* ---------- 大厅 ---------- */
$("btn-quick").addEventListener("click", () => enterRoom());
$("btn-lobby-join").addEventListener("click", () => {
  const v = $("lobby-code").value.replace(/\D/g, "");
  if (v.length !== 6) { toast("请输入 6 位房号"); return; }
  enterRoom(v);
});

/* ---------- 房间 ---------- */
const BOT_NAMES = ["小明", "小红", "阿发"];
let botCount = 0;

function renderRoomSeat(idx, name) {
  const seat = $(`rseat-${idx}`);
  seat.querySelector(".rseat-av").textContent = name.charAt(0);
  seat.querySelector(".rseat-av").classList.remove("empty");
  seat.querySelector("span").textContent = name;
  seat.querySelector("em").textContent = "已准备";
  seat.classList.add("ready");
}

function enterRoom(code) {
  const c = code || "482913";
  $("room-code").textContent = `${c.slice(0, 3)} ${c.slice(3)}`;
  $("hud-code").textContent = c;
  botCount = 0;
  // 复位座位
  for (let i = 1; i <= 3; i++) {
    const seat = $(`rseat-${i}`);
    seat.querySelector(".rseat-av").textContent = "+";
    seat.querySelector(".rseat-av").classList.add("empty");
    seat.querySelector("span").textContent = "空座";
    seat.querySelector("em").textContent = "等待加入";
    seat.classList.remove("ready");
  }
  show("scr-room");
  // 快速开始：机器人陆续入座
  if (!code) {
    [0, 1, 2].forEach((i) => setTimeout(() => {
      botCount++;
      renderRoomSeat(i + 1, BOT_NAMES[i]);
    }, 500 + i * 650));
  }
}

$("btn-room-back").addEventListener("click", () => show("scr-lobby"));
$("btn-add-bot").addEventListener("click", () => {
  if (botCount >= 3) { toast("座位已满"); return; }
  renderRoomSeat(botCount + 1, BOT_NAMES[botCount]);
  botCount++;
});
$("btn-copy").addEventListener("click", () => {
  const code = $("room-code").textContent.replace(/\s/g, "");
  navigator.clipboard?.writeText(code).then(() => toast("房号已复制")).catch(() => toast(`房号：${code}`));
});
$("btn-ready").addEventListener("click", () => startTable());

/* ============================================
   牌桌对战
   ============================================ */
const OPPONENTS = [
  { seat: 1, name: "小明", av: "明", el: "seat-1", play: "play-1", count: 8 },
  { seat: 2, name: "小红", av: "红", el: "seat-2", play: "play-2", count: 5 },
  { seat: 3, name: "阿发", av: "发", el: "seat-3", play: "play-3", count: 9 },
];

let myHand = [];          // [{r,s}]
let selected = new Set(); // 选中的牌索引
let phase = "lead";       // lead | respond
let myTurn = false;
let stockCount = 33;
let bombCount = 0;
let demoStep = 0;
let timers = [];

function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
function clearTimers() { timers.forEach(clearTimeout); timers = []; }

function startTable() {
  clearTimers();
  show("scr-table");
  myHand = [
    { r: 3, s: "S" }, { r: 6, s: "D" }, { r: 7, s: "C" }, { r: 8, s: "H" },
    { r: 8, s: "S" }, { r: 10, s: "D" }, { r: 11, s: "C" }, { r: 13, s: "H" },
  ];
  myHand.sort((a, b) => WEIGHT[a.r] - WEIGHT[b.r]);
  selected.clear();
  phase = "lead"; myTurn = false; demoStep = 0;
  stockCount = 33; bombCount = 0;
  OPPONENTS[0].count = 8; OPPONENTS[1].count = 5; OPPONENTS[2].count = 9;

  $("hud-stock").textContent = stockCount;
  $("hud-bomb").textContent = `炸弹 ×${bombCount}`;
  $("my-report").classList.add("hidden");
  $("my-count").textContent = `${myHand.length} 张`;

  // 我的出牌展示区（动态创建）
  let myPlay = $("my-play");
  if (!myPlay) {
    myPlay = document.createElement("div");
    myPlay.id = "my-play";
    myPlay.className = "play-slot";
    myPlay.style.cssText = "position:absolute;left:50%;bottom:158px;transform:translateX(-50%);z-index:6;min-width:150px;";
    $("scr-table").appendChild(myPlay);
  }
  myPlay.innerHTML = "";

  renderHand();
  renderOpponents();
  clearPlays();
  banner("");
  $("btn-pass").classList.add("hidden");
  $("btn-play").disabled = true;

  // ── 演示脚本 ──
  later(() => oppLead(2, [{ r: 7, s: "S" }]), 900);   // 小红领出单 7
}

/* ---------- 渲染：手牌扇形 ---------- */
function renderHand() {
  const hand = $("hand");
  hand.innerHTML = "";
  const n = myHand.length;
  const step = n <= 1 ? 0 : Math.min(6.5, 46 / (n - 1));
  const start = -((n - 1) * step) / 2;
  myHand.forEach((c, i) => {
    const wrap = document.createElement("div");
    wrap.className = `hand-card${selected.has(i) ? " sel" : ""}`;
    const deg = start + i * step;
    wrap.style.transform = `rotate(${deg}deg) translateY(${selected.has(i) ? -30 : 0}px)`;
    wrap.style.zIndex = selected.has(i) ? 100 + i : i;
    wrap.appendChild(makeCard(c.r, c.s));
    wrap.addEventListener("click", () => toggleCard(i));
    hand.appendChild(wrap);
  });
  $("my-count").textContent = `${myHand.length} 张`;
  if (myHand.length === 1) $("my-report").classList.remove("hidden");
  else $("my-report").classList.add("hidden");
}

function toggleCard(i) {
  if (!myTurn) { toast("还没轮到你出牌"); return; }
  if (selected.has(i)) selected.delete(i);
  else selected.add(i);
  renderHand();
  $("btn-play").disabled = selected.size === 0;
}

/* ---------- 渲染：对手 ---------- */
function renderOpponents() {
  OPPONENTS.forEach((o) => {
    const seat = $(o.el);
    seat.querySelector(".cnt").textContent = `${o.count} 张`;
    seat.classList.toggle("active", o.active);
    seat.classList.toggle("reported", o.count === 1 && !o.finished);
    // 倒计时环
    const ring = seat.querySelector(".ring-fg");
    if (o.active && o.deadline) {
      ring.style.opacity = 1;
      ring.style.strokeDashoffset = 0;
    } else {
      ring.style.opacity = 0;
    }
  });
}

function clearPlays() {
  OPPONENTS.forEach((o) => { $(o.play).innerHTML = ""; o.active = false; o.deadline = 0; });
  renderOpponents();
}

/* ---------- 中央横幅 ---------- */
function banner(text, mine = false) {
  const b = $("table-banner");
  if (!text) { b.classList.remove("show", "mine"); return; }
  b.textContent = text;
  b.classList.add("show");
  b.classList.toggle("mine", mine);
}

/* ---------- 出牌展示 ---------- */
function showPlay(who, cards, isPass = false) {
  const slot = who === "me" ? $("my-play") : $(who.play);
  slot.innerHTML = "";
  if (isPass) {
    const b = document.createElement("div");
    b.className = "pass-bubble";
    b.textContent = "不 出";
    slot.appendChild(b);
    return;
  }
  cards.forEach((c, i) => {
    const el = makeCard(c.r, c.s, "play");
    el.style.animationDelay = `${i * 60}ms`;
    slot.appendChild(el);
  });
}

function clearPlay(who) { $(who.play).innerHTML = ""; }

/* ---------- 回合控制 ---------- */
function setActive(seatIdx) {
  OPPONENTS.forEach((o) => { o.active = o.seat === seatIdx; o.deadline = o.active ? Date.now() + 10000 : 0; });
  renderOpponents();
  if (seatIdx >= 0) startRing(seatIdx);
}

let ringRAF = 0;
function startRing(seatIdx) {
  cancelAnimationFrame(ringRAF);
  const o = OPPONENTS.find((x) => x.seat === seatIdx);
  if (!o) return;
  const ring = $(o.el).querySelector(".ring-fg");
  const tick = () => {
    const left = Math.max(0, o.deadline - Date.now());
    const ratio = left / 10000;
    ring.style.strokeDashoffset = 201 * (1 - ratio);
    if (left > 0 && o.active) ringRAF = requestAnimationFrame(tick);
  };
  tick();
}

function myTurnStart(text, respond) {
  myTurn = true; phase = respond ? "respond" : "lead";
  banner(text, true);
  $("btn-pass").classList.toggle("hidden", !respond);
  $("btn-play").disabled = true;
  // 空闲自动出牌，保证演示继续
  later(() => { if (myTurn) autoPlay(); }, 7000);
}

function oppLead(seatIdx, cards) {
  const o = OPPONENTS.find((x) => x.seat === seatIdx);
  setActive(seatIdx);
  later(() => {
    o.count -= cards.length;
    showPlay(o, cards);
    setActive(-1);
    if (cards.length >= 3 && new Set(cards.map((c) => c.r)).size === 1) {
      bombCount++;
      $("hud-bomb").textContent = `炸弹 ×${bombCount}`;
    }
    renderOpponents();
    later(() => myTurnStart(`轮到你接牌 · 只能出 ${nextRankLabel(cards[0].r)} / 2 / 炸弹`, true), 650);
  }, 900);
}

function nextRankLabel(r) {
  if (r === 14) return "2";
  if (r === 15) return "王炸";
  return rankLabel(r + 1);
}

function oppRespondOrPass(seatIdx, cards) {
  const o = OPPONENTS.find((x) => x.seat === seatIdx);
  setActive(seatIdx);
  later(() => {
    setActive(-1);
    if (!cards) {
      showPlay(o, null, true);
      later(nextAfterPass, 500);
    } else {
      o.count -= cards.length;
      showPlay(o, cards);
      renderOpponents();
      later(nextAfterPass, 700);
    }
  }, 850);
}

function nextAfterPass() {
  // 由演示脚本接管
  demoNext();
}

/* ---------- 玩家操作 ---------- */
$("btn-play").addEventListener("click", () => {
  if (!myTurn || selected.size === 0) return;
  const cards = [...selected].sort((a, b) => WEIGHT[myHand[a].r] - WEIGHT[myHand[b].r]).map((i) => myHand[i]);
  playMine(cards);
});

$("btn-pass").addEventListener("click", () => {
  if (!myTurn || phase !== "respond") return;
  myTurn = false;
  $("btn-pass").classList.add("hidden");
  showPlay("me", null, true);
  banner("等待其他玩家…");
  clearTimers();
  later(demoNext, 600);
});

function playMine(cards) {
  myTurn = false;
  clearTimers();
  selected.clear();
  // 从手牌移除
  cards.forEach((c) => {
    const idx = myHand.findIndex((h) => h.r === c.r && h.s === c.s);
    if (idx >= 0) myHand.splice(idx, 1);
  });
  renderHand();
  showPlay("me", cards);
  $("btn-pass").classList.add("hidden");
  $("btn-play").disabled = true;
  // 炸弹特效
  if (cards.length >= 3 && new Set(cards.map((c) => c.r)).size === 1) {
    bombCount++;
    $("hud-bomb").textContent = `炸弹 ×${bombCount}`;
    bombFX();
  }
  banner("等待其他玩家…");
  later(demoNext, 750);
}

function autoPlay() {
  if (!myTurn) return;
  let pick = [];
  if (phase === "respond") {
    // 演示：自动接 8（若有）
    const idx = myHand.findIndex((c) => c.r === 8);
    if (idx >= 0) pick = [idx];
  }
  if (pick.length === 0) pick = [myHand.length - 1]; // 自由出牌：出最大的
  selected = new Set(pick);
  renderHand();
  later(() => { if (myTurn) $("btn-play").click(); }, 350);
}

/* ---------- 特效 ---------- */
function bombFX() {
  const fx = $("fx");
  const flash = document.createElement("div");
  flash.className = "fx-bomb-flash";
  const text = document.createElement("div");
  text.className = "fx-bomb-text";
  text.textContent = "炸 弹";
  fx.appendChild(flash);
  fx.appendChild(text);
  stage.classList.add("shake");
  setTimeout(() => stage.classList.remove("shake"), 480);
  setTimeout(() => { flash.remove(); text.remove(); }, 900);
}

/* ---------- 演示脚本状态机 ---------- */
function demoNext() {
  demoStep++;
  switch (demoStep) {
    case 1: // 我接完 8 后：小明不出 → 小红不出 → 阿发不出 → 我自由出牌
      banner("等待其他玩家…");
      oppRespondOrPass(1, null);
      later(() => { if (demoStep === 1) { oppRespondOrPass(2, null); later(() => { if (demoStep === 1) { oppRespondOrPass(3, null); later(() => {
        if (demoStep === 1) { $("my-play").innerHTML = ""; clearPlays(); myTurnStart("轮到你出牌 · 自由出牌", false); }
      }, 420); } }, 420); } }, 620);
      break;
    case 2: // 我自由出牌后：小红甩出炸弹（3 张 K）
      banner("等待其他玩家…");
      oppLeadBomb();
      break;
    case 3: // 炸弹后：小明、阿发不出 → 结算
      oppRespondOrPass(1, null);
      later(() => { if (demoStep === 3) { oppRespondOrPass(3, null); later(() => {
        if (demoStep === 3) showResult();
      }, 500); } }, 640);
      break;
    default:
      break;
  }
}

function oppLeadBomb() {
  const o = OPPONENTS[1]; // 小红
  setActive(2);
  later(() => {
    setActive(-1);
    o.count -= 3;
    const cards = [{ r: 13, s: "S" }, { r: 13, s: "H" }, { r: 13, s: "D" }];
    showPlay(o, cards);
    bombCount++;
    $("hud-bomb").textContent = `炸弹 ×${bombCount}`;
    bombFX();
    renderOpponents();
    later(() => { if (demoStep === 2) { banner("炸弹！等待其他玩家…"); } }, 300);
  }, 1000);
}

/* ---------- 结算 ---------- */
function showResult() {
  clearTimers();
  const rows = [
    { no: 1, name: "我", score: 18, me: true, remain: 0 },
    { no: 2, name: "小红", score: -6, remain: 4 },
    { no: 3, name: "阿发", score: -8, remain: 6 },
    { no: 4, name: "小明", score: -4, remain: 3 },
  ];
  $("result-title").textContent = "胜 利";
  $("result-title").classList.remove("lose");
  $("result-score").textContent = "+18";
  $("result-rows").innerHTML = rows
    .map(
      (r) => `<div class="rr${r.me ? " me" : ""}">
      <span class="no g${r.no}">${r.no}</span>
      <span class="nm">${r.name}</span>
      <span class="rm">剩 ${r.remain} 张</span>
      <span class="sc ${r.score > 0 ? "pos" : "neg"}">${r.score > 0 ? "+" : ""}${r.score}</span>
    </div>`
    )
    .join("");
  show("scr-result");
  // 得分飞跃
  const fx = $("fx");
  const fly = document.createElement("div");
  fly.className = "fx-fly";
  fly.textContent = "+18";
  fly.style.left = "50%";
  fly.style.top = "55%";
  fx.appendChild(fly);
  setTimeout(() => fly.remove(), 1100);
}

$("btn-again").addEventListener("click", () => startTable());
$("btn-result-exit").addEventListener("click", () => show("scr-lobby"));
$("btn-table-exit").addEventListener("click", () => { clearTimers(); show("scr-lobby"); });

/* ---------- 排行榜数据（演示） ---------- */
$("rank-body").innerHTML = `
  <div class="rank-podium">
    <div class="rp r2"><div class="av">瓷</div><div class="nm">青花瓷</div><div class="sc">+942</div><div class="bar">2</div></div>
    <div class="rp r1"><div class="av">旋</div><div class="nm">小旋风</div><div class="sc">+1286</div><div class="bar">1</div></div>
    <div class="rp r3"><div class="av">师</div><div class="nm">大魔术师</div><div class="sc">+580</div><div class="bar">3</div></div>
  </div>
  ${[
    ["川妹儿", "+512", "86 场 · 41%"],
    ["老王", "+488", "132 场 · 38%"],
    ["不掉线", "+403", "64 场 · 44%"],
    ["小橘子", "+377", "97 场 · 35%"],
  ].map(([n, s, st], i) => `
    <div class="rank-row">
      <span class="no">${i + 4}</span>
      <span class="av">${n.charAt(0)}</span>
      <span class="nm">${n}</span>
      <span class="st">${st}</span>
      <span class="sc">${s}</span>
    </div>`).join("")}
  <div class="rank-row" style="margin-top:8px;background:rgba(255,217,102,.1);border:1px solid rgba(255,217,102,.3);border-radius:10px">
    <span class="no">12</span><span class="av" style="background:linear-gradient(160deg,#ffe9a3,#c98a1e);color:#3a2a08">我</span>
    <span class="nm">无名客</span><span class="st">128 场 · 36.7%</span><span class="sc">+326</span>
  </div>`;
