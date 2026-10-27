// Shows the latest crash/error reports sent by clients (concord_error_reports),
// grouped by message. Clients can only create reports; reading needs the
// owner's gcloud credentials.
//
//   node scripts/error-reports.mjs [--days 7]
import { listCollection } from './firestore-admin.mjs';

const daysArg = process.argv.indexOf('--days');
const days = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 7;
const since = Date.now() - days * 86_400_000;

const reports = (await listCollection('concord_error_reports'))
  .map((d) => d.data)
  .filter((r) => Date.parse(r.createdAt) >= since);

const groups = new Map();
for (const r of reports) {
  const key = `${r.context} | ${r.message}`;
  const g = groups.get(key) || { count: 0, users: new Set(), versions: new Set(), last: r };
  g.count++;
  g.users.add(r.userId);
  g.versions.add(r.version);
  if (r.createdAt > g.last.createdAt) g.last = r;
  groups.set(key, g);
}

console.log(`${reports.length} relatórios nos últimos ${days} dias\n`);
[...groups.entries()].sort((a, b) => b[1].count - a[1].count).forEach(([key, g]) => {
  console.log(`× ${g.count} (${g.users.size} usuários; versões ${[...g.versions].join(', ')})`);
  console.log(`  ${key}`);
  console.log(`  último: ${g.last.createdAt} ${g.last.platform}`);
  if (g.last.stack) console.log(`  ${g.last.stack.split('\n').slice(0, 4).join('\n  ')}`);
  console.log('');
});
