// Configures the TURN relay used by voice, video and screen sharing, without
// rebuilding the app (stored in Firestore: concord_app_config/ice).
//
//   node scripts/set-turn.mjs "turn:host:80,turn:host:443?transport=tcp,turns:host:443" USER CREDENTIAL
//   node scripts/set-turn.mjs --clear
//
// Free option: create an account at metered.ca (Open Relay, 20 GB/month free)
// and copy the TURN URLs, username and credential from its dashboard.
import { setDocument } from './firestore-admin.mjs';

const [urlsArg, username, credential] = process.argv.slice(2);

if (urlsArg === '--clear') {
  await setDocument('concord_app_config/ice', { servers: [], updatedAt: new Date().toISOString() });
  console.log('TURN removido.');
  process.exit(0);
}

const urls = String(urlsArg || '').split(',').map((u) => u.trim()).filter(Boolean);
if (!urls.length || !urls.every((u) => /^turns?:/.test(u)) || !username || !credential) {
  console.error('Uso: node scripts/set-turn.mjs "turn:...,turns:..." USUARIO SENHA');
  process.exit(1);
}

await setDocument('concord_app_config/ice', {
  servers: [{ urls, username, credential }],
  updatedAt: new Date().toISOString()
});
console.log(`TURN configurado (${urls.length} URLs). Vale para quem entrar numa chamada a partir de agora.`);
