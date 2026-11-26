import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { IDBFactory } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { getHistory, openHistory } from '../app/storage.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const categories = { hearing: 'ヒアリング', proposal: '商品・サービス提案' };
const bank = Object.keys(categories).flatMap((category) =>
  Array.from({ length: 5 }, (_, index) => {
    const id = `${category}-${index}`;
    return {
      id, industry: 'example', audience: 'customer-staff', category, difficulty: 'beginner',
      scene: 'お客様との架空の会話', prompt: `お客様にどう答えますか？ (${index + 1})`,
      skills: [category === 'hearing' ? 'listening' : 'proposal'], status: 'pending',
      options: [20, 10, 10, 0].map((score, choice) => ({
        id: `${id}-${choice}`, text: `架空の選択肢 ${choice + 1}`,
        explanation: `選択肢 ${choice + 1} の解説`, score,
      })),
    };
  }));

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(10);
  }
  assert.fail(message);
}

test('training screens complete both sets and preserve the final answer after reload', async (context) => {
  const database = new IDBFactory();
  const overrides = ['window', 'document', 'location', 'navigator', 'FormData', 'indexedDB', 'fetch'];
  const original = Object.fromEntries(overrides.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const windows = [];
  context.after(() => {
    for (const window of windows) window.close();
    for (const [key, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  let document;
  let requestedPath;
  let registrations;
  const select = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];

  async function startPage(url, publishedBank = []) {
    const { window } = new JSDOM(html, { url });
    windows.push(window);
    document = window.document;
    window.HTMLCanvasElement.prototype.getContext = () => null;
    registrations = [];
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: { register: async (path) => registrations.push(path) },
    });
    const fetch = async (path) => {
      requestedPath = path;
      return Response.json(path === './dev/questions.json' ? bank : publishedBank);
    };
    const bindings = {
      window, document, location: window.location, navigator: window.navigator,
      FormData: window.FormData, indexedDB: database, fetch,
    };
    for (const [key, value] of Object.entries(bindings)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    await import(new URL(`../app/ui.mjs?page=${windows.length}`, import.meta.url));
    await waitFor(() => select('h1'), 'ホームが表示されない');
  }

  function button(label) {
    const target = all('button').find((node) => node.textContent === label);
    assert.ok(target, `「${label}」ボタンが見つからない`);
    return target;
  }

  function answerSet(category, scores) {
    const seen = new Set();
    scores.forEach((score, index) => {
      assert.equal(select('h1').textContent, `問題 ${index + 1} / 5`);
      const options = all('input[type="radio"]');
      assert.equal(options.length, 4);
      const question = bank.find((entry) => entry.options.some((option) => option.id === options[0].value));
      assert.equal(question.category, category);
      seen.add(question.id);
      const confirm = button('回答を確定する');
      assert.equal(confirm.disabled, true);
      const answer = question.options.find((option) => option.score === score);
      options.find((option) => option.value === answer.id).click();
      assert.equal(confirm.disabled, false);
      confirm.click();
      assert.equal(select('h1').textContent, '回答と解説');
      assert.equal(all('.explanations li').length, 4);
      assert.match(select('.explanations .chosen').textContent, new RegExp(`${score}点`));
      for (const option of question.options) {
        assert.ok(all('.explanations li').some((item) => item.textContent.includes(option.explanation)));
      }
      if (index < scores.length - 1) button('次の問題へ').click();
    });
    assert.equal(seen.size, 5);
  }

  await startPage('http://localhost:4173/?dev=1');
  assert.equal(requestedPath, './dev/questions.json');
  assert.deepEqual(registrations, []);
  button('研修を始める').click();
  button('ヒアリングを始める').click();
  answerSet('hearing', [20, 20, 20, 20, 20]);
  const result = button('総合評価を見る');
  result.click();
  result.click();
  await waitFor(() => select('.reward'), '報酬が表示されない');
  assert.equal(select('.reward').textContent, '獲得 150 XP・10 コイン');
  assert.match(select('.metrics').textContent, /100%/);
  assert.equal(all('.results-list li').length, 5);
  assert.ok(all('.skill-list li').some((node) => node.textContent.includes('未評価')));
  assert.ok(all('h3').some((node) => node.textContent === '応用練習'));

  button('商品・サービス提案').click();
  answerSet('proposal', [20, 10, 0, 20, 10]);
  const historyDb = await openHistory(true);
  context.after(() => historyDb.close());
  await waitFor(async () => (await getHistory(historyDb)).length === 2, '総合評価前に受講結果が保存されなかった');

  await startPage('http://localhost:4173/?dev=1');
  assert.match(select('.metrics').textContent, /260 XP/);
  button('学習履歴').click();
  await waitFor(() => all('.history li').length === 2, '再読み込み後の履歴が表示されない');
  assert.deepEqual(all('.history .points').map((node) => node.textContent).sort(), ['100 / 100点', '60 / 100点']);

  await startPage('https://training.example/?dev=1');
  assert.equal(requestedPath, './data/questions.json');
  assert.deepEqual(registrations, ['./sw.js']);
  assert.equal(select('#dev-badge').hidden, true);
  assert.match(select('.metrics').textContent, /0 XP/);
  button('研修を始める').click();
  assert.equal(all('.category button:disabled').length, 2);

  const partiallyApproved = bank.map((question) => question.category === 'hearing'
    ? { ...question, status: 'approved' } : question);
  await startPage('https://training.example/', partiallyApproved);
  button('研修を始める').click();
  assert.equal(button('ヒアリングを始める').disabled, false);
  assert.equal(button('商品・サービス提案を始める').disabled, true);
});
