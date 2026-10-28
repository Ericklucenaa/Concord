// Runs tests/e2e/call.cjs: starts Vite against the Firebase emulators and
// drives three real Electron windows. Use through `npm run test:e2e`
// (which wraps this in `firebase emulators:exec`). Windows/desktop only:
// the screen-share checks capture the real screen.
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = { ...process.env, VITE_FIREBASE_EMULATOR: '1' };
delete env.ELECTRON_RUN_AS_NODE;

const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], { cwd: desktop, env, shell: true, stdio: 'ignore' });
const stop = () => { try { vite.kill(); } catch { /* already gone */ } };

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await fetch('http://localhost:5173').then((r) => r.ok).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) {
  stop();
  console.error('Vite did not start');
  process.exit(1);
}

const electron = spawn('npx', ['electron', path.join(desktop, 'tests/e2e/call.cjs')], {
  cwd: desktop,
  env: { ...env, CONCORD_MAIN: path.join(desktop, 'src/main/index.cjs') },
  shell: true
});
let output = '';
electron.stdout.on('data', (d) => {
  const text = d.toString();
  output += text;
  text.split('\n').filter((l) => /^(PASS|FAIL|RESULT)/.test(l)).forEach((l) => console.log(l));
});
electron.on('exit', () => {
  stop();
  const m = output.match(/RESULT (\d+)\/(\d+)/);
  process.exit(m && m[1] === m[2] ? 0 : 1);
});
