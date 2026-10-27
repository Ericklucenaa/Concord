// Dumps every top-level Firestore collection to backups/<date>/<collection>.json
// using the owner's gcloud credentials. The Spark plan has no managed
// exports, so run this periodically (e.g. weekly) and keep the files safe —
// they contain private messages.
//
//   node scripts/backup-firestore.mjs            # all collections
//   node scripts/backup-firestore.mjs concord_users concord_servers
import fs from 'fs';
import path from 'path';
import { listCollection, listCollectionIds, PROJECT_ID } from './firestore-admin.mjs';

const only = process.argv.slice(2);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(process.cwd(), 'backups', `${PROJECT_ID}-${stamp}`);
fs.mkdirSync(dir, { recursive: true });

const collections = only.length ? only : await listCollectionIds();
let total = 0;
for (const name of collections) {
  const docs = await listCollection(name);
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 1));
  total += docs.length;
  console.log(`${name.padEnd(32)} ${docs.length}`);
}
console.log(`\n${total} documentos salvos em ${dir}`);
