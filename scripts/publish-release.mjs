// Publishes a built desktop release:
//   1. uploads the installers to a GitHub release (gh CLI),
//   2. writes the update manifest (with the installer's SHA-256) to Firestore
//      using admin credentials — clients can only read it,
//   3. writes version.json for the hosted web app.
//
// Usage (after `npm run dist:win` in desktop/):
//   node scripts/publish-release.mjs "Notas da versão" [--mandatory]
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDocument } from './firestore-admin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(root, 'desktop');
const { version } = JSON.parse(readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const notes = process.argv.slice(2).find((a) => !a.startsWith('--')) || `Concord v${version}`;
const mandatory = process.argv.includes('--mandatory');
const repo = 'Ericklucenaa/Concord';
const tag = `v${version}`;

const setupName = `Concord-Setup-${version}.exe`;
const portableName = `Concord-Portable-${version}.exe`;
const setupPath = path.join(desktop, 'dist-electron', setupName);
const portablePath = path.join(desktop, 'dist-electron', portableName);
if (!existsSync(setupPath)) {
  console.error(`Installer not found: ${setupPath}. Run "npm run dist:win" in desktop/ first.`);
  process.exit(1);
}

const sha256 = createHash('sha256').update(readFileSync(setupPath)).digest('hex');
console.log(`${setupName} sha256=${sha256}`);

const gh = (...args) => execFileSync('gh', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const assets = [setupPath, ...(existsSync(portablePath) ? [portablePath] : [])];
let releaseExists = true;
try {
  gh('release', 'view', tag, '--repo', repo);
} catch {
  releaseExists = false;
}
if (releaseExists) {
  gh('release', 'upload', tag, ...assets, '--clobber', '--repo', repo);
} else {
  gh('release', 'create', tag, ...assets, '--repo', repo, '--title', `Concord ${tag}`, '--notes', `${notes}\n\nSHA-256 (${setupName}): \`${sha256}\``);
}
console.log(`GitHub release ${tag} published.`);

const manifest = {
  version,
  name: `Concord ${tag}`,
  releaseDate: new Date().toISOString().slice(0, 10),
  downloadUrl: `https://github.com/${repo}/releases/download/${tag}/${setupName}`,
  sha256,
  webUrl: 'https://concord-3af70.web.app',
  releaseNotes: notes,
  isMandatory: mandatory
};

await setDocument('concord_app_version/latest', manifest);
console.log('Update manifest written to Firestore (concord_app_version/latest).');

const json = `${JSON.stringify(manifest, null, 2)}\n`;
writeFileSync(path.join(desktop, 'public', 'version.json'), json);
if (existsSync(path.join(desktop, 'dist'))) writeFileSync(path.join(desktop, 'dist', 'version.json'), json);
console.log('version.json updated. Deploy hosting to publish it on the web.');
