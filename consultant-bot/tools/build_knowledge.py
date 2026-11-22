#!/usr/bin/env python3
"""Собирает базу знаний бота с сайта studia-epatage.ru.

Запуск (нужен Python 3 и пакет beautifulsoup4):
    python3 tools/build_knowledge.py
Результат: knowledge/services.json (каталог услуг с описаниями и ценами)
и knowledge/prices.md (полный прайс). Файл knowledge/core.md (контакты, акции)
ведётся вручную.
"""
import json, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from bs4 import BeautifulSoup

SITE = "https://studia-epatage.ru"
OUT = Path(__file__).resolve().parent.parent / "knowledge"
UA = {"User-Agent": "Mozilla/5.0 (compatible; EpatageBotKnowledge/1.0)"}
SALONS = {
    "ул. Маршала Савицкого, д. 8": "savitskogo",
    "ул. Адмирала Лазарева, д. 55": "lazareva",
    "ул. Партизанская, д. 24": "partizanskaya",
}

def get(url):
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
        except Exception as e:
            err = e
            time.sleep(2 * (attempt + 1))
    print("FAILED", url, err, file=sys.stderr)
    return ""

def clean_lines(node):
    lines = [l.strip() for l in node.get_text("\n").split("\n")]
    return [l for l in lines if l]

# ---------- прайс ----------
def parse_prices(html):
    s = BeautifulSoup(html, "html.parser")
    pl = s.find(id="pricelist")
    md, by_url = [], {}

    def vals(node):
        v = []
        for o in node.find_all("option"):
            p = o.get("data-price") or ""
            if p.isdigit() and int(p): v.append(int(p))
        if not v:
            b = node.find("button", class_="add_to_right")
            p = (b.get("data-price") or "") if b else ""
            if p.isdigit() and int(p): v.append(int(p))
        return v

    def fmt(v):
        if not v: return "цена на сайте не указана"
        lo, hi = min(v), max(v)
        return f"{lo} ₽" if lo == hi else f"от {lo} до {hi} ₽ (зависит от категории мастера)"

    def name_link(row):
        n = row.find("div", class_="name", recursive=False)
        if not n: return "", None
        a = n.find("a")
        href = a.get("href") if a else None
        if href and href.startswith(SITE): href = href.rstrip("/") + "/"
        else: href = None
        return n.get_text(" ", strip=True), href

    section = ""
    for el in pl.find_all("div", recursive=False):
        cls = el.get("class") or []
        if "block_title" in cls:
            section = el.get_text(" ", strip=True)
            md.append(f"\n## {section}")
        elif "item" in cls:
            t = el.find("div", class_="title")
            group = t.get_text(" ", strip=True) if t else ""
            md.append(f"### {group}")
            lst = el.find("div", class_="list")
            for row in (lst.find_all("div", attrs={"data-chunk": True}, recursive=False) if lst else []):
                name, href = name_link(row)
                sub = row.find("div", class_="sub_list")
                lines = []
                if sub:
                    md.append(f"- {name}:")
                    for r2 in sub.find_all("div", attrs={"data-chunk": True}, recursive=False):
                        n2, _ = name_link(r2)
                        line = f"{name} — {n2}: {fmt(vals(r2))}"
                        md.append(f"  - {n2}: {fmt(vals(r2))}")
                        lines.append(line)
                else:
                    line = f"{name}: {fmt(vals(row))}"
                    md.append(f"- {line}")
                    lines.append(line)
                if href:
                    by_url.setdefault(href, []).extend(lines)
    return "\n".join(md).strip() + "\n", by_url

# ---------- страницы услуг ----------
def parse_service(url, html):
    s = BeautifulSoup(html, "html.parser")
    for t in s(["script", "style", "noscript", "svg", "header", "footer", "nav", "form"]): t.decompose()
    h1 = s.find("h1")
    title = h1.get_text(" ", strip=True) if h1 else ""
    text = "\n".join(clean_lines(s.body or s))
    m = re.search(r"выберите подходящий для вас салон\n(.*?)\nЦены на услуги", text, re.S)
    salons = [v for k, v in SALONS.items() if m and k in m.group(1)]
    body = text.split("Ваш браузер устарел")[0]
    src = body.find("Источник фото")
    k = body.rfind("\n" + title + "\n", 0, src if src > 0 else len(body))
    desc = body[k + len(title) + 2:] if k >= 0 else ""
    desc = desc.replace("Источник фото: stock.adobe.com", "").replace("Источник фото: freepik.com", "")
    desc = re.sub(r"Источник фото:[^\n]*\n", "", desc)
    desc = re.sub(r"Сейчас эту услугу смотрят.*", "", desc)
    # убираем подписи вкладок и короткий мусор
    tabs = {"Как проходит процедура", "Показания, противопоказания", "После процедуры", "Преимущества",
            "Результат", "Техника проведения", "Информация", "Противопоказания", "Показания"}
    lines = [l for l in desc.split("\n") if l not in tabs]
    lines = [l for l in lines if not re.fullmatch(r"(Записаться|Подробнее|Показать ещ[её]|\d+)", l)]
    full = "\n".join(lines).strip()
    for stop in ("Наши салоны\nСалон красоты", "Остальные акции", "\nНаши работы\n", "ОТЗЫВЫ НАШИХ ЛЮБИМЫХ КЛИЕНТОВ", "\nнаши акции\n", "\nСпециалисты зала\n"):
        full = full.split(stop)[0]
    full = re.sub(r"\nСвернуть\n", "\n", "\n" + full + "\n").strip()
    paras = [l for l in full.split("\n") if len(l) > 60]
    short = " ".join(paras)[:420].rsplit(" ", 1)[0] + ("…" if len(" ".join(paras)) > 420 else "")
    return {"url": url, "title": title, "salons": salons, "short": short,
            "details": full[:9000], "page_prices": page_prices(text)}

MASTER_LABELS = {"PRO-мастер", "TOP-мастер", "Мастер", "Косметолог", "от", "Топ-мастер"}

def page_prices(text):
    """Цены из блока «Цены на услуги в студии по …» на странице услуги (по всем салонам)."""
    found = {}
    for block in text.split("Цены на услуги в студии по ")[1:]:
        block = block.split("\nЗапись в студию")[0]
        lines = block.split("\n")[1:]
        chunk = []
        for line in lines:
            if line == "Записаться":
                price = None; name = None
                for l in reversed(chunk):
                    m = re.fullmatch(r"(?:от\s*)?(\d[\d\s]*)\s*Р\.?", l)
                    if m and price is None:
                        v = int(m.group(1).replace(" ", ""))
                        price = v if v else None
                    elif l not in MASTER_LABELS and not re.fullmatch(r"(?:от\s*)?\d[\d\s]*\s*Р\.?|Р\.", l):
                        name = l; break
                if name and price: found.setdefault(name, set()).add(price)
                chunk = []
            elif line.startswith("Цены на услуги"):
                break
            else:
                chunk.append(line)
            if len(chunk) > 12: chunk = chunk[-12:]
    out = []
    for name, vals in found.items():
        lo, hi = min(vals), max(vals)
        out.append(f"{name}: {lo} ₽" if lo == hi else f"{name}: от {lo} до {hi} ₽ (зависит от салона/мастера)")
    return out

def main():
    sm = get(SITE + "/sitemap.xml")
    urls = sorted(set(re.findall(r"<loc>([^<]+)</loc>", sm)))
    svc = [u for u in urls if "/services/" in u and "/salonyi/" not in u and u.rstrip("/") != SITE + "/services"]
    print(len(svc), "service pages", file=sys.stderr)
    prices_md, prices_by_url = parse_prices(get(SITE + "/prices/"))
    with ThreadPoolExecutor(4) as ex:
        pages = list(ex.map(lambda u: (u, get(u)), svc))
    services = []
    for u, html in pages:
        if not html: continue
        rec = parse_service(u, html)
        if not rec["title"]: continue
        path = u.split("/services/")[1].strip("/")
        rec["path"] = path
        rec["prices"] = rec.pop("page_prices") or prices_by_url.get(u.rstrip("/") + "/", [])
        services.append(rec)
    services.sort(key=lambda r: r["path"])
    (OUT / "services.json").write_text(json.dumps(services, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "prices.md").write_text(
        "# Прайс-лист с сайта studia-epatage.ru/prices/\n"
        "Цены «от». Если цен несколько, они зависят от категории мастера (Мастер, PRO-мастер, TOP-мастер).\n"
        "«Не является публичной офертой. Конечная стоимость может отличаться». Точную цену называет администратор.\n"
        + prices_md, encoding="utf-8")
    print(f"services: {len(services)}, with prices: {sum(1 for s in services if s['prices'])}", file=sys.stderr)

if __name__ == "__main__":
    main()
