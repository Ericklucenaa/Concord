// Quick helper to publish and broadcast new Concord updates
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const newVersion = args[0] || '1.0.1';
const releaseNotes = args[1] || 'Melhorias de desempenho, estabilidade e novas funcionalidades.';
const downloadUrl = args[2] || 'https://github.com/Ericklucenaa/Concord/releases/latest';

const versionPath = path.join(__dirname, 'public', 'version.json');
const pkgPath = path.join(__dirname, 'package.json');

const versionData = {
  version: newVersion,
  name: `Concord v${newVersion}`,
  releaseDate: new Date().toISOString().split('T')[0],
  downloadUrl: downloadUrl,
  webUrl: 'https://concord-3af70.web.app',
  releaseNotes: releaseNotes,
  isMandatory: false
};

fs.writeFileSync(versionPath, JSON.stringify(versionData, null, 2), 'utf-8');

// Update package.json version
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
} catch (e) {}

console.log(`\n========================================`);
console.log(`🚀 Versão v${newVersion} preparada com sucesso!`);
console.log(`📝 Notas: "${releaseNotes}"`);
console.log(`📦 Arquivo: desktop/public/version.json`);
console.log(`========================================\n`);
