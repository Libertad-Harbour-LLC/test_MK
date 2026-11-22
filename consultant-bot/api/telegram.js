// Сюда Telegram присылает сообщения. Сразу отвечаем «принято», а работу делаем в фоне
// (waitUntil) — так Telegram не ждёт и не шлёт повторы.
import { waitUntil } from "@vercel/functions";
import { webhookSecret } from "../lib/telegram.js";
import { handleUpdate } from "../lib/bot.js";

export async function POST(request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (update) waitUntil(handleUpdate(update).catch((e) => console.error("update failed", e)));
  return new Response("ok");
}

export function GET() {
  return new Response("Бот работает. Чтобы подключить его к Telegram, откройте /api/setup");
}
