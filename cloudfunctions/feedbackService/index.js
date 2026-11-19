"use strict";
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/** 反馈类型白名单（与客户端 chips 一一对应） */
const TYPES = ["bug", "suggestion", "experience", "balance", "other"];
const TYPE_LABEL = { bug: "BUG/故障", suggestion: "建议", experience: "体验问题", balance: "平衡/数值", other: "其他" };
const CONTENT_MIN = 5;
const CONTENT_MAX = 200;
const CONTACT_MAX = 40;
const DAILY_LIMIT = 1;
const CONTEXT_FIELDS = ["version", "model", "system", "screen", "battleId"];

/** 北京时间的自然日，作为每日额度的口径（与签到一致） */
function dateKey(now) {
  return new Date((now || Date.now()) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function text(value, max) {
  const result = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return max ? result.slice(0, max) : result;
}

/** 只保留约定的上下文字段，且截断，避免玩家塞任意大对象进库 */
function cleanContext(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  CONTEXT_FIELDS.forEach(field => {
    const value = text(source[field], 64);
    if (value) result[field] = value;
  });
  return result;
}

function cleanType(value) {
  const type = text(value, 16);
  if (!TYPES.includes(type)) throw new Error("反馈类型无效");
  return type;
}

function cleanContent(value) {
  const content = String(value == null ? "" : value).replace(/\r\n/g, "\n").trim();
  if (content.length < CONTENT_MIN) throw new Error(`反馈内容至少 ${CONTENT_MIN} 个字`);
  if (content.length > CONTENT_MAX) throw new Error(`反馈内容最多 ${CONTENT_MAX} 个字`);
  return content;
}

function cleanImageFileID(value) {
  const fileID = text(value, 512);
  if (!fileID) return "";
  if (!/^cloud:\/\//.test(fileID)) throw new Error("截图地址无效");
  return fileID;
}

async function submit(openid, event) {
  const type = cleanType(event.type);
  const content = cleanContent(event.content);
  const contact = text(event.contact, CONTACT_MAX);
  const imageFileID = cleanImageFileID(event.imageFileID);
  const context = cleanContext(event.context);
  const key = dateKey();
  const used = await db.collection("feedbacks").where({ userId: openid, dateKey: key }).count();
  if (used.total >= DAILY_LIMIT) throw new Error("今天已经提交过反馈了，明天再来吧");
  const now = Date.now();
  const doc = {
    userId: openid,
    type,
    typeLabel: TYPE_LABEL[type],
    content,
    contact,
    imageFileID,
    context,
    dateKey: key,
    status: "pending",
    deleted: false,
    createdAt: now,
    updatedAt: now
  };
  const added = await db.collection("feedbacks").add({ data: doc });
  return {
    feedback: {
      id: added._id || added.id,
      type,
      typeLabel: TYPE_LABEL[type],
      content,
      contact,
      hasImage: Boolean(imageFileID),
      dateKey: key,
      createdAt: now
    }
  };
}

async function mine(openid, event) {
  const limit = Math.min(30, Math.max(1, Number(event && event.limit) || 20));
  const result = await db.collection("feedbacks")
    .where({ userId: openid, deleted: false })
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  const items = (result.data || []).map(item => ({
    id: item._id || item.id,
    type: item.type,
    typeLabel: TYPE_LABEL[item.type] || TYPE_LABEL.other,
    content: item.content,
    contact: item.contact || "",
    hasImage: Boolean(item.imageFileID),
    dateKey: item.dateKey,
    createdAt: item.createdAt
  }));
  const today = await db.collection("feedbacks").where({ userId: openid, dateKey: dateKey() }).count();
  return { items, submittedToday: today.total >= DAILY_LIMIT };
}

async function remove(openid, event) {
  const id = text(event && event.id, 64);
  if (!id) throw new Error("反馈不存在");
  const result = await db.collection("feedbacks").doc(id).get();
  const doc = result && result.data;
  if (!doc || doc.deleted) throw new Error("反馈不存在");
  if (doc.userId !== openid) throw new Error("只能删除自己的反馈");
  await db.collection("feedbacks").doc(id).update({ data: { deleted: true, updatedAt: Date.now() } });
  return { ok: true, dateKey: doc.dateKey };
}

exports.main = async event => {
  const { OPENID } = cloud.getWXContext();
  const action = text(event && event.action, 16) || "submit";
  if (action === "submit") return submit(OPENID, event || {});
  if (action === "mine") return mine(OPENID, event || {});
  if (action === "remove") return remove(OPENID, event || {});
  throw new Error("反馈操作无效");
};

exports.__test = { TYPES, TYPE_LABEL, dateKey, cleanContext, cleanContent, cleanType, CONTENT_MIN, CONTENT_MAX, DAILY_LIMIT };
