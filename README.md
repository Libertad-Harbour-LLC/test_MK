# Telegram-бот салонов красоты «Эпатаж»

Бот отвечает клиентам на вопросы об услугах, ценах, адресах и акциях сети салонов «Эпатаж» (studia-epatage.ru). Он работает на Vercel и Claude API.

- **Как запустить** (без технических знаний): [ИНСТРУКЦИЯ.md](ИНСТРУКЦИЯ.md)
- **Что знает бот** (редактируемый текст): [knowledge/epatage.md](knowledge/epatage.md)
- **Проект бота** (цели, метрики, риски): [docs/chatbot-design.md](docs/chatbot-design.md)

## Устройство
| Файл | Назначение |
|---|---|
| `api/telegram.js` | Принимает сообщения от Telegram (webhook), проверяет секрет |
| `api/setup.js` | Одноразовое подключение webhook: откройте `/api/setup` |
| `lib/bot.js` | Правила ответа, запрос к Claude с кэшируемой базой знаний |
| `knowledge/epatage.md` | База знаний, собранная с сайта |

Настройки окружения: `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, необязательно `CLAUDE_MODEL` (по умолчанию `claude-opus-5-5`).
