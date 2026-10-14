/**
 * Colyseus 房间状态（客户端可见的公共信息）
 * 手牌属于私密信息，不放入 state，单独通过 client.send('hand') 下发。
 */
import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export type RoomPhase = "WAITING" | "PLAYING" | "ROUND_OVER";

export class PlayerSchema extends Schema {
  @type("string") sessionId = "";
  @type("string") name = "";
  @type("number") seat = 0;
  @type("boolean") isAi = false;
  @type("boolean") connected = true;
  @type("boolean") ready = false;
  /** 剩余手牌数（公开） */
  @type("number") handCount = 0;
  /** 是否已出完 */
  @type("boolean") finished = false;
  /** 完成名次（0=未出完） */
  @type("number") finishRank = 0;
  /** 是否已报单 */
  @type("boolean") reported = false;
  /** 本局输赢分 */
  @type("number") score = 0;
  /** 跨局累计净分 */
  @type("number") totalNet = 0;
}

export class LastPlaySchema extends Schema {
  @type("string") playType = "";
  @type(["number"]) cards = new ArraySchema<number>();
  @type("number") startWeight = 0;
  @type("number") length = 0;
  @type("number") playerSeat = -1;
}

export class RoomState extends Schema {
  @type("string") phase: RoomPhase = "WAITING";
  @type("string") code = "";
  @type("string") hostSessionId = "";
  @type("number") maxPlayers = 4;
  /** 游戏引擎阶段 */
  @type("string") gamePhase = "";
  @type("number") currentSeat = -1;
  @type("number") stockCount = 0;
  @type("number") bombCount = 0;
  /** 最后有效出牌 */
  @type(LastPlaySchema) lastPlay = new LastPlaySchema();
  /** 当前回合截止时间戳（毫秒） */
  @type("number") turnDeadline = 0;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
}
