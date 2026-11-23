#!/bin/bash

# Скрипт для развертывания Hearth на сервере

echo "🚀 Начинаем развертывание Hearth..."
CLIENT_ORIGIN=${CLIENT_ORIGIN:-http://localhost:4000}

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Пожалуйста, установите Node.js 22+"
    exit 1
fi

# Проверка Git
if ! command -v git &> /dev/null; then
    echo "❌ Git не установлен. Пожалуйста, установите Git"
    exit 1
fi

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm ci
npm ci --prefix src/renderer

# Сборка приложения
echo "🔨 Сборка приложения..."
npm run build:app

# Создание директорий
echo "📁 Создание директорий..."
mkdir -p data/uploads data/tmp data/avatars

# Настройка переменных окружения
if [ ! -f .env ]; then
    echo "⚙️  Создание .env файла..."
    cat > .env << EOF
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=$CLIENT_ORIGIN
CORS_ORIGIN=$CLIENT_ORIGIN
USE_MEMORY_SESSION=true
SESSION_SECRET=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 32)
EOF
    echo "✅ .env файл создан с секретными ключами"
else
    echo "✅ .env файл уже существует"
fi

# Установка PM2 если не установлен
if ! command -v pm2 &> /dev/null; then
    echo "📦 Установка PM2..."
    npm install -g pm2
fi

# Остановка текущего процесса если есть
echo "🛑 Остановка текущего процесса..."
pm2 stop hearth 2>/dev/null || true
pm2 delete hearth 2>/dev/null || true

# Запуск приложения
echo "🚀 Запуск приложения..."
pm2 start src/server/index.js --name hearth

# Сохранение PM2 конфигурации
pm2 save

# Настройка автозапуска
pm2 startup

echo "✅ Развертывание завершено!"
echo "🌐 Приложение доступно на http://localhost:4000"
echo "📊 Статус: pm2 status"
echo "📝 Логи: pm2 logs hearth"