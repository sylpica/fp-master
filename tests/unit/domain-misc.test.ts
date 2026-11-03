import { describe, expect, it } from 'vitest';
import { lawBaseDateFor } from '../../src/domain/exam';
import { estimateReadiness } from '../../src/domain/readiness';
import { buildPlan } from '../../src/domain/plan';
import { dailyTrend, studyStreak, medianTimeMs } from '../../src/domain/stats';
import { scoreMock } from '../../src/domain/mock';
import { evaluate } from '../../src/ui/Calculator';

describe('法令基準日', () => {
  it('日本FP協会の試験日程どおり', () => {
    expect(lawBaseDateFor('2026-05-10')).toBe('2025-04-01');
    expect(lawBaseDateFor('2026-06-01')).toBe('2026-04-01');
    expect(lawBaseDateFor('2027-05-20')).toBe('2026-04-01');
    expect(lawBaseDateFor('2027-06-01')).toBe('2027-04-01');
    expect(lawBaseDateFor('2030-01-01')).toBeNull();
  });
});

describe('到達度', () => {
  const cov = { A: 0.5, B: 0.5, C: 0.5, D: 0.5, E: 0.5, F: 0.5 };
  it('データ不足では判定しない（合格確率を断定しない）', () => {
    const r = estimateReadiness({ recent: [], coverage: cov, mockRates: [], reviewCompletion: null, passRate: 0.6 });
    expect(r.level).toBe('insufficient');
    expect(r.score).toBeNull();
  });
  it('十分なデータがあればスコアと注意書きを出す', () => {
    const recent = Array.from({ length: 60 }, (_, i) => ({ field: (['A', 'B', 'C', 'D', 'E', 'F'] as const)[i % 6]!, correct: i % 5 !== 0 }));
    const r = estimateReadiness({ recent, coverage: cov, mockRates: [0.8], reviewCompletion: 1, passRate: 0.6 });
    expect(r.score).toBeGreaterThan(60);
    expect(r.notes.some((n) => n.includes('合格確率ではありません'))).toBe(true);
  });
});

describe('学習計画', () => {
  it('受験日までの日程・模擬試験・休日を生成する', () => {
    const p = buildPlan({ today: '2026-10-21', examDate: '2026-12-20', grade: 3, minutesPerDay: 30, daysPerWeek: 5, understanding: 2, weakFields: ['D'], poolSize: 300, learnedCount: 0 });
    expect(p.daysLeft).toBe(60);
    expect(p.days.filter((d) => d.kind === 'rest').length).toBeGreaterThan(10);
    expect(p.days.some((d) => d.kind === 'mock')).toBe(true);
    expect(p.days.filter((d) => d.kind === 'final')).toHaveLength(1);
    expect(p.dailyNew).toBeGreaterThan(0);
  });
  it('時間が足りない場合は警告する', () => {
    const p = buildPlan({ today: '2026-10-21', examDate: '2026-10-28', grade: 2, minutesPerDay: 5, daysPerWeek: 7, understanding: 1, weakFields: [], poolSize: 300, learnedCount: 0 });
    expect(p.warnings.length).toBeGreaterThan(0);
  });
});

describe('統計', () => {
  it('連続学習日数', () => {
    expect(studyStreak(new Set(['2026-10-19', '2026-10-20', '2026-10-21']), '2026-10-21')).toBe(3);
    expect(studyStreak(new Set(['2026-10-19', '2026-10-20']), '2026-10-21')).toBe(2);
    expect(studyStreak(new Set(['2026-10-18']), '2026-10-21')).toBe(0);
  });
  it('解答速度の中央値は外れ値を除く', () => {
    expect(medianTimeMs([{ timeMs: 1000 }, { timeMs: 3000 }, { timeMs: 999999 }])).toBe(2000);
  });
  it('日別推移は解答のない日を null にする', () => {
    const t = dailyTrend([], '2026-10-21', 3);
    expect(t.map((x) => x.rate)).toEqual([null, null, null]);
  });
  it('模擬試験の採点（3級学科：36点で合格）', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ field: 'A' as const, correct: i < 36 }));
    const s = scoreMock('g3', items);
    expect(s.score).toBe(36);
    expect(s.passed).toBe(true);
    expect(scoreMock('j3', Array.from({ length: 20 }, (_, i) => ({ field: 'A' as const, correct: i < 11 }))).score).toBe(55);
  });
});

describe('電卓', () => {
  it('四則演算・括弧・優先順位を厳密に計算する', () => {
    expect(evaluate('0.1+0.2').toDecimalString()).toBe('0.3');
    expect(evaluate('2+3×4').toDecimalString()).toBe('14');
    expect(evaluate('(2+3)×4').toDecimalString()).toBe('20');
    expect(evaluate('10÷4').toDecimalString()).toBe('2.5');
    expect(() => evaluate('2+')).toThrow();
  });
});

describe('「しばらく解いていない」フィルタ（ローカル日付で判定）', () => {
  it('UTC では30日前でも、日本時間では29日前の解答は対象にしない', async () => {
    const { applyFilter } = await import('../../src/domain/selection');
    const prevTz = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
    try {
      const q = { id: 'q1' } as unknown as import('../../src/domain/types').Question;
      const stat = (lastAt: string) => ({ attempts: 1, correct: 1, lastCorrect: true, lastUnsure: false, lastAt, due: null });
      const user = (lastAt: string) => ({ stats: new Map([['q1', stat(lastAt)]]), bookmarks: new Set<string>(), later: new Set<string>(), today: '2026-10-27', weakFields: [] });
      // 2026-09-27T20:00Z は日本時間 2026-09-28 05:00（今日 2026-10-27 から29日前）→ 対象外
      expect(applyFilter([q], 'stale', user('2026-09-27T20:00:00.000Z'))).toEqual([]);
      // 2026-09-27T10:00Z は日本時間 2026-09-27 19:00（30日前）→ 対象
      expect(applyFilter([q], 'stale', user('2026-09-27T10:00:00.000Z'))).toEqual([q]);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});
