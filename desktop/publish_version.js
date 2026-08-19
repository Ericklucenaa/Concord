// Quick helper to publish, build installer, and broadcast new Concord updates
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const newVersion = args[0] || '1.0.5';
const releaseNotes = args[1] || 'Melhorias de desempenho, estabilidade e novas funcionalidades.';
const customDownloadUrl = args[2];

const versionPath = path.join(__dirname, 'public', 'version.json');
const pkgPath = path.join(__dirname, 'package.json');
const distElectronDir = path.join(__dirname, 'dist-electron');

// 1. Clean up ANY previous .exe / .blockmap files from dist-electron BEFORE build
if (fs.existsSync(distElectronDir)) {
  console.log('\n🧹 Limpando instaladores e executáveis de versões anteriores...');
  const existingFiles = fs.readdirSync(distElectronDir);
  let deletedCount = 0;
  for (const file of existingFiles) {
    const fullPath = path.join(distElectronDir, file);
    if (fs.statSync(fullPath).isFile()) {
      if (file.endsWith('.exe') || file.endsWith('.blockmap') || file.endsWith('.zip') || file.endsWith('.yml')) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`   - Removido arquivo antigo: ${file}`);
          deletedCount++;
        } catch (err) {
          console.warn(`   ! Aviso: Não foi possível apagar ${file}:`, err.message);
        }
      }
    }
  }
  if (deletedCount === 0) {
    console.log('   Nenhum executável antigo encontrado.');
  }
} else {
  fs.mkdirSync(distElectronDir, { recursive: true });
}

// 2. Update package.json version
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  console.log(`\n📦 package.json atualizado para v${newVersion}`);
} catch (e) {
  console.error('Erro ao atualizar package.json:', e);
}

// 3. Update public/version.json
const downloadUrl = customDownloadUrl || `https://github.com/Ericklucenaa/Concord/releases/download/v${newVersion}/Concord.Setup.${newVersion}.exe`;
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
console.log(`📄 public/version.json atualizado para v${newVersion}`);

// 4. Build Vite Renderer Bundle
console.log('\n🔨 Compilando aplicação Web/Desktop (Vite)...');
try {
  execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
} catch (buildErr) {
  console.error('❌ Falha na compilação do Vite:', buildErr);
  process.exit(1);
}

// 5. Build Windows Installer with electron-builder
console.log('\n⚡ Gerando novo instalador .exe do Concord v' + newVersion + '...');
try {
  execSync('npx electron-builder --win --x64', { cwd: __dirname, stdio: 'inherit' });
} catch (distErr) {
  console.error('❌ Falha ao gerar o instalador executável:', distErr);
  process.exit(1);
}

// 6. Verify and ensure ONLY the latest .exe files remain
if (fs.existsSync(distElectronDir)) {
  const finalFiles = fs.readdirSync(distElectronDir);
  const exeFiles = finalFiles.filter((f) => f.endsWith('.exe'));
  console.log('\n========================================');
  console.log(`🚀 Concord v${newVersion} - Instalador gerado com sucesso!`);
  console.log(`📁 Diretório: desktop/dist-electron/`);
  console.log(`📦 Executáveis da versão atual:`);
  exeFiles.forEach((exe) => {
    const stats = fs.statSync(path.join(distElectronDir, exe));
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(1);
    console.log(`   ✨ ${exe} (${sizeMb} MB)`);
  });
  console.log(`📝 Notas da versão: "${releaseNotes}"`);
  console.log('========================================\n');
}

