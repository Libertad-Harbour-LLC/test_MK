// Маршрутизация: команды, кнопки, каталог и диалог с консультантом.
import Anthropic from "@anthropic-ai/sdk";
import { config, LIMITS } from "./config.js";
import { tg, sendText, escapeHtml } from "./telegram.js";
import { firstTimeSeen, allowMessage, getHistory, saveHistory, clearHistory } from "./store.js";
import { coreSection } from "./knowledge.js";
import { rootMenu, nodeView, serviceTitleByKey } from "./catalog.js";
import { converse, compactHistory } from "./assistant.js";

export const BTN = {
  catalog: "📋 Услуги и цены",
  promo: "🎁 Акции",
  contacts: "📍 Адреса",
  book: "📝 Записаться",
};

const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: BTN.catalog }, { text: BTN.book }],
    [{ text: BTN.promo }, { text: BTN.contacts }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Спросите о любой услуге",
};

export const WELCOME =
  "Здравствуйте! Я консультант сети салонов красоты «Эпатаж» 💇‍♀️💅✨\n\n" +
  "Расскажу о любой услуге: как проходит процедура, кому подходит, противопоказания, цены и где её делают. " +
  "Помогу выбрать и оставить заявку на запись.\n\n" +
  "Просто напишите вопрос, например:\n" +
  "• Чем биоревитализация отличается от мезотерапии?\n" +
  "• Сколько стоит окрашивание омбре на длинные волосы?\n" +
  "• Что лучше от морщин без уколов?\n\n" +
  "Или нажмите кнопки внизу. Начать разговор заново — команда /new";

function contactsText() {
  return "Салоны «Эпатаж» — ежедневно с 10:00 до 22:00\n\n" + plain(coreSection("Салоны, адреса, телефоны"));
}
function promoText() {
  return "🎁 Акции и предложения\n\n" + plain(coreSection("Акции")) +
    "\n\nСамые свежие акции — в Telegram-канале: https://t.me/studia_epatage";
}
// Убираем разметку Markdown из текста core.md, чтобы в Telegram было аккуратно.
const plain = (s) => s.replace(/\*\*/g, "").replace(/^\s*- /gm, "• ").replace(/^(\s+)(\S)/gm, "  $2");

const ERROR_TEXT = () =>
  "Извините, сейчас я не могу ответить. Пожалуйста, позвоните в салон:\n\n" + contactsText();

// ---------- заявка администратору ----------
async function deliverBooking(from, booking) {
  if (!config.adminChats.length) {
    console.error("ADMIN_CHAT_ID не задан — заявку некуда отправить", JSON.stringify(booking));
    return false;
  }
  const who = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
  const contact = from?.username
    ? `@${escapeHtml(from.username)}`
    : `<a href="tg://user?id=${from?.id}">${escapeHtml(who || "написать в Telegram")}</a>`;
  const fields = [
    ["Имя", booking.name], ["Телефон", booking.phone], ["Услуга", booking.service],
    ["Салон", booking.salon], ["Когда удобно", booking.preferred_time], ["Пожелания", booking.comment],
  ].filter(([, v]) => v && String(v).trim());
  const text =
    "🔔 <b>Новая заявка из Telegram-бота</b>\n\n" +
    fields.map(([k, v]) => `<b>${k}:</b> ${escapeHtml(String(v).slice(0, 300))}`).join("\n") +
    `\n\n<b>Telegram:</b> ${contact}` +
    `\n<b>Время заявки:</b> ${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (МСК)`;
  let ok = false;
  for (const chat of config.adminChats) {
    const r = await tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML" });
    ok = ok || Boolean(r.ok);
  }
  console.log("booking", ok ? "delivered" : "NOT delivered");
  return ok;
}

// ---------- разговор с консультантом ----------
async function consult(chatId, from, userText) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  try {
    const history = compactHistory(await getHistory(chatId));
    const result = await converse(history, userText.slice(0, LIMITS.maxQuestionChars), (b) =>
      deliverBooking(from, b),
    );
    await saveHistory(chatId, compactHistory(result.history));
    await sendText(chatId, result.reply);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.error("Неверный ключ ANTHROPIC_API_KEY");
    else if (error instanceof Anthropic.RateLimitError) console.error("Превышен лимит запросов к Claude");
    else if (error instanceof Anthropic.APIError) console.error(`Ошибка Claude API ${error.status}:`, error.message);
    else console.error(error);
    await sendText(chatId, ERROR_TEXT(), { reply_markup: MAIN_KEYBOARD });
  }
}

// ---------- обработка сообщений ----------
async function onMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || "").trim();

  // /id — узнать номер чата для заявок (работает и в группах).
  if (/^\/id(@\w+)?$/.test(text)) {
    await sendText(chatId, `Номер этого чата: ${chatId}\n\nВставьте его в настройку ADMIN_CHAT_ID в Vercel, чтобы заявки приходили сюда.`);
    return;
  }
  if (msg.chat.type !== "private") return; // в группах больше ничего не делаем

  const rate = await allowMessage(msg.from?.id ?? chatId);
  if (!rate.ok) {
    if (rate.warn) await sendText(chatId, "Вы отправили слишком много сообщений подряд. Пожалуйста, подождите немного 🙏");
    return;
  }

  if (!text) {
    await sendText(chatId, "Я понимаю только текст. Напишите, пожалуйста, ваш вопрос словами.");
    return;
  }
  if (text.startsWith("/start") || text.startsWith("/help")) {
    await clearHistory(chatId);
    await sendText(chatId, WELCOME, { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (text.startsWith("/new")) {
    await clearHistory(chatId);
    await sendText(chatId, "Начнём сначала. Какой у вас вопрос?", { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (text === BTN.catalog || text.startsWith("/uslugi")) {
    const m = rootMenu();
    await sendText(chatId, m.text, { reply_markup: m.markup });
    return;
  }
  if (text === BTN.contacts || text.startsWith("/contacts")) {
    await sendText(chatId, contactsText(), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (text === BTN.promo || text.startsWith("/akcii")) {
    await sendText(chatId, promoText(), { reply_markup: MAIN_KEYBOARD });
    return;
  }
  if (text === BTN.book || text.startsWith("/zapis")) {
    await consult(chatId, msg.from, "Хочу записаться.");
    return;
  }
  await consult(chatId, msg.from, text);
}

// ---------- нажатия на кнопки каталога ----------
async function onCallback(cq) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data || "";
  await tg("answerCallbackQuery", { callback_query_id: cq.id });
  if (!chatId) return;

  if (data === "root" || data.startsWith("c:")) {
    const view = data === "root" ? rootMenu() : nodeView(data.slice(2));
    // Меняем то же сообщение, а не шлём новое — чат не засоряется.
    const r = await tg("editMessageText", {
      chat_id: chatId,
      message_id: cq.message.message_id,
      text: view.text,
      reply_markup: view.markup,
      link_preview_options: { is_disabled: true },
    });
    if (!r.ok && !String(r.description).includes("not modified")) {
      await sendText(chatId, view.text, { reply_markup: view.markup });
    }
    return;
  }
  if (!(await allowMessage(cq.from?.id ?? chatId)).ok) return;
  const title = serviceTitleByKey(data.slice(2));
  if (data.startsWith("a:") && title) {
    await consult(chatId, cq.from, `Расскажи подробнее про услугу «${title}»: что это, как проходит, кому подходит, противопоказания и цены.`);
  } else if (data.startsWith("b:") && title) {
    await consult(chatId, cq.from, `Хочу записаться на услугу «${title}».`);
  }
}

export async function handleUpdate(update) {
  if (update.update_id !== undefined && !(await firstTimeSeen(update.update_id))) return; // повтор от Telegram
  if (update.message) return onMessage(update.message);
  if (update.callback_query) return onCallback(update.callback_query);
}

export { MAIN_KEYBOARD };
