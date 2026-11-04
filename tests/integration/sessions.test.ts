import { beforeEach, describe, expect, it } from 'vitest';
import { db, type StudySession } from '../../src/db/db';
import { commitAnswer } from '../../src/state/sessions';
import type { Question } from '../../src/domain/types';

const q = {
  id: 'test-q1',
  exam: 'g2',
  field: 'A',
  theme: 'テスト',
  source: { kind: 'original', author: 'test', basis: [{ title: 't', url: 'https://example.com/' }] },
  lawBaseDate: '2026-04-01',
  stem: 'テスト問題',
  parts: [{ kind: 'truefalse', id: 'p1', answer: true }],
  requiresCalculation: false,
  status: 'verified',
} as Question;

function session(): StudySession {
  const now = new Date().toISOString();
  return {
    id: 's1',
    kind: 'practice',
    title: 't',
    config: {},
    itemIds: [q.id],
    answers: { [q.id]: { responses: { p1: { kind: 'truefalse', value: true } }, correct: true, unsure: false, timeMs: 1000 } },
    flagged: [],
    index: 0,
    startedAt: now,
    updatedAt: now,
  };
}

describe('解答の確定（学習履歴の二重記録の防止）', () => {
  beforeEach(async () => {
    await Promise.all([db.sessions.clear(), db.attempts.clear(), db.srs.clear()]);
  });

  it('「次の問題へ」の連打で同じ解答の確定が同時に2回呼ばれても、履歴と復習間隔は1回分だけ更新される', async () => {
    const s = session();
    await db.sessions.put(s);
    const [a, b] = await Promise.all([commitAnswer(s, q, 'practice'), commitAnswer(s, q, 'practice')]);
    expect(a.answers[q.id]!.committed).toBe(true);
    expect(b.answers[q.id]!.committed).toBe(true);
    expect(await db.attempts.count()).toBe(1);
    const srs = await db.srs.get(`q:${q.id}`);
    expect(srs?.reps).toBe(1);
    expect((await db.sessions.get(s.id))!.answers[q.id]!.committed).toBe(true);
  });

  it('確定済みの解答を古い状態のセッションから再度確定しようとしても記録しない', async () => {
    const s = session();
    await db.sessions.put(s);
    await commitAnswer(s, q, 'practice');
    await commitAnswer(s, q, 'practice'); // s は committed を持たない古いオブジェクト
    expect(await db.attempts.count()).toBe(1);
  });
});
