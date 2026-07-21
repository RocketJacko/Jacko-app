import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const outFile = path.join(projectRoot, 'src', 'generated', 'miPersonajeFrameUrls.ts');

const supabaseUrl = 'https://plybwnfnmvshroaottby.supabase.co';
const bucketName = 'frames';
const folderName = 'f3d2a1c09b8e';
const totalFrames = 240;

// Generar array de URLs públicas apuntando al Storage de Supabase
const urls = [];
for (let i = 1; i <= totalFrames; i++) {
  const frameNum = String(i).padStart(3, '0');
  urls.push(`${supabaseUrl}/storage/v1/object/public/${bucketName}/${folderName}/ezgif-frame-${frameNum}.webp`);
}

const body = `/* Auto-generado por npm run sync:personaje — no editar a mano */
export const MI_PERSONAJE_FRAME_URLS = ${JSON.stringify(urls, null, 2)} as const;
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, body, 'utf8');

console.log(`[sync:personaje] ✓ Generadas ${totalFrames} URLs de Supabase Storage (.webp)`);
console.log('[sync:personaje] Lista generada →', path.relative(projectRoot, outFile));

