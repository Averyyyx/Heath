FROM node:18-alpine

# Установка зависимостей для better-sqlite3
RUN apk add --no-cache python3 make g++

# Рабочая директория
WORKDIR /app

# Копирование package files и зависимостей клиента
COPY package*.json ./
COPY client/package*.json ./client/

# Установка серверных и клиентских зависимостей
RUN npm ci --only=production
RUN npm install --prefix client

# Копирование исходных файлов
COPY . .

# Генерация настоящего public/ перед запуском контейнера
RUN npm run build:app

# Создание директорий
RUN mkdir -p data uploads tmp

# Открытие порта
EXPOSE 4000

# Переменные окружения
ENV NODE_ENV=production
ENV PORT=4000
ENV USE_MEMORY_SESSION=true

# Запуск сервера
CMD ["node", "server.js"]