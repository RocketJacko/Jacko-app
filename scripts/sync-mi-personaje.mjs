import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const destDir = path.join(projectRoot, 'public', 'frames', 'f3d2a1c09b8e');
const outFile = path.join(projectRoot, 'src', 'generated', 'miPersonajeFrameUrls.ts');

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

if (!fs.existsSync(destDir)) {
  console.error('[sync:personaje] No existe la carpeta:', destDir);
  process.exit(1);
}

const files = fs
  .readdirSync(destDir)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort(naturalSort);

if (files.length === 0) {
  console.error('[sync:personaje] No hay .jpg/.jpeg en:', destDir);
  process.exit(1);
}

const urls = files.map((f) => `/frames/f3d2a1c09b8e/${f}`);
const body = `/* Auto-generado por npm run sync:personaje — no editar a mano */
export const MI_PERSONAJE_FRAME_URLS = ${JSON.stringify(urls, null, 2)} as const;
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body, 'utf8');

console.log('[sync:personaje] ✓ Detectados', files.length, 'frames en public/frames/f3d2a1c09b8e');
console.log('[sync:personaje] Lista generada →', path.relative(projectRoot, outFile));
