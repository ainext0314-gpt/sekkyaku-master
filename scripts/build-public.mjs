import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const publicFiles = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'app/storage.mjs',
  'app/training.mjs',
  'app/ui.mjs',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

const staging = await mkdtemp(join(root, '.public-build-'));
try {
  for (const path of publicFiles) {
    const destination = join(staging, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, path), destination);
  }
  await mkdir(join(staging, 'data'));
  await writeFile(join(staging, 'data/questions.json'), '[]\n');
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log('Built dist/ with an empty question bank.');
} finally {
  await rm(staging, { recursive: true, force: true });
}
