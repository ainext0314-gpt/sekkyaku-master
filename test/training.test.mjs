import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuestions, evaluate, feedback, questionsFor, rewards, totals, validateQuestions } from '../app/training.mjs';

function makeQuestion(id, category, skill, status = 'approved') {
  return {
    id, industry: 'example', audience: 'customer-staff', category, difficulty: 'beginner',
    scene: '場面設定', prompt: 'どう返事をしますか？', skills: [skill], status,
    options: [20, 10, 10, 0].map((score, index) => ({
      id: `${id}-${index}`, score, text: `回答${index}`, explanation: `解説${index}`,
    })),
  };
}

const bank = Object.keys({ hearing: 1, proposal: 1 }).flatMap((category) =>
  ['rapport', 'listening', 'rapport', 'judgment', 'judgment'].map((skill, index) =>
    makeQuestion(`${category}-${index}`, category, skill, index === 0 ? 'pending' : 'approved')));

test('five unique questions and four choices in each category; pending questions stay in development', () => {
  validateQuestions(bank);
  for (const category of ['hearing', 'proposal']) {
    assert.equal(questionsFor(bank, category, false).length, 4);
    assert.throws(() => createQuestions(bank, category, false));
    const selected = createQuestions(bank, category, true, () => 0);
    assert.equal(new Set(selected.map((question) => question.id)).size, 5);
    assert.ok(selected.every((question) => question.category === category && question.options.length === 4));
    assert.notEqual(selected[0].id, questionsFor(bank, category, true)[0].id);
  }
});

test('answer IDs retain their scores and explanations after question and option shuffling', () => {
  const scores = [20, 10, 0, 20, 10];
  const selected = createQuestions(bank, 'hearing', true, () => 0);
  assert.notEqual(selected[0].options[0].score, 20);
  const answers = selected.map((question) => {
    const source = bank.find((item) => item.id === question.id);
    const index = Number(question.id.split('-').at(-1));
    return source.options.find((option) => option.score === scores[index]).id;
  });
  const result = evaluate(selected, answers);
  assert.equal(result.score, 60);
  assert.equal(result.correct, 2);
  assert.equal(result.accuracy, 40);
  assert.equal(result.ratings.rapport, 50);
  const zero = evaluate(selected, selected.map((question) => question.options.find((option) => option.score === 0).id));
  assert.equal(zero.ratings.rapport, 0);
  assert.equal(zero.ratings.needs, null);
  for (const { question, chosen } of result.items) {
    const expected = bank.find((item) => item.id === question.id).options.find((option) => option.id === chosen.id);
    assert.deepEqual(chosen, expected);
  }
});

test('completion earns rewards at zero and full marks include a practice example', () => {
  assert.deepEqual(rewards(0), { xp: 50, coins: 5 });
  assert.deepEqual(totals([rewards(100), rewards(0)]), { xp: 200, coins: 15, level: 2, progress: 0 });
  const selected = createQuestions(bank, 'hearing', true);
  const result = evaluate(selected, selected.map((question) => question.options.find((option) => option.score === 20).id));
  assert.equal(result.score, 100);
  const advice = feedback('hearing', result.ratings, ['hearing', 'proposal']);
  assert.equal(advice.recommendation, 'proposal');
  assert.ok(advice.improvement.length > 0);
});
