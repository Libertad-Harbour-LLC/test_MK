// Память бота: история диалога, защита от флуда и от повторной обработки.
// Основное хранилище — Upstash Redis (переживает перезапуски, общее для всех копий функции).
// Если Redis не подключён, бот работает на памяти процесса: всё работает,
// но память диалога может теряться при перезапуске функции.
import { Redis } from "@upstash/redis";
import { config, LIMITS } from "./config.js";

const redis = config.redisUrl && config.redisToken
  ? new Redis({ url: config.redisUrl, token: config.redisToken })
  : null;

export const storeKind = redis ? "redis" : "memory";

// ---------- запасной вариант: память процесса ----------
const mem = new Map();
function memGet(key) {
  const e = mem.get(key);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { mem.delete(key); return null; }
  return e.val;
}
function memSet(key, val, ttlSec) {
  if (mem.size > 5000) mem.clear(); // простая защита от разрастания
  mem.set(key, { val, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
}

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { console.error("Redis error:", e.message); return fallback(); }
}

// ---------- дубли: Telegram повторяет запрос, если не дождался ответа ----------
export async function firstTimeSeen(updateId) {
  const key = `upd:${updateId}`;
  if (!redis) {
    if (memGet(key)) return false;
    memSet(key, 1, 3600);
    return true;
  }
  return safe(async () => (await redis.set(key, 1, { nx: true, ex: 3600 })) === "OK", () => true);
}

// ---------- защита от флуда ----------
export async function allowMessage(userId) {
  const minuteKey = `rl:m:${userId}:${Math.floor(Date.now() / 60000)}`;
  const dayKey = `rl:d:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const bump = async (key, ttl) => {
    if (!redis) {
      const v = (memGet(key) || 0) + 1;
      memSet(key, v, ttl);
      return v;
    }
    return safe(async () => {
      const v = await redis.incr(key);
      if (v === 1) await redis.expire(key, ttl);
      return v;
    }, () => 0);
  };
  const perMin = await bump(minuteKey, 70);
  const perDay = await bump(dayKey, 26 * 3600);
  const ok = perMin <= LIMITS.perMinute && perDay <= LIMITS.perDay;
  // Предупреждаем один раз, на остальные сообщения сверх лимита молчим.
  const warn = !ok && (perMin === LIMITS.perMinute + 1 || perDay === LIMITS.perDay + 1);
  return { ok, warn };
}

// ---------- история диалога ----------
export async function getHistory(chatId) {
  const key = `hist:${chatId}`;
  if (!redis) return memGet(key) || [];
  return safe(async () => (await redis.get(key)) || [], () => []);
}

export async function saveHistory(chatId, history) {
  const key = `hist:${chatId}`;
  const trimmed = history.slice(-LIMITS.historyTurns * 2);
  // История должна начинаться с реплики клиента.
  while (trimmed.length && trimmed[0].role !== "user") trimmed.shift();
  if (!redis) return memSet(key, trimmed, LIMITS.historyTtlSec);
  return safe(() => redis.set(key, trimmed, { ex: LIMITS.historyTtlSec }), () => null);
}

export async function clearHistory(chatId) {
  const key = `hist:${chatId}`;
  if (!redis) return mem.delete(key);
  return safe(() => redis.del(key), () => null);
}

export async function pingStore() {
  if (!redis) return "memory";
  return safe(async () => ((await redis.ping()) === "PONG" ? "redis" : "redis-error"), () => "redis-error");
}
