import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve(process.cwd(), 'public');
const svgPath = path.join(publicDir, 'favicon.svg');

async function generateIcons() {
  if (!fs.existsSync(svgPath)) {
    console.error('No se encontró public/favicon.svg');
    return;
  }

  const svgBuffer = fs.readFileSync(svgPath);

  // Generar 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('✔ Generado public/pwa-192x192.png');

  // Generar 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('✔ Generado public/pwa-512x512.png');

  // Generar Apple Touch Icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✔ Generado public/apple-touch-icon.png');
}

generateIcons().catch((err) => {
  console.error('Error al generar iconos PNG para PWA:', err);
});
