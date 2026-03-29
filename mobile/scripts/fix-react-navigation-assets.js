const fs = require('fs');
const path = require('path');

const assetsDirectory = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-navigation',
  'elements',
  'lib',
  'module',
  'assets',
);

const fileNames = [
  'back-icon.png',
  'back-icon-mask.png',
  'clear-icon.png',
  'close-icon.png',
  'search-icon.png',
];

const transparentPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0KsAAAAASUVORK5CYII=';

function ensureAssets() {
  fs.mkdirSync(assetsDirectory, { recursive: true });

  const pngBuffer = Buffer.from(transparentPngBase64, 'base64');

  for (const fileName of fileNames) {
    const fullPath = path.join(assetsDirectory, fileName);

    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, pngBuffer);
    }
  }
}

ensureAssets();
