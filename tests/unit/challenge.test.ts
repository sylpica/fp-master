import { describe, expect, it } from 'vitest';
import { CHALLENGE_MIN_FIRST, challengeStats } from '../../src/domain/challenge';
import { selectQuestions, topicMastery, type UserState } from '../../src/domain/selection';
import type { Question } from '../../src/domain/types';

function q(id: string, level: number | undefined, topic: string, field: Question['field'] = 'A', kind: 'original' | 'official' = 'original'): Question {
  return {
    id,
    exam: 'g2',
    field,
    theme: 'テスト',
    source:
      kind === 'original'
        ? { kind: 'original', author: 'x', basis: [{ title: 't', url: 'https://example.com/' }] }
        : { kind: 'official', citation: 'c', yearMonth: '2025-01', number: 1, url: 'https://example.com/', modified: false },
    lawBaseDate: '2026-04-01',
    stem: id,
    parts: [{ kind: 'choice', id: 'p1', choices: [{ id: '1', text: 'a' }, { id: '2', text: 'b' }], answer: '1' }],
    requiresCalculation: false,
    status: 'verified',
    level: level as Question['level'],
    topic,
  };
}

const user = (stats: UserState['stats'] = new Map()): UserState => ({ stats, bookmarks: new Set(), later: new Set(), today: '2026-10-27', weakFields: [] });
const cfg = { exams: ['g2' as const], count: 100, filter: 'all' as const, includeCalc: false, order: 'random' as const };

describe('95%チャレンジの分析', () => {
  const pool = [q('a', 5, 'A1-1'), q('b', 4, 'A1-1'), q('c', 2, 'A1-2', 'B'), q('d', 5, 'A1-2', 'B')];

  it('初見と復習を区別する（繰り返しで上がった正答率を初見と混同しない）', () => {
    const at = (n: number) => `2026-10-0${n}T00:00:00Z`;
    const s = challengeStats(pool, [
      { itemId: 'a', correct: false, at: at(1) },
      { itemId: 'a', correct: true, at: at(2) },
      { itemId: 'a', correct: true, at: at(3) },
      { itemId: 'b', correct: true, at: at(1) },
    ]);
    expect(s.all).toMatchObject({ attempts: 4, correct: 3 });
    expect(s.first).toMatchObject({ attempts: 2, correct: 1, rate: 0.5 });
    expect(s.review).toMatchObject({ attempts: 2, correct: 2 });
    expect(s.hardFirst).toMatchObject({ attempts: 2, correct: 1 });
    expect(s.topFirst).toMatchObject({ attempts: 1, correct: 0 });
    expect(s.gapPoints).toBe(45);
  });

  it('履歴がなければ初見率は未計測（null）で、目標との差も出さない', () => {
    const s = challengeStats(pool, []);
    expect(s.first.rate).toBeNull();
    expect(s.gapPoints).toBeNull();
    expect(s.weakTopics.map((t) => t.key).sort()).toEqual(['A1-1', 'A1-2']);
  });

  it('初見が少数で偶然100%でも「達成」判定に使わない（初見100問未満は reliable=false）', () => {
    const few = challengeStats(pool, [{ itemId: 'a', correct: true, at: '2026-10-01T00:00:00Z' }]);
    expect(few.first.rate).toBe(1);
    expect(few.gapPoints).toBeLessThanOrEqual(0);
    expect(few.reliable).toBe(false);
    expect(CHALLENGE_MIN_FIRST).toBe(100);
    const big = Array.from({ length: CHALLENGE_MIN_FIRST }, (_, i) => q(`x${i}`, 3, 'A1-1'));
    const at = (i: number) => new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString();
    const s = challengeStats(big, big.map((x, i) => ({ itemId: x.id, correct: i >= 5, at: at(i) })));
    expect(s.first).toMatchObject({ attempts: 100, correct: 95, rate: 0.95 });
    expect(s.gapPoints).toBe(0);
    expect(s.reliable).toBe(true);
  });

  it('対象外の問題の履歴は無視する', () => {
    const s = challengeStats(pool, [{ itemId: 'zzz', correct: true, at: '2026-10-01T00:00:00Z' }]);
    expect(s.all.attempts).toBe(0);
  });

  it('習得度の低い論点が先に並ぶ', () => {
    const s = challengeStats(pool, [
      { itemId: 'a', correct: true, at: '2026-10-01T00:00:00Z' },
      { itemId: 'b', correct: true, at: '2026-10-01T00:00:00Z' },
    ]);
    expect(s.weakTopics[0]!.key).toBe('A1-2');
    expect(s.weakTopics.find((t) => t.key === 'A1-1')).toBeUndefined();
  });
});

describe('難易度・出典・優先出題の絞り込み', () => {
  const pool = [q('l5', 5, 'A1-1'), q('l4', 4, 'A1-1'), q('l2', 2, 'A1-2'), q('off', undefined, 'A1-2', 'A', 'official')];

  it('levels 指定ではその難易度のオリジナル問題だけ（公式は難易度未分類のため除外）', () => {
    const r = selectQuestions(pool, { ...cfg, levels: [5] }, user(), 1);
    expect(r.map((x) => x.id)).toEqual(['l5']);
    const r2 = selectQuestions(pool, { ...cfg, levels: [4, 5] }, user(), 1);
    expect(r2.map((x) => x.id).sort()).toEqual(['l4', 'l5']);
  });

  it('sourceKind で公式／オリジナルに絞れる', () => {
    expect(selectQuestions(pool, { ...cfg, sourceKind: 'official' }, user(), 1).map((x) => x.id)).toEqual(['off']);
    expect(selectQuestions(pool, { ...cfg, sourceKind: 'original' }, user(), 1)).toHaveLength(3);
  });

  it('focus=hard は難易度の高い順に先頭へ出す', () => {
    const r = selectQuestions(pool, { ...cfg, focus: 'hard', count: 3 }, user(), 7);
    expect(r.map((x) => x.id)).toEqual(['l5', 'l4', 'l2']);
  });

  it('focus=unmastered は習得済みの論点より未習得の論点を先に出す', () => {
    const stats: UserState['stats'] = new Map([
      ['l5', { attempts: 1, correct: 1, lastCorrect: true, lastUnsure: false, lastAt: 'x', due: null }],
      ['l4', { attempts: 1, correct: 1, lastCorrect: true, lastUnsure: false, lastAt: 'x', due: null }],
    ]);
    const u = user(stats);
    expect(topicMastery(pool, u).get('A1-1')).toBe(1);
    const r = selectQuestions(pool, { ...cfg, focus: 'unmastered', count: 2 }, u, 3);
    expect(r.map((x) => x.id).sort()).toEqual(['l2', 'off']);
  });
});
