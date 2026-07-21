#!/usr/bin/env node
/**
 * Verificación rápida para el agente QA — infinity-landing
 * Uso: npm run verify
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  return r.status === 0;
}

let ok = true;

console.log('\n[infinity-qa] 1/3 Comprobando frames generados...');
const generated = path.join(root, 'src', 'generated', 'miPersonajeFrameUrls.ts');
if (!fs.existsSync(generated)) {
  console.error('  ✗ Falta', path.relative(root, generated), '— ejecuta npm run sync:personaje');
  ok = false;
} else {
  console.log('  ✓ Encontrado', path.relative(root, generated));
}

console.log('\n[infinity-qa] 2/3 TypeScript + Vite build...');
if (!run('npm', ['run', 'build'])) {
  ok = false;
}

console.log('\n[infinity-qa] 3/3 ESLint...');
if (!run('npm', ['run', 'lint'])) {
  ok = false;
}

if (ok) {
  console.log('\n[infinity-qa] ✓ Verificación completada\n');
  process.exit(0);
} else {
  console.error('\n[infinity-qa] ✗ Verificación fallida — revisa errores arriba\n');
  process.exit(1);
}
