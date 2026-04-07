const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let backendProcess = null;
let mainWindow = null;

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;

function getAppBasePath() {
  return app.getAppPath();
}

function getBackendEntryPath() {
  return path.join(getAppBasePath(), 'backend', 'src', 'server.js');
}

function getBackendCwd() {
  return path.join(getAppBasePath(), 'backend');
}

function getFrontendIndexPath() {
  return path.join(getAppBasePath(), 'frontend', 'dist', 'index.html');
}

function getNodeCommand() {
  if (isDev) {
    return 'node';
  }

  return process.execPath;
}

function getNodeEnv() {
  if (isDev) {
    return { ...process.env };
  }

  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function startBackend() {
  const backendPath = getBackendEntryPath();
  const backendCwd = getBackendCwd();

  const logPath = path.join(app.getPath('userData'), 'backend.log');
  const out = fs.openSync(logPath, 'a');

  console.log('[Electron] isDev:', isDev);
  console.log('[Electron] appPath:', getAppBasePath());
  console.log('[Electron] backendPath:', backendPath);
  console.log('[Electron] backendCwd:', backendCwd);
  console.log('[Electron] backendLog:', logPath);

  if (!fs.existsSync(backendPath)) {
    console.error('[Electron] Backend não encontrado:', backendPath);
    return false;
  }

  backendProcess = spawn(getNodeCommand(), [backendPath], {
    cwd: backendCwd,
    stdio: ['ignore', out, out],
    env: {
      ...getNodeEnv(),
      APP_DATA_DIR: app.getPath('userData'),
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL,
    },
    shell: false,
    windowsHide: true,
  });

  backendProcess.on('spawn', () => {
    console.log('[Electron] Backend iniciado.');
  });

  backendProcess.on('error', (err) => {
    console.error('[Electron] Erro ao iniciar backend:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[Electron] Backend saiu. code=${code} signal=${signal}`);
    backendProcess = null;
  });

  return true;
}

function getAppIcon() {
  const iconCandidates = [
    path.join(getAppBasePath(), 'build', 'icon.ico'),
    path.join(getAppBasePath(), 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, 'build', 'icon.png'),
  ];

  for (const iconPath of iconCandidates) {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  }

  return undefined;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackend() {
  const healthUrl = `http://127.0.0.1:${BACKEND_PORT}/api/health`;
  const maxRetries = 30;
  const intervalMs = 500;

  console.log('[Electron] Aguardando backend responder em:', healthUrl);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(healthUrl);

      if (response.ok) {
        console.log(`[Electron] Backend respondeu com sucesso na tentativa ${attempt}.`);
        return true;
      }
    } catch (error) {
      console.log(
        `[Electron] Backend ainda não respondeu (tentativa ${attempt}/${maxRetries}).`
      );
    }

    await delay(intervalMs);
  }

  return false;
}

function createWindow() {
  const indexPath = getFrontendIndexPath();

  console.log('[Electron] Carregando frontend em:', indexPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    title: 'Souarte Chatbot',
    icon: getAppIcon(),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Electron] did-fail-load:', { errorCode, errorDescription });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] render-process-gone:', details);
  });

  if (!fs.existsSync(indexPath)) {
    console.error('[Electron] Frontend não encontrado em:', indexPath);
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
        <html>
          <body style="font-family: Arial; padding: 24px;">
            <h2>Frontend não encontrado</h2>
            <p>Arquivo esperado:</p>
            <pre>${indexPath}</pre>
          </body>
        </html>
      `)}`
    );
    return;
  }

  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[Electron] Erro ao carregar frontend:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      const backendStarted = startBackend();

      if (!backendStarted) {
        console.error('[Electron] Backend não foi iniciado.');
      } else {
        const backendReady = await waitForBackend();

        if (!backendReady) {
          console.error('[Electron] Backend não respondeu a tempo.');
        }
      }

      createWindow();
    } catch (err) {
      console.error('[Electron] Erro durante inicialização da aplicação:', err);
      createWindow();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (err) {
      console.error('[Electron] Erro ao encerrar backend:', err);
    }
  }
});