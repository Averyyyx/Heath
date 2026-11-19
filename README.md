# 🚀 Nexo — Next-Generation Open-Source Desktop Communication Platform

Nexo is a high-performance, modular desktop application designed as a modern, customizable alternative to Discord. Built with a robust full-stack architecture using **React, TypeScript, Node.js, and Electron**, Nexo provides seamless workspace synchronization, sub-120ms rendering latency, and native desktop window management.

## 🖼️ Interface Architecture Preview
Nexo 0.0.5 uses a Discord-inspired three-zone workspace: server rail, contextual navigation, and a central conversation area. The interface includes friends, direct messages, channels, notification counters, sound preferences, and animated call prompts.

## 🛠️ Key Technical Specifications
* **Electron Core Integration:** Desktop-native performance utilizing optimized Chromium window management and secure IPC (Inter-Process Communication) layers.
* **Full-Stack Isolation:** Clean architectural split between the front-end client layer and the Node.js back-end infrastructure for scalable production.
* **Localization Ready:** Embedded `locales` subsystem built from the ground up for seamless multi-language distribution.
* **Advanced Automation:** Pre-configured test server routines (`test_server.js`) and logging mechanisms for granular debugging.

## 🤖 Future AI Roadmap
We are actively developing **Nexo AI Agents** driven by dedicated LLM APIs to facilitate:
1. Automated cross-channel moderation and workspace data indexing.
2. Context-aware developer co-pilot subroutines integrated directly into the chat view.


## Известные ограничения Nexo 0.0.5 Alpha

- Windows-установщик пока не подписан сертификатом издателя, поэтому Windows SmartScreen может показывать предупреждение.
- Голосовые каналы пространств пока отображаются как «Скоро»; полноценное подключение к ним ещё не реализовано.
- Восстановление пароля по email недоступно до подключения почтового провайдера.
- Удаление аккаунта и изменение email не включены: связанные операции пока нельзя безопасно выполнить для всех данных пользователя.
- Автообновление работает через Windows NSIS-установщик и проверяет SHA-256 перед запуском; дифференциальные обновления пока не используются.
