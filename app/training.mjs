export const categories = {
  hearing: { name: 'ヒアリング', description: '会話を通じて、困りごとや暮らしの変化を聞き取る。' },
  proposal: { name: '商品・サービス提案', description: 'お客様の状況に合った案内や、提案を控える判断を練習する。' },
};

export const skills = {
  rapport: { name: '関係構築力', practice: 'お客様の言葉に共感してから、その話題に沿った質問を一つ添えてみましょう。' },
  questioning: { name: '質問力', practice: '「どんな場所で」「どんなときに」など、答えを限定しない質問から始めましょう。' },
  listening: { name: '傾聴力', practice: '事情を聞いたら、助言をする前に「お忙しかったんですね」と受け止めてみましょう。' },
  needs: { name: 'ニーズ発見力', practice: '暮らしの変化を聞いたら、何か困りごとがあるかを確認してみましょう。' },
  judgment: { name: '状況判断力', practice: 'お客様がお急ぎのときは交換だけ済ませ、次回の訪問で話題を切り出してみましょう。' },
  proposal: { name: '提案力', practice: '家具の隙間や使う場所を確認し、条件に合う商品があるか確かめてみましょう。' },
  value: { name: '価値伝達力', practice: '商品の特徴を一つ選び、お客様がよく使う場面でどう役立つかを説明してみましょう。' },
};

export const questionsPerSet = 5;

export function validateQuestions(data) {
  if (!Array.isArray(data)) throw new Error('問題データが配列ではありません。');
  const ids = new Set();
  for (const question of data) {
    const { id, industry, audience, category, difficulty, scene, prompt, options, skills: targets, status } = question;
    const fields = [id, industry, audience, scene, prompt];
    if (fields.some((value) => typeof value !== 'string' || !value.trim()) ||
        ids.has(id) || !Object.hasOwn(categories, category) || difficulty !== 'beginner' ||
        !['approved', 'pending'].includes(status) || !Array.isArray(targets) || !targets.length ||
        new Set(targets).size !== targets.length || targets.some((key) => !Object.hasOwn(skills, key)) ||
        !Array.isArray(options) || options.length !== 4) {
      throw new Error('問題データの形式を確認してください。');
    }
    ids.add(id);
    const optionIds = new Set();
    for (const option of options) {
      if (!option.id || typeof option.id !== 'string' || optionIds.has(option.id) ||
          typeof option.text !== 'string' || !option.text.trim() ||
          typeof option.explanation !== 'string' || !option.explanation.trim() || ![0, 10, 20].includes(option.score)) {
        throw new Error(`${id} の選択肢データの形式を確認してください。`);
      }
      optionIds.add(option.id);
    }
    if (options.filter((option) => option.score === 20).length !== 1) {
      throw new Error(`${id} の完全正解は1つ必要です。`);
    }
  }
  return data;
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function questionsFor(bank, category, development) {
  return bank.filter((question) => question.category === category && question.audience === 'customer-staff' &&
    (question.status === 'approved' || development));
}

export function createQuestions(bank, category, development, random = Math.random) {
  const available = questionsFor(bank, category, development);
  if (available.length < questionsPerSet) throw new Error('利用できる問題が不足しています。');
  return shuffle(available, random).slice(0, questionsPerSet).map((question) => ({
    ...question, options: shuffle(question.options, random),
  }));
}

export function evaluate(questions, answers) {
  const items = questions.map((question, index) => {
    const chosen = question.options.find((option) => option.id === answers[index]);
    if (!chosen) throw new Error('すべての問題に回答してください。');
    return { question, chosen };
  });
  const score = items.reduce((sum, { chosen }) => sum + chosen.score, 0);
  const correct = items.filter(({ chosen }) => chosen.score === 20).length;
  const ratings = Object.fromEntries(Object.keys(skills).map((key) => {
    const related = items.filter(({ question }) => question.skills.includes(key));
    const earned = related.reduce((sum, { chosen }) => sum + chosen.score, 0);
    return [key, related.length ? Math.round(earned / (related.length * 20) * 100) : null];
  }));
  return { items, score, correct, accuracy: Math.round(correct / items.length * 100), ratings };
}

// V0.1 development defaults awaiting approval.
export function rewards(score) {
  return { xp: 50 + score, coins: 5 + Math.floor(score / 20) };
}

export function totals(history) {
  const xp = history.reduce((sum, entry) => sum + entry.xp, 0);
  const coins = history.reduce((sum, entry) => sum + entry.coins, 0);
  return { xp, coins, level: 1 + Math.floor(xp / 200), progress: xp % 200 };
}

export function feedback(category, ratings, available) {
  const ranked = Object.entries(ratings).filter(([, rating]) => rating !== null)
    .sort((a, b) => b[1] - a[1]);
  const strong = ranked.find(([, rating]) => rating >= 80);
  const weakest = ranked.at(-1);
  const other = available.find((key) => key !== category);
  const recommendation = weakest && weakest[1] >= 80 && other ? other : category;
  return {
    strength: strong ? `${skills[strong[0]].name}が今回の強みです（${strong[1]}点）。` : '今回の解説から、次の訪問で使えそうな言い回しを一つ選びましょう。',
    improvement: weakest ? skills[weakest[0]].practice : '',
    recommendation,
  };
}
