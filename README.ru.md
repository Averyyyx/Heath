# Hearth — документация

Hearth — настольное приложение для общения и совместной работы. Технологический стек: Electron, React, TypeScript, Node.js, Express, Socket.IO и SQLite.

## Возможности

- Аккаунты и профили пользователей
- Друзья и личные сообщения
- Текстовые и голосовые каналы
- Голосовые и видеозвонки
- Уведомления и настройки звука

## Разработка

Требуются Node.js 22 и npm.

```powershell
npm ci
npm ci --prefix src/renderer
npm test
npm run build:app
npm start
```

Для запуска только сервера используйте `npm run dev`. Для отдельного dev-сервера интерфейса — `npm run dev:client`.

## Документация

- [Архитектура](docs/architecture.md)
- [Настройка разработки](docs/development.md)
- [Сборка релиза](docs/releasing.md)
- [Тестовый аккаунт разработчика](docs/dev-account.md)
- [Технический список задач](docs/backlog.md)
