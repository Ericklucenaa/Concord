import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

// Starts the Vite dev server and opens the Electron app against it.
// All data lives in Firebase, so there is no local backend to start.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const desktopDir = path.resolve(__dirname, 'desktop');

function waitForUrl(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 400) resolve(true);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error(`Timeout esperando ${url}`));
      else setTimeout(check, 500);
    };
    check();
  });
}

console.log('Iniciando Concord (dev)...');

const vite = spawn(npxCmd, ['vite'], { cwd: desktopDir, stdio: 'inherit', shell: true });

waitForUrl('http://localhost:5173')
  .then(() => {
    const electron = spawn(npxCmd, ['electron', '.'], { cwd: desktopDir, stdio: 'inherit', shell: true });
    electron.on('close', (code) => {
      vite.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err.message);
    vite.kill();
    process.exit(1);
  });

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
