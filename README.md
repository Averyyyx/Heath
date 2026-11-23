# Hearth

Hearth is a desktop communication application built with Electron, React, TypeScript, Node.js, Express, Socket.IO, and SQLite.

The current application includes user accounts, friends, direct messages, text and voice channels, notifications, sound preferences, and voice/video communication.

## Development

Requirements: Node.js 22 and npm.

Install dependencies:

```sh
npm ci
npm ci --prefix src/renderer
```

Run the server with `npm run dev`, or start the desktop application with `npm start`.

Build the application with `npm run build:app`. Create the Windows installer with `npm run electron:build`. Run automated checks with `npm test`.

## Documentation

- [Русская версия](README.ru.md)

- [Architecture](docs/architecture.md)
- [Development setup](docs/development.md)
- [Releasing](docs/releasing.md)
- [Developer test account](docs/dev-account.md)
- [Engineering backlog](docs/backlog.md)

---

# Hearth — Русский

Hearth — настольное приложение для общения и совместной работы. Технологический стек: Electron, React, TypeScript, Node.js, Express, Socket.IO и SQLite.

Сейчас приложение включает аккаунты, друзей, личные сообщения, текстовые и голосовые каналы, уведомления, настройки звука, голосовые и видеозвонки.

## Разработка

Требуются Node.js 22 и npm.

Установка зависимостей:

```sh
npm ci
npm ci --prefix src/renderer
```

Запустить сервер: `npm run dev`. Запустить настольное приложение: `npm start`.

Собрать приложение: `npm run build:app`. Создать установщик Windows: `npm run electron:build`. Запустить тесты: `npm test`.

## Документация

- [Архитектура](docs/architecture.md)
- [Настройка разработки](docs/development.md)
- [Сборка релиза](docs/releasing.md)
- [Тестовый аккаунт разработчика](docs/dev-account.md)
- [Технический список задач](docs/backlog.md)
