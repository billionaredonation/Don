import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const SKIP_PREFIXES = ['loading-'];
const SKIP_FILES = new Set(['UkraineMap.avif']);

function isMapSourceFile(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) return false;
  if (SKIP_PREFIXES.some((prefix) => fileName.startsWith(prefix))) return false;

  return (
    fileName.endsWith('Map.png') ||
    fileName.endsWith('Map.jpg') ||
    fileName.endsWith('Map.jpeg') ||
    fileName.endsWith('Map.webp') ||
    ['Kharkiv.png', 'Kherson.png', 'Khmelnitskiy.png', 'IvanoFrankovsk.png', 'Kropivnitskyi.png', 'Lviv.png', 'Nikolaev.png', 'Odessa.png', 'Poltava.png', 'Rovno.png', 'Sumy.png', 'Ternopil.png', 'VinitsaMap.png', 'Zaporozya.png', 'ZutomyrMap.png'].includes(fileName)
  );
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function shouldConvert(sourcePath, targetPath) {
  if (!(await exists(targetPath))) return true;

  const [sourceInfo, targetInfo] = await Promise.all([
    stat(sourcePath),
    stat(targetPath),
  ]);

  return sourceInfo.mtimeMs > targetInfo.mtimeMs;
}

async function main() {
  let sharp;

  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('[prepare-avif-assets] sharp is not installed; skipping AVIF generation. Run npm install first.');
    return;
  }

  const files = await readdir(projectRoot);
  const sourceFiles = files.filter((fileName) => isMapSourceFile(fileName));

  let converted = 0;
  let skipped = 0;

  for (const fileName of sourceFiles) {
    const sourcePath = path.join(projectRoot, fileName);
    const targetFileName = `${path.basename(fileName, path.extname(fileName))}.avif`;
    const targetPath = path.join(projectRoot, targetFileName);

    if (SKIP_FILES.has(targetFileName)) {
      skipped += 1;
      continue;
    }

    if (!(await shouldConvert(sourcePath, targetPath))) {
      skipped += 1;
      continue;
    }

    await sharp(sourcePath, { limitInputPixels: false })
      .rotate()
      .avif({
        quality: 52,
        effort: 4,
        chromaSubsampling: '4:2:0',
      })
      .toFile(targetPath);

    converted += 1;
  }

  console.log(`[prepare-avif-assets] converted=${converted}, skipped=${skipped}`);
}

main().catch((error) => {
  console.warn('[prepare-avif-assets] AVIF generation skipped:', error?.message || error);
});
