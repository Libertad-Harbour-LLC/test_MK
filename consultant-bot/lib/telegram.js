// Обёртка над Telegram Bot API с учётом лимитов Telegram (429 + retry_after).
import crypto from "node:crypto";
import { config } from "./config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function tg(method, payload, attempt = 0) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegramToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  if (!data.ok && data.error_code === 429 && attempt < 2) {
    // Telegram просит подождать: ждём столько, сколько он сказал (но не дольше 10 с).
    const wait = Math.min((data.parameters?.retry_after ?? 1) * 1000, 10_000);
    await sleep(wait);
    return tg(method, payload, attempt + 1);
  }
  if (!data.ok) console.error(`Telegram ${method} failed:`, data.description);
  return data;
}

export async function sendText(chatId, text, extra = {}) {
  let last;
  for (let i = 0; i < text.length; i += 4000) {
    const isLast = i + 4000 >= text.length;
    last = await tg("sendMessage", {
      chat_id: chatId,
      text: text.slice(i, i + 4000),
      link_preview_options: { is_disabled: true },
      ...(isLast ? extra : {}),
    });
  }
  return last;
}

// Секрет вебхука выводится из токена бота: отдельная настройка не нужна.
export function webhookSecret() {
  return crypto.createHash("sha256").update("webhook:" + config.telegramToken).digest("hex").slice(0, 48);
}

export const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
