const { app, BrowserWindow, shell, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow = null;
let splashWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;
let serverRestarts = 0;
const MAX_SERVER_RESTARTS = 5;
let notificationCount = 0;
const SERVER_PORT = process.env.PORT || 4000;

// ВАЖНО: Electron должен всегда использовать локальный сервер
// Используем 127.0.0.1 для стабильности
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

// Функция логирования (инициализируется внутри app.whenReady)
let logFile = null;
let logDir = null;

function setupLogging() {
  logDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  logFile = path.join(logDir, 'main.log');

  function logToFile(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(logFile, logMessage);
    } catch (err) {
      // Игнорируем ошибки логирования
    }
  }

  // Перенаправляем console.log для записи в файл
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    originalConsoleLog(...args);
    logToFile(args.join(' '));
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    originalConsoleError(...args);
    logToFile('ERROR: ' + args.join(' '));
  };

  console.log('=== Nexo Electron Process Starting ===');
  console.log('Process ID:', process.pid);
  console.log('Exec Path:', process.execPath);
  console.log('App Path:', app.getAppPath());
  console.log('User Data:', app.getPath('userData'));
  console.log('Log File:', logFile);
}

function waitForServer(maxAttempts = 60, intervalMs = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const isServerAlive = () =>
      serverProcess && !serverProcess.killed && serverProcess.exitCode === null;

    const checkServerHealth = () => {
      // Проверяем что процесс жив
      if (!isServerAlive()) {
        reject(new Error('Server process died before becoming ready'));
        return;
      }

      attempts += 1;
      // Одна проверка = одно продолжение. Раньше при таймауте срабатывали и 'timeout',
      // и 'error' (после destroy), и цикл опроса удваивался.
      let settled = false;
      const retry = (reason) => {
        if (settled) return;
        settled = true;
        if (attempts >= maxAttempts) {
          reject(new Error(`Server failed to start (${reason})`));
          return;
        }
        setTimeout(checkServerHealth, intervalMs);
      };

      const req = http.get(`${SERVER_URL}/api/security/csrf-token`, (res) => {
        res.resume();
        if (settled) return;
        settled = true;
        // Подождём секунду и убедимся, что процесс не упал сразу после открытия порта
        setTimeout(() => {
          if (!isServerAlive()) {
            reject(new Error('Server process died immediately after opening port'));
            return;
          }
          resolve();
        }, 1000);
      });
      req.on('error', () => retry('connection error'));
      req.setTimeout(1000, () => {
        req.destroy();
        retry('timeout');
      });
    };

    checkServerHealth();
  });
}

function getIconsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'icons')
    : path.join(__dirname, 'icons');
}

// Файлы иконок лежат с суффиксом размера (Nexo-Desctop-ico-256.png), поэтому ищем
// нужный размер, затем имя без суффикса и ближайшие размеры.
function getIconPath(iconName, size = 256) {
  const dir = getIconsDir();
  const candidates = [
    `${iconName}-${size}.png`,
    `${iconName}.png`,
    `${iconName}-256.png`,
    `${iconName}-128.png`,
    `${iconName}-64.png`,
    `${iconName}-48.png`,
    `${iconName}-32.png`,
    `${iconName}-16.png`
  ];
  for (const file of candidates) {
    const candidate = path.join(dir, file);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(dir, `${iconName}-${size}.png`);
}

function getTrayIconPath() {
  const iconName = notificationCount > 0 ? 'nexo-ico-mini-ping' : 'nexo-ico-mini';
  return getIconPath(iconName, 32);
}

// Тестовый аккаунт разработчика (dev@nexo.local с премиум-подпиской).
// Включён при запуске из исходников (`npm start` / `electron:dev`). В установленной сборке
// включается переменной NEXO_DEV_ACCOUNT=1 или пустым файлом dev-account.enabled в папке
// пользовательских данных (Windows: %APPDATA%\Nexo). NEXO_DEV_ACCOUNT=0 выключает всегда.
function isDevAccountEnabled() {
  const flag = process.env.NEXO_DEV_ACCOUNT;
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return true;
  return !app.isPackaged || fs.existsSync(path.join(app.getPath('userData'), 'dev-account.enabled'));
}

// Секреты десктопного сервера генерируются один раз и хранятся в userData,
// а не зашиты в код (иначе любой мог бы подделать сессию/JWT).
function getOrCreateSecrets() {
  const secretsFile = path.join(app.getPath('userData'), 'secrets.json');
  let secrets = {};
  try {
    secrets = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
  } catch {
    secrets = {};
  }

  let changed = false;
  for (const key of ['SESSION_SECRET', 'JWT_SECRET']) {
    if (typeof secrets[key] !== 'string' || secrets[key].length < 32) {
      secrets[key] = crypto.randomBytes(48).toString('hex');
      changed = true;
    }
  }

  if (changed) {
    fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
  }
  return secrets;
}

function createTray() {
  console.log('Creating system tray...');
  
  const trayIconPath = getTrayIconPath();
  console.log('Tray icon path:', trayIconPath);
  
  // Проверяем существование файла иконки
  if (!fs.existsSync(trayIconPath)) {
    console.error('Tray icon not found:', trayIconPath);
    // Используем встроенную иконку если файл не найден
    tray = new Tray(nativeImage.createEmpty());
  } else {
    const trayImage = nativeImage.createFromPath(trayIconPath);
    tray = new Tray(trayImage);
  }
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Nexo',
      icon: nativeImage.createFromPath(getIconPath('Nexo-Desctop-ico', 16)),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Проверить обновления',
      click: () => {
        checkForUpdates();
      }
    },
    {
      label: 'О программе',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Nexo');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
  
  console.log('System tray created');
}

// IPC handlers (will be registered inside app.whenReady)
function setupIPCHandlers() {
  ipcMain.on('set-notification-count', (event, count) => {
    setNotificationCount(count);
    // Отправляем уведомление обратно в renderer
    if (mainWindow) {
      mainWindow.webContents.send('notification-updated', count);
    }
  });

  ipcMain.on('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}

function updateTrayIcon() {
  if (!tray) return;
  
  const trayIconPath = getTrayIconPath();
  const trayImage = nativeImage.createFromPath(trayIconPath);
  tray.setImage(trayImage);
  
  const tooltip = notificationCount > 0 
    ? `Nexo (${notificationCount} уведомлений)` 
    : 'Nexo';
  tray.setToolTip(tooltip);
}

function setNotificationCount(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
  notificationCount = Math.min(safeCount, 9); // Максимум 9

  // Обновляем иконку трея
  updateTrayIcon();

  // Обновляем иконку главного окна
  if (mainWindow) {
    const iconName = notificationCount > 0
      ? `Nexo-desctop-ico-${notificationCount}ping`
      : 'Nexo-Desctop-ico';
    const iconPath = getIconPath(iconName);
    if (fs.existsSync(iconPath)) {
      mainWindow.setIcon(nativeImage.createFromPath(iconPath));
    }
  }
}

function checkForUpdates() {
  console.log('Checking for updates...');
  if (splashWindow) {
    splashWindow.webContents.send('loading-status', 'Проверяем наличие обновлений…');
  }

  // Автообновление пока не подключено: не сообщаем пользователю, что
  // удалённый сервер действительно проверен или новая версия найдена.
  setTimeout(() => {
    console.log('Automatic updates are not configured in this alpha build');
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.send('update-not-available', 'Автообновления пока не подключены');
    }
  }, 700);
}

function getServerRuntime() {
  // И в разработке, и в упакованной сборке сервер запускается самим Electron как Node.
  // Нативные модули (better-sqlite3) собираются под ABI Electron (postinstall:
  // electron-builder install-app-deps), поэтому отдельный node.exe с другим ABI
  // использовать нельзя: он не загрузит better_sqlite3.node.
  return {
    execPath: process.execPath,
    useElectronAsNode: true
  };
}

function startServer() {
  const userDataDir = path.join(app.getPath('userData'), 'data');
  
  // Создаем директории для данных
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
    console.log('Created userData directory:', userDataDir);
  }
  
  const uploadsDir = path.join(userDataDir, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Created uploads directory:', uploadsDir);
  }
  
  const tmpDir = path.join(userDataDir, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log('Created tmp directory:', tmpDir);
  }

  // Определяем пути к server.js
  let serverPath, serverCwd;
  
  if (app.isPackaged) {
    // В packaged приложении
    serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js');
    serverCwd = path.join(process.resourcesPath, 'app.asar.unpacked');
    console.log('Using packaged application paths');
  } else {
    // В разработке
    serverPath = path.join(__dirname, '..', 'server.js');
    serverCwd = path.join(__dirname, '..');
    console.log('Using development paths');
  }

  const runtime = getServerRuntime();

  console.log('Starting server with:');
  console.log('  serverPath:', serverPath);
  console.log('  serverCwd:', serverCwd);
  console.log('  runtime:', runtime.execPath);
  console.log('  userDataDir:', userDataDir);
  console.log('  PORT:', SERVER_PORT);

  // Проверяем существование server.js
  if (!fs.existsSync(serverPath)) {
    const error = `Server file not found: ${serverPath}`;
    console.error(error);
    throw new Error(error);
  }

  const secrets = getOrCreateSecrets();

  // stdout/stderr сервера берём через pipe, чтобы они попадали в main.log
  // (при stdio: 'inherit' потоков нет, и логи сервера терялись).
  const child = fork(serverPath, [], {
    cwd: serverCwd,
    execPath: runtime.execPath,
    env: {
      ...process.env,
      ...(runtime.useElectronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      ELECTRON_DESKTOP: '1',
      USE_MEMORY_SESSION: 'true',
      PORT: String(SERVER_PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'production',
      CLIENT_ORIGIN: SERVER_URL, // Используем локальный URL
      SESSION_SECRET: process.env.SESSION_SECRET || secrets.SESSION_SECRET,
      JWT_SECRET: process.env.JWT_SECRET || secrets.JWT_SECRET,
      DATA_DIR: userDataDir,
      DB_PATH: path.join(userDataDir, 'app.db'),
      NEXO_DEV_ACCOUNT: isDevAccountEnabled() ? 'true' : 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  serverProcess = child;

  child.on('error', (error) => {
    console.error('Server process error:', error);
  });

  child.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
    if (serverProcess === child) {
      serverProcess = null;
    }

    // Сервер упал уже после успешного запуска — поднимаем его снова (с ограничением),
    // чтобы чаты не оставались мёртвыми до перезапуска приложения.
    const crashed = code !== 0 && signal !== 'SIGTERM';
    if (crashed && serverReady && !app.isQuitting) {
      console.error('Server crashed! Exit code:', code);
      if (serverRestarts < MAX_SERVER_RESTARTS) {
        serverRestarts += 1;
        const delay = 1000 * serverRestarts;
        console.log(`Restarting server in ${delay} ms (attempt ${serverRestarts}/${MAX_SERVER_RESTARTS})`);
        setTimeout(() => {
          if (!app.isQuitting) {
            try {
              startServer();
            } catch (error) {
              console.error('Failed to restart server:', error);
            }
          }
        }, delay);
      } else {
        console.error('Server restart limit reached; giving up.');
      }
    }
  });

  // Логируем stdout и stderr от сервера
  child.stdout?.on('data', (data) => {
    console.log('[Server stdout]', data.toString());
  });

  child.stderr?.on('data', (data) => {
    console.error('[Server stderr]', data.toString());
  });

  console.log('Server process started with PID:', child.pid);
}

function createSplashWindow() {
  console.log('Creating splash window...');
  
  splashWindow = new BrowserWindow({
    width: 360,
    height: 250,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false,
    backgroundColor: '#262624'
  });

  const splashPath = path.join(__dirname, 'splash.html');
  console.log('Loading splash from:', splashPath);
  
  splashWindow.loadFile(splashPath);
  
  splashWindow.once('ready-to-show', () => {
    console.log('Splash window ready to show');
    splashWindow.center();
    splashWindow.show();
    
    // Отправляем версию приложения
    const version = app.getVersion();
    splashWindow.webContents.send('app-version', version);
  });

  splashWindow.on('closed', () => {
    console.log('Splash window closed');
    splashWindow = null;
  });
}

function createWindow() {
  console.log('Creating main window...');
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    frame: false, // Убираем стандартную рамку
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Nexo',
    show: false,
    backgroundColor: '#0D0A1A',
    icon: getIconPath('Nexo-Desctop-ico')
  });

  // Добавляем обработчики ошибок загрузки
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${level}: ${message}`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
  });

  // Сервер уже поднят (см. app.whenReady), поэтому грузим приложение напрямую.
  // Раньше сначала открывалась welcome.html из file://: её скрипт использовал require('electron')
  // при nodeIntegration=false и падал, а fetch к серверу из file:// блокировался CORS,
  // так что окно навсегда зависало на экране «Подключение к серверу…».
  console.log('Loading URL:', SERVER_URL);
  mainWindow.loadURL(SERVER_URL)
    .then(() => {
      console.log('URL loaded successfully');
    })
    .catch((loadErr) => {
      console.error('Failed to load URL:', loadErr);
      const safeMessage = String(loadErr.message || loadErr)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <html>
          <head><title>Nexo Error</title></head>
          <body style="background: #1e1e1e; color: white; font-family: sans-serif; padding: 20px;">
            <h1>Nexo Failed to Start</h1>
            <p>Could not load the application. Error: ${safeMessage}</p>
            <p>Server URL: ${SERVER_URL}</p>
            <p>Please check the log file in the Nexo user data folder for more details.</p>
          </body>
        </html>
      `));
    });

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    console.log('Main window closed');
    mainWindow = null;
  });
  
  // При закрытии окна - скрываем в трей, а не закрываем приложение
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      console.log('Window hidden to tray');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// Только один экземпляр: второй запуск иначе упёрся бы в занятый порт сервера (EADDRINUSE)
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Инициализация приложения Electron
app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    return;
  }

  // Инициализируем логирование после того, как app готов
  setupLogging();
  
  // Регистрируем IPC handlers
  setupIPCHandlers();
  
  try {
    console.log('=== Nexo Electron App Starting ===');
    console.log('App path:', app.getAppPath());
    console.log('User data:', app.getPath('userData'));
    console.log('Is packaged:', app.isPackaged);
    console.log('Node version:', process.version);
    console.log('Platform:', process.platform);
    console.log('Server URL:', SERVER_URL);
    console.log('Server Port:', SERVER_PORT);
    
    // Сначала создаем splash screen
    createSplashWindow();
    
    // Запускаем встроенный сервер
    console.log('Starting embedded server...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Запуск сервера...');
    }
    startServer();
    
    // Ждем, пока сервер станет доступен
    console.log('Waiting for server to be ready...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Ожидание сервера...');
    }
    await waitForServer();
    serverReady = true;
    console.log('Server is ready!');
    
    // Проверяем обновления
    checkForUpdates();
    
    // Создаем system tray
    createTray();
    
    // Создаем главное окно только после того, как сервер готов
    console.log('Creating main window...');
    if (splashWindow) {
      splashWindow.webContents.send('loading-status', 'Загрузка интерфейса...');
    }
    createWindow();
    
    // Когда главное окно готово, закрываем splash screen
    // Окно показывает/открывает DevTools обработчик в createWindow; здесь только закрываем splash
    mainWindow.once('ready-to-show', () => {
      console.log('Main window ready, closing splash...');
      if (splashWindow) {
        splashWindow.close();
      }
    });
    
    console.log('=== Nexo Started Successfully ===');
  } catch (error) {
    console.error('=== Nexo Failed to Start ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Показываем ошибку пользователю
    const errorHtml = `
      <html>
        <head><title>Nexo Error</title></head>
        <body style="background: #1e1e1e; color: white; font-family: sans-serif; padding: 40px;">
          <h1 style="color: #ff6b6b;">Nexo Failed to Start</h1>
          <p><strong>Error:</strong> ${String(error.message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <p><strong>Server URL:</strong> ${SERVER_URL}</p>
          <p><strong>Is Packaged:</strong> ${app.isPackaged}</p>
          <p>Please check the console logs for more details.</p>
          <p>The application will close in 10 seconds.</p>
        </body>
      </html>
    `;
    
    const errorWindow = new BrowserWindow({
      width: 600,
      height: 400,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    
    errorWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml));
    
    setTimeout(() => {
      app.quit();
    }, 10000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Не закрываем приложение когда все окна закрыты - оно работает в фоне
  console.log('All windows closed, keeping app running in background');
});

app.on('before-quit', () => {
  // Без этого флага обработчик 'close' окна отменяет закрытие (прячет в трей),
  // и приложение не завершается при выходе из меню, перезагрузке или выключении системы.
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('nexo', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('nexo');
}