// База знаний: основная информация (core.md), прайс (prices.md) и каталог услуг (services.json).
// Файлы читаются один раз при старте функции и дальше берутся из памяти.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "knowledge");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

let cache;
function load() {
  if (cache) return cache;
  const core = read("core.md");
  const prices = read("prices.md");
  const services = JSON.parse(read("services.json")).map((s, i) => ({ ...s, id: `s${i}` }));
  const byId = new Map(services.map((s) => [s.id, s]));
  cache = { core, prices, services, byId };
  return cache;
}

const SALON_NAMES = {
  savitskogo: "ул. Маршала Савицкого, 8",
  lazareva: "ул. Адмирала Лазарева, 55",
  partizanskaya: "Центр косметологии, ул. Партизанская, 24",
};
export const salonNames = (codes = []) => codes.map((c) => SALON_NAMES[c] || c);

export const services = () => load().services;
export const serviceById = (id) => load().byId.get(id);

// Раздел core.md по заголовку «## …» — для кнопок «Адреса» и «Акции».
export function coreSection(title) {
  const core = load().core;
  const start = core.indexOf(`## ${title}`);
  if (start < 0) return "";
  const rest = core.slice(start).split("\n").slice(1).join("\n");
  return rest.split(/\n## /)[0].trim();
}

// Текст для Claude: правила + основная информация + прайс + оглавление каталога.
// Он одинаков для всех запросов, поэтому кэшируется на стороне Claude.
export function knowledgeForModel() {
  const { core, prices, services } = load();
  const index = services
    .map((s) => `${s.id} | ${s.title} | ${s.path} | салоны: ${salonNames(s.salons).join("; ") || "уточнить"}`)
    .join("\n");
  return (
    `${core}\n\n${prices}\n\n` +
    "# Каталог страниц услуг (id | название | раздел сайта | где делают)\n" +
    "Подробные описания (как проходит, показания, противопоказания, результат, цены на странице) " +
    "получай инструментом get_service_details по id.\n" +
    index
  );
}

export function serviceDetailsForModel(id) {
  const s = serviceById(id);
  if (!s) return `Услуга ${id} не найдена.`;
  return (
    `# ${s.title}\nСтраница: ${s.url}\n` +
    `Где делают: ${salonNames(s.salons).join("; ") || "уточнить у администратора"}\n` +
    (s.prices.length ? `Цены на странице услуги:\n- ${s.prices.join("\n- ")}\n` : "") +
    `\nОписание с сайта:\n${s.details}`
  );
}
