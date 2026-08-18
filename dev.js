import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';
const nodeCmd = process.execPath;

console.log('===================================================');
console.log('            INICIANDO CONCORD (DEV)                ');
console.log('===================================================');

// Helper to check if a URL is responding
function waitForUrl(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout esperando por ${url}`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

// 1. Start Backend Server
console.log('\n[1/3] Iniciando Servidor Backend (API & WebSocket)...');
const backendProcess = spawn(nodeCmd, ['src/server.js'], {
  cwd: path.resolve(__dirname, 'backend'),
  stdio: 'inherit'
});

backendProcess.on('error', (err) => {
  console.error('Erro ao iniciar backend:', err);
});

// Wait for Backend health check
try {
  await waitForUrl('http://localhost:4000/api/health', 10000);
  console.log(' -> Backend pronto em http://localhost:4000');
} catch (err) {
  console.warn('Backend demorou para responder, continuando...');
}

// 2. Start Vite Dev Server
console.log('\n[2/3] Iniciando Servidor de Interface (Vite)...');
const viteProcess = spawn(npxCmd, ['vite'], {
  cwd: path.resolve(__dirname, 'desktop'),
  stdio: 'inherit',
  shell: true
});

viteProcess.on('error', (err) => {
  console.error('Erro ao iniciar Vite:', err);
});

// Wait for Vite Dev Server
try {
  await waitForUrl('http://localhost:5173', 15000);
  console.log(' -> Interface pronta em http://localhost:5173');
} catch (err) {
  console.warn('Vite demorou para responder, continuando...');
}

// 3. Launch Electron Desktop Window
console.log('\n[3/3] Abrindo janela do aplicativo Desktop...');
console.log('---------------------------------------------------');
console.log(' DICA DE TESTE (2 ou mais usuarios):');
console.log(' 1. Crie uma conta no aplicativo Desktop (ex: Erick)');
console.log(' 2. Abra http://localhost:5173 no seu navegador');
console.log('    (ou em uma aba anonima) e crie uma 2ª conta (ex: Bob)');
console.log(' 3. Crie um servidor, convide o outro usuario e teste:');
console.log('    - Chat de texto em tempo real');
console.log('    - Entrar na sala de voz (voz real + medidor)');
console.log('    - Transmitir tela/janela em tempo real');
console.log('---------------------------------------------------\n');

const electronProcess = spawn(npxCmd, ['electron', '.'], {
  cwd: path.resolve(__dirname, 'desktop'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173'
  }
});

electronProcess.on('close', (code) => {
  console.log('\nAplicativo desktop fechado. Encerrando serviços...');
  cleanup();
  process.exit(code || 0);
});

function cleanup() {
  try {
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
  } catch (e) {}
  try {
    if (backendProcess && !backendProcess.killed) backendProcess.kill();
  } catch (e) {}
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

process.on('exit', cleanup);
