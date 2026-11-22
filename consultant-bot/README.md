# Бот-консультант сети салонов «Эпатаж»

Telegram-бот, который консультирует по всем 162 услугам сайта studia-epatage.ru (описание, показания, противопоказания, цены, салоны), помнит диалог, показывает каталог кнопками и принимает заявки на запись. Работает на Vercel и Claude Haiku 5.5, память — Upstash Redis.

- Запуск без технических знаний: [ИНСТРУКЦИЯ.md](ИНСТРУКЦИЯ.md)
- План бота (цели, архитектура, метрики, риски): [docs/chatbot-design.md](docs/chatbot-design.md)

## Устройство
| Файл | Назначение |
|---|---|
| `api/telegram.js` | Вебхук Telegram: проверка секрета, мгновенный ответ, обработка в фоне (`waitUntil`) |
| `api/setup.js` | Подключение вебхука и страница самопроверки настроек |
| `lib/bot.js` | Команды, кнопки, каталог, отправка заявок администраторам |
| `lib/assistant.js` | Claude: правила, кэшируемая база знаний, инструменты `get_service_details` и `submit_booking` |
| `lib/catalog.js` | Каталог услуг кнопками (без ИИ) |
| `lib/store.js` | Upstash Redis: история диалога, лимиты, фильтр повторов (с запасным вариантом в памяти) |
| `lib/knowledge.js` | Загрузка базы знаний |
| `knowledge/core.md` | Контакты, акции, общая информация — редактируется вручную |
| `knowledge/prices.md`, `knowledge/services.json` | Прайс и каталог услуг — собираются скриптом |
| `tools/build_knowledge.py` | Пересборка базы с сайта: `python3 tools/build_knowledge.py` (нужен `beautifulsoup4`) |

## Настройки (Vercel → Environment Variables)
| Переменная | Обязательна | Назначение |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | да | токен от @BotFather |
| `ANTHROPIC_API_KEY` | да | ключ Claude |
| `ADMIN_CHAT_ID` | для заявок | чат(ы) для заявок, через запятую; узнать командой `/id` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | рекомендуется | добавляются автоматически при подключении Upstash Redis в Vercel Storage (также поддерживаются `UPSTASH_REDIS_REST_URL/TOKEN`) |
| `CLAUDE_MODEL` | нет | по умолчанию `claude-haiku-5-5` |

В Vercel при импорте укажите **Root Directory = `consultant-bot`**.
