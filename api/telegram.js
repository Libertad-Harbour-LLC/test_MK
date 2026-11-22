// Сюда Telegram присылает сообщения клиентов.
import { waitUntil } from "@vercel/functions";
import { handleUpdate, webhookSecret } from "../lib/bot.js";

export async function POST(request) {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await request.json().catch(() => null);
  // Сразу отвечаем Telegram «принято», а ответ клиенту готовим в фоне.
  if (update) waitUntil(handleUpdate(update).catch((e) => console.error(e)));
  return new Response("ok");
}

export function GET() {
  return new Response("Бот работает. Чтобы подключить его к Telegram, откройте /api/setup");
}
