// Каталог услуг кнопками: разделы → подразделы → карточка услуги. Работает без ИИ — мгновенно и бесплатно.
import { services, salonNames } from "./knowledge.js";

const TOP = [
  ["parikmaxerskij-zal", "💇‍♀️ Парикмахерский зал"],
  ["nogtevoj-servis", "💅 Ногтевой сервис"],
  ["kosmetologiya", "✨ Косметология"],
  ["studiya-zagara", "☀️ Студия загара"],
];

let tree;
function build() {
  if (tree) return tree;
  const nodes = new Map(); // path -> { path, title, service, children:Set }
  const node = (p) => {
    if (!nodes.has(p)) nodes.set(p, { path: p, title: "", service: null, children: new Set() });
    return nodes.get(p);
  };
  for (const s of services()) {
    const parts = s.path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join("/");
      const n = node(p);
      if (i > 1) node(parts.slice(0, i - 1).join("/")).children.add(p);
      if (i === parts.length) { n.service = s; n.title = s.title; }
    }
  }
  for (const [p, t] of TOP) if (nodes.has(p)) nodes.get(p).title = t;
  const list = [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
  list.forEach((n, i) => {
    n.key = String(i);
    if (!n.title) n.title = n.path.split("/").pop().replace(/-/g, " ");
  });
  tree = { byPath: nodes, byKey: new Map(list.map((n) => [n.key, n])) };
  return tree;
}

const parentPath = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

export function rootMenu() {
  const t = build();
  const rows = TOP.filter(([p]) => t.byPath.has(p)).map(([p, title]) => [
    { text: title, callback_data: `c:${t.byPath.get(p).key}` },
  ]);
  return {
    text: "Выберите раздел — покажу услуги, описание и цены 👇",
    markup: { inline_keyboard: rows },
  };
}

export function nodeView(key) {
  const t = build();
  const n = t.byKey.get(key);
  if (!n) return rootMenu();
  const back = parentPath(n.path);
  const backBtn = back
    ? { text: "⬅️ Назад", callback_data: `c:${t.byPath.get(back).key}` }
    : { text: "⬅️ Все разделы", callback_data: "root" };
  const children = [...n.children].map((p) => t.byPath.get(p)).sort((a, b) => a.title.localeCompare(b.title, "ru"));

  let text;
  const rows = [];
  if (n.service) {
    const s = n.service;
    const prices = s.prices.slice(0, 15);
    text =
      `${s.title}\n\n${s.short}\n\n` +
      (prices.length ? `Цены:\n• ${prices.join("\n• ")}${s.prices.length > 15 ? "\n• …полный список на сайте" : ""}\n` +
        "Цены «от», точную стоимость подтвердит администратор.\n\n" : "") +
      (s.salons.length ? `Где делают: ${salonNames(s.salons).join("; ")}\n` : "") +
      `Подробнее на сайте: ${s.url}`;
    rows.push([
      { text: "💬 Расскажи подробнее", callback_data: `a:${n.key}` },
      { text: "📝 Записаться", callback_data: `b:${n.key}` },
    ]);
  } else {
    text = `${n.title.replace(/^\S+\s/, "")}: выберите услугу`;
  }
  for (const c of children) rows.push([{ text: c.title.slice(0, 60), callback_data: `c:${c.key}` }]);
  rows.push([backBtn]);
  if (text.length > 4000) text = text.slice(0, 3990) + "…";
  return { text, markup: { inline_keyboard: rows } };
}

export function serviceTitleByKey(key) {
  const n = build().byKey.get(key);
  return n?.service?.title || n?.title || "";
}
