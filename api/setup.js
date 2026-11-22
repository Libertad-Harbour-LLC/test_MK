// Одноразовая настройка: откройте https://<адрес-проекта>.vercel.app/api/setup в браузере.
import { telegram, webhookSecret, WELCOME } from "../lib/bot.js";

const page = (title, body, ok) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.5">
<h1 style="color:${ok ? "#1a7f37" : "#c62828"}">${title}</h1>${body}</body>`,
    { status: ok ? 200 : 500, headers: { "content-type": "text/html; charset=utf-8" } },
  );

export async function GET(request) {
  const missing = ["TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    return page(
      "Не хватает настроек",
      `<p>В Vercel не заполнены: <b>${missing.join(", ")}</b>.</p>
<p>Добавьте их в Settings → Environment Variables, затем нажмите Redeploy и откройте эту страницу снова.</p>`,
      false,
    );
  }

  const host = request.headers.get("x-forwarded-host") || new URL(request.url).host;
  const url = `https://${host}/api/telegram`;

  const result = await telegram("setWebhook", {
    url,
    secret_token: webhookSecret(),
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  if (!result.ok) {
    return page(
      "Не получилось подключить бота",
      `<p>Telegram ответил: <b>${result.description || "неизвестная ошибка"}</b>.</p>
<p>Чаще всего это значит, что токен бота скопирован с ошибкой. Проверьте TELEGRAM_BOT_TOKEN в настройках Vercel.</p>`,
      false,
    );
  }

  await telegram("setMyCommands", {
    commands: [
      { command: "start", description: "Начать и узнать, что умеет бот" },
      { command: "zapis", description: "Оставить заявку на запись" },
      { command: "contacts", description: "Адреса и телефоны салонов" },
    ],
  });
  await telegram("setMyDescription", { description: WELCOME.slice(0, 512) });
  await telegram("setMyShortDescription", {
    short_description: "Помощник сети салонов красоты «Эпатаж»: услуги, цены, адреса, акции.",
  });
  const me = await telegram("getMe", {});
  const name = me.result?.username;

  return page(
    "Готово! Бот подключён ✅",
    `<p>Telegram будет присылать сообщения на адрес <code>${url}</code>.</p>
${name ? `<p>Откройте бота и напишите ему вопрос: <a href="https://t.me/${name}">t.me/${name}</a></p>` : ""}
${process.env.ADMIN_CHAT_ID
  ? `<p>Заявки на запись будут приходить в чат <b>${process.env.ADMIN_CHAT_ID}</b>.</p>`
  : `<p style="color:#c62828"><b>Заявки пока некуда отправлять.</b> Напишите боту команду /id в чате, куда должны приходить заявки, и вставьте полученный номер в настройку ADMIN_CHAT_ID в Vercel (инструкция, шаг 5).</p>`}
<p>Эту страницу больше открывать не нужно. Если вы поменяете адрес сайта на Vercel, откройте её ещё раз.</p>`,
    true,
  );
}
