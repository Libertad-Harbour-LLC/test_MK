// Все настройки бота берутся из Environment Variables в Vercel.
export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  model: process.env.CLAUDE_MODEL || "claude-haiku-5-5",
  adminChats: (process.env.ADMIN_CHAT_ID || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
  // Upstash Redis (Vercel → Storage). Поддерживаем оба варианта названий переменных.
  redisUrl: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  redisToken: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "",
};

export const LIMITS = {
  maxQuestionChars: 1500,
  historyTurns: 12, // сколько последних реплик помнит бот
  historyTtlSec: 6 * 60 * 60, // диалог забывается через 6 часов тишины
  perMinute: 8, // защита от флуда: сообщений в минуту от одного человека
  perDay: 150, // и в сутки
  toolRounds: 4, // сколько раз за ответ бот может заглянуть в описания услуг
};

export const POLICY_URL = "https://studia-epatage.ru/private-policy/";
