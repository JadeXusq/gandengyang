/**
 * 节奏参数唯一源头。server 直接引用；client 经 workspace 引用。
 * 单位约定：带 _MS 为毫秒，带 _S 为秒。
 */

/** 人类回合超时（超时后 AI 代打） */
export const TURN_MS = 30_000;
/** AI / 托管出牌「思考」间隔 */
export const AI_DELAY_MS = 2_000;
/** 发牌动画结束后的看牌时间 */
export const LOOK_HAND_MS = 5_000;
/** 断线保留座位 */
export const RECONNECT_MS = 60_000;
/** 昵称最长字数 */
export const NAME_MAX_LEN = 10;

/** 出牌飞向桌面后停顿 */
export const FLY_TARGET_HOLD_MS = 300;
/** 接牌展示停顿 */
export const RESPOND_HOLD_MS = 800;
/** 摸牌飞行 */
export const DRAW_FLY_MS = 250;

export const FLY_TARGET_HOLD_S = FLY_TARGET_HOLD_MS / 1000;
export const RESPOND_HOLD_S = RESPOND_HOLD_MS / 1000;
export const DRAW_FLY_S = DRAW_FLY_MS / 1000;

/** 开局洗牌展示 */
export const DEAL_SHUFFLE_MS = 700;
/** 单张发牌飞行 */
export const DEAL_FLY_MS = 220;
/** 每轮发牌间隔 */
export const DEAL_ROUND_PAUSE_MS = 70;

export const DEAL_SHUFFLE_S = DEAL_SHUFFLE_MS / 1000;
export const DEAL_FLY_S = DEAL_FLY_MS / 1000;
export const DEAL_ROUND_PAUSE_S = DEAL_ROUND_PAUSE_MS / 1000;

/** 开局发牌动画墙钟估算 */
export function dealAnimMs(playerCount: number): number {
  const n = Math.max(2, Math.min(5, playerCount));
  const handSize = n === 1 ? 6 : 5; // 庄家 6，闲家 5
  return (
    DEAL_SHUFFLE_MS +
    handSize * (DEAL_FLY_MS + DEAL_ROUND_PAUSE_MS) +
    DEAL_FLY_MS +
    200
  );
}

/** 发牌动画 + 看牌时间 */
export function dealOpenMs(playerCount: number): number {
  return dealAnimMs(playerCount) + LOOK_HAND_MS;
}

/** 客户端出牌动画总时长估算 */
export function playAnimMs(): number {
  return 300 + FLY_TARGET_HOLD_MS + RESPOND_HOLD_MS;
}
