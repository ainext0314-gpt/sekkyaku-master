import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories, questionsFor, questionsPerSet, validateQuestions } from '../app/training.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [mode, source, ...extra] = process.argv.slice(2);
if (extra.length || (mode === 'public' && source) || (mode === 'trial' && !source) ||
    !['public', 'trial'].includes(mode)) {
  throw new Error('Usage: node scripts/build-app.mjs public | trial <approved-question-file>');
}

const outputName = mode === 'trial' ? 'private-dist' : 'dist';
const output = join(root, outputName);
let questions = [];
if (mode === 'trial') {
  questions = validateQuestions(JSON.parse(await readFile(source, 'utf8')));
  const categoryKeys = Object.keys(categories);
  if (questions.length !== categoryKeys.length * questionsPerSet ||
      categoryKeys.some((key) => questionsFor(questions, key, false).length !== questionsPerSet)) {
    throw new Error('The private preview requires five approved beginner questions in each category.');
  }
}
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

const staging = await mkdtemp(join(root, '.app-build-'));
try {
  for (const path of publicFiles) {
    const destination = join(staging, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, path), destination);
  }
  await mkdir(join(staging, 'data'));
  await writeFile(join(staging, 'data/questions.json'), JSON.stringify(questions) + '\n');
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  console.log(`Built ${outputName}/ with ${questions.length} questions.`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
