// Одноразовая настройка: откройте https://<адрес-проекта>.vercel.app/api/setup в браузере.
// Подключает бота к Telegram и показывает, всё ли настроено.
import { config } from "../lib/config.js";
import { tg, webhookSecret } from "../lib/telegram.js";
import { pingStore } from "../lib/store.js";
import { WELCOME } from "../lib/bot.js";

const row = (ok, title, hint) =>
  `<li style="margin:8px 0">${ok === true ? "✅" : ok === false ? "❌" : "⚠️"} <b>${title}</b>${hint ? `<br><span style="color:#555">${hint}</span>` : ""}</li>`;

export async function GET(request) {
  const items = [];
  if (!config.telegramToken) {
    items.push(row(false, "Нет токена Telegram", "Добавьте TELEGRAM_BOT_TOKEN в Settings → Environment Variables и сделайте Redeploy."));
  }
  items.push(process.env.ANTHROPIC_API_KEY
    ? row(true, "Ключ Claude добавлен")
    : row(false, "Нет ключа Claude", "Добавьте ANTHROPIC_API_KEY в Settings → Environment Variables и сделайте Redeploy."));

  let botLink = "";
  if (config.telegramToken) {
    const host = request.headers.get("x-forwarded-host") || new URL(request.url).host;
    const url = `https://${host}/api/telegram`;
    const r = await tg("setWebhook", {
      url,
      secret_token: webhookSecret(),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
      max_connections: 40,
    });
    if (r.ok) {
      await tg("setMyCommands", {
        commands: [
          { command: "start", description: "Начать" },
          { command: "uslugi", description: "Услуги и цены" },
          { command: "zapis", description: "Записаться" },
          { command: "akcii", description: "Акции" },
          { command: "contacts", description: "Адреса и телефоны" },
          { command: "new", description: "Начать разговор заново" },
        ],
      });
      await tg("setMyDescription", { description: WELCOME.slice(0, 512) });
      await tg("setMyShortDescription", {
        short_description: "Консультант сети салонов красоты «Эпатаж»: услуги, цены, акции, запись.",
      });
      const me = await tg("getMe", {});
      if (me.result?.username) botLink = `https://t.me/${me.result.username}`;
      items.unshift(row(true, "Бот подключён к Telegram", botLink ? `Откройте бота: <a href="${botLink}">${botLink}</a>` : ""));
    } else {
      items.unshift(row(false, "Не получилось подключить бота", `Telegram ответил: ${r.description}. Проверьте TELEGRAM_BOT_TOKEN.`));
    }
  }

  const store = await pingStore();
  items.push(store === "redis"
    ? row(true, "Память подключена (Upstash Redis)", "Бот помнит диалог и защищён от флуда.")
    : store === "redis-error"
      ? row(false, "Память (Redis) не отвечает", "Проверьте подключение Upstash Redis в разделе Storage.")
      : row(null, "Память не подключена", "Бот работает, но может забывать начало разговора. Рекомендуется подключить Upstash Redis (инструкция, шаг 5)."));
  items.push(config.adminChats.length
    ? row(true, `Заявки приходят в чат ${config.adminChats.join(", ")}`)
    : row(null, "Заявки пока некуда отправлять", "Напишите боту /id в нужном чате и вставьте номер в ADMIN_CHAT_ID (инструкция, шаг 6)."));
  items.push(row(true, `Модель: ${config.model}`));

  const allOk = !items.some((i) => i.includes("❌"));
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Настройка бота</title>
<body style="font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.5">
<h1 style="color:${allOk ? "#1a7f37" : "#c62828"}">${allOk ? "Бот работает ✅" : "Нужно доделать настройку"}</h1>
<ul style="list-style:none;padding:0">${items.join("")}</ul>
<p style="color:#555">Эту страницу можно открывать в любой момент, чтобы проверить состояние бота.</p></body>`,
    { status: allOk ? 200 : 500, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
