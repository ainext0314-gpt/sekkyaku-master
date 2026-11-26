import { categories, skills, questionsPerSet, validateQuestions, questionsFor, createQuestions, evaluate, rewards, totals, feedback } from './training.mjs';
import { createHistoryStore } from './storage.mjs';

const screen = document.querySelector('#screen');
const localHosts = ['localhost', '127.0.0.1', '[::1]'];
const development = localHosts.includes(location.hostname) && new URLSearchParams(location.search).get('dev') === '1';
const trainingData = development ? './dev/questions.json' : './data/questions.json';
let bank = [];
let history = [];
const historyStore = createHistoryStore(development);
let session;
let dataError = false;
let storageError = false;

document.querySelector('#dev-badge').hidden = !development;
const brand = document.querySelector('[data-home]');
if (development) brand.href = '?dev=1';
brand.addEventListener('click', (event) => {
  event.preventDefault();
  home();
});

const completedDate = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function append(parent, ...children) {
  parent.append(...children);
  return parent;
}

function button(label, action, kind = 'primary') {
  const node = element('button', `button ${kind}`, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function show(title, label) {
  const head = element('div', 'page-heading');
  if (label) head.append(element('p', 'overline', label));
  const heading = element('h1', '', title);
  heading.tabIndex = -1;
  head.append(heading);
  screen.replaceChildren(head);
  screen.setAttribute('aria-busy', 'false');
  heading.focus();
}

function metric(label, value) {
  return append(element('div', 'metric'), element('span', '', label), element('strong', '', value));
}

function panel(title, className = '') {
  return append(element('section', `panel ${className}`), element('h2', '', title));
}

function actions(...buttons) {
  return append(element('div', 'actions'), ...buttons);
}

function availableCategories() {
  return Object.keys(categories).filter((key) => questionsFor(bank, key, development).length >= questionsPerSet);
}

function updateHomeProgress() {
  const overview = screen.querySelector('#home-progress');
  if (!overview) return;
  const stats = totals(history);
  const progress = element('progress');
  progress.max = 200;
  progress.value = stats.progress;
  progress.setAttribute('aria-label', '次のレベルまでの経験値');
  overview.replaceChildren(element('h2', '', '学習の進捗'),
    append(element('div', 'metrics'), metric('レベル', stats.level), metric('経験値', `${stats.xp} XP`), metric('コイン', stats.coins)),
    progress, element('p', 'muted', `次のレベルまで ${200 - stats.progress} XP`));
}

function home() {
  session = undefined;
  show('今日の接客を、少し上手に。', 'お客様係のための接客研修');
  const overview = element('section', 'panel overview');
  overview.id = 'home-progress';
  append(screen, overview, actions(button('研修を始める', selectTraining), button('学習履歴', showHistory, 'secondary')));
  updateHomeProgress();
  if (storageError) screen.append(element('p', 'notice', 'このブラウザーでは履歴を保存できません。保存を許可すると研修を記録できます。'));
}

function selectTraining() {
  session = undefined;
  show('研修を選ぶ', 'お客様係・初級');
  const available = availableCategories();
  if (dataError) screen.append(element('p', 'notice', '問題を読み込めませんでした。接続を確認し、ページを再読み込みしてください。'));
  else if (!available.length) screen.append(element('p', 'notice', 'この環境で利用できる研修は準備中です。'));
  const choices = element('div', 'category-grid');
  for (const [key, category] of Object.entries(categories)) {
    const card = panel(category.name, 'category');
    const start = button(`${category.name}を始める`, () => startTraining(key));
    start.disabled = !available.includes(key);
    append(card, element('p', '', category.description), element('p', 'muted', '5問・4択・約3〜5分'), start);
    choices.append(card);
  }
  append(screen, choices, actions(button('ホームへ戻る', home, 'secondary')));
}

function startTraining(category) {
  if (!availableCategories().includes(category)) return;
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() :
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  session = { id, category, questions: createQuestions(bank, category, development), answers: [] };
  showQuestion();
}

function showQuestion() {
  const current = session;
  const index = current.answers.length;
  const question = current.questions[index];
  show(`問題 ${index + 1} / ${questionsPerSet}`, categories[current.category].name);
  const progress = element('progress', 'question-progress');
  progress.max = questionsPerSet;
  progress.value = index + 1;
  progress.setAttribute('aria-label', '問題の進捗');
  const form = element('form', 'panel');
  const fieldset = element('fieldset');
  const legend = element('legend', '', question.prompt);
  const options = element('div', 'options');
  for (const option of question.options) {
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'option';
    radio.value = option.id;
    append(options, append(element('label', 'option'), radio, element('span', '', option.text)));
  }
  append(fieldset, legend, options);
  const confirm = element('button', 'button primary', '回答を確定する');
  confirm.type = 'submit';
  confirm.disabled = true;
  form.addEventListener('change', () => { confirm.disabled = false; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const choice = new FormData(form).get('option');
    if (session !== current || current.answers.length !== index || !question.options.some((option) => option.id === choice)) return;
    current.answers.push(choice);
    if (current.answers.length === current.questions.length) {
      current.result = evaluate(current.questions, current.answers);
      current.earned = rewards(current.result.score);
      current.attempt = {
        id: current.id, category: current.category, completedAt: new Date().toISOString(),
        score: current.result.score, ...current.earned,
      };
      persist(current);
    }
    showExplanation(index);
  });
  append(form, element('p', 'scene', question.scene), fieldset, confirm);
  append(screen, progress, form);
}

function showExplanation(index) {
  const current = session;
  const question = current.questions[index];
  const choice = question.options.find((option) => option.id === current.answers[index]);
  show('回答と解説', `問題 ${index + 1} / ${questionsPerSet}・${categories[current.category].name}`);
  const options = element('ol', 'explanations');
  for (const option of question.options) {
    const item = element('li', option.id === choice.id ? 'chosen' : '');
    const label = option.id === choice.id ? 'あなたの回答' : '';
    const score = element('span', 'points', `${option.score}点`);
    append(item, append(element('div', 'option-header'), element('strong', '', option.text), score));
    if (label) item.append(element('span', 'badge', label));
    item.append(element('p', '', option.explanation));
    options.append(item);
  }
  const last = index + 1 === current.questions.length;
  const next = button(last ? '総合評価を見る' : '次の問題へ', () => {
    if (session !== current || !next.isConnected) return;
    if (last) finish(current);
    else showQuestion();
  });
  append(screen, append(panel(`この問題は ${choice.score} / 20点`), options), actions(next));
}

function persist(current) {
  current.persistence ??= (async () => {
    await historyStore.save(current.attempt);
    storageError = false;
    try {
      history = await historyStore.list();
    } catch (error) {
      console.warn('保存した履歴の読み取りに失敗しました。', error);
      if (!history.some((entry) => entry.id === current.id)) history = [current.attempt, ...history];
    }
    updateHomeProgress();
    return true;
  })().catch((error) => {
    console.warn('履歴の保存に失敗しました。', error);
    current.persistence = undefined;
    return false;
  });
  return current.persistence;
}

async function finish(current) {
  if (current.finishing) return;
  current.finishing = true;
  show('総合評価', categories[current.category].name);
  screen.append(element('p', 'muted', '結果を集計しています…'));
  const saved = await persist(current);
  current.finishing = false;
  if (session === current) showResults(current, current.result, current.earned, saved);
}

function drawRadar(canvas, ratings) {
  const angles = Object.keys(skills).map((_, index) => index * 2 * Math.PI / Object.keys(skills).length - Math.PI / 2);
  const size = 300;
  const center = size / 2;
  const radius = 105;
  const scale = window.devicePixelRatio || 1;
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  const point = (angle, ratio) => [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  function line(points, close = false) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (close) ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = '#b8cfe1';
  for (const ratio of [0.25, 0.5, 0.75, 1]) line(angles.map((angle) => point(angle, ratio)), true);
  angles.forEach((angle) => line([[center, center], point(angle, 1)]));
  const values = Object.values(ratings);
  angles.forEach((angle, index) => {
    const rating = values[index];
    const next = (index + 1) % values.length;
    if (rating !== null && values[next] !== null) {
      ctx.strokeStyle = '#13629b';
      ctx.lineWidth = 2;
      line([point(angle, rating / 100), point(angles[next], values[next] / 100)]);
    }
    const [x, y] = point(angle, rating === null ? 1 : rating / 100);
    ctx.beginPath();
    ctx.arc(x, y, rating === null ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = rating === null ? '#fff' : '#13629b';
    ctx.fill();
    if (rating === null) {
      ctx.strokeStyle = '#627e96';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const [lx, ly] = point(angle, 1.22);
    ctx.fillStyle = '#233e57';
    ctx.font = 'bold 15px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), lx, ly);
  });
}

function showResults(current, result, earned, saved) {
  show('総合評価', categories[current.category].name);
  const scorecard = panel('今回の結果');
  append(scorecard, append(element('div', 'metrics'),
    metric('総得点', `${result.score} / 100`), metric('正答率', `${result.accuracy}%`), metric('完全正解', `${result.correct} / 5`)));
  if (saved) scorecard.append(element('p', 'reward', `獲得 ${earned.xp} XP・${earned.coins} コイン`));
  else append(scorecard, element('p', 'notice', '結果を端末に保存できませんでした。経験値とコインは履歴を保存すると反映されます。'),
    button('保存を再試行', () => finish(current), 'secondary'));
  const reviewed = panel('問題別の結果');
  const answers = element('ol', 'results-list');
  result.items.forEach(({ question, chosen }) => {
    const item = element('li');
    const details = element('details');
    const summary = append(element('summary'), element('span', '', question.prompt), element('strong', 'points', `${chosen.score}点`));
    append(details, summary, element('p', '', chosen.text), element('p', 'muted', chosen.explanation));
    answers.append(append(item, details));
  });
  reviewed.append(answers);
  const bySkill = panel('スキル別評価');
  const radar = element('canvas', 'radar');
  radar.setAttribute('role', 'img');
  radar.setAttribute('aria-label', 'スキル別評価のレーダーチャート。白抜きの点は未評価です。評価の数値は一覧にあります。');
  const skillList = element('ol', 'skill-list');
  Object.entries(skills).forEach(([key, skill]) => {
    const rating = result.ratings[key];
    append(skillList, append(element('li'), element('span', '', skill.name), element('strong', '', rating === null ? '未評価' : `${rating}点`)));
  });
  append(bySkill, element('p', 'muted', '今回出題された問題から算出した参考値です。白抜きの点は未評価です。'),
    append(element('div', 'skill-layout'), radar, skillList));
  const advice = feedback(current.category, result.ratings, availableCategories());
  const next = panel('次の接客に向けて');
  append(next, element('h3', '', '今回の強み'), element('p', '', advice.strength),
    element('h3', '', result.score === 100 ? '応用練習' : '改善のヒント'), element('p', '', advice.improvement),
    element('h3', '', 'おすすめ研修'),
    button(categories[advice.recommendation].name, () => startTraining(advice.recommendation), 'secondary'));
  append(screen, scorecard, reviewed, bySkill, next,
    actions(button('再挑戦する', () => startTraining(current.category)), button('ホームへ戻る', home, 'secondary')));
  drawRadar(radar, result.ratings);
}

async function showHistory() {
  show('学習履歴');
  const heading = screen.querySelector('h1');
  let readError = false;
  try {
    history = await historyStore.list();
  } catch {
    readError = true;
  }
  if (!heading.isConnected) return;
  if (readError) screen.append(element('p', 'notice', 'この端末の履歴を読み取れませんでした。'));
  else if (!history.length) screen.append(element('p', 'notice', '研修を完了すると、ここに学習履歴が表示されます。'));
  else {
    const list = element('ul', 'history');
    for (const entry of history) {
      const time = element('time', 'muted', completedDate.format(new Date(entry.completedAt)));
      time.dateTime = entry.completedAt;
      append(list, append(element('li', 'panel'), append(element('div'), time, element('h2', '', categories[entry.category].name)),
        element('strong', 'points', `${entry.score} / 100点`)));
    }
    screen.append(list);
  }
  screen.append(actions(button('ホームへ戻る', home, 'secondary')));
}

const loadBank = fetch(trainingData).then((response) => {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}).then(validateQuestions).then((data) => { bank = data; }).catch((error) => {
  console.warn('問題データを読み込めませんでした。', error);
  dataError = true;
});
const loadHistory = historyStore.list().then((entries) => {
  history = entries;
}).catch((error) => {
  console.warn('履歴を読み込めませんでした。', error);
  storageError = true;
});

Promise.all([loadBank, loadHistory]).then(home);
if (!development && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('PWA を登録できませんでした。', error));
}
