import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isDue, review, ratingFromAnswer } from '../../src/domain/srs';

describe('SM-2 復習間隔', () => {
  const today = '2026-10-20';
  it('初回正解は2日後、2回目は6日後、以降は EF 倍', () => {
    const s1 = review(undefined, 'good', today);
    expect(s1.interval).toBe(2);
    expect(s1.due).toBe('2026-10-22');
    const s2 = review(s1, 'good', s1.due);
    expect(s2.interval).toBe(6);
    const s3 = review(s2, 'good', s2.due);
    expect(s3.interval).toBe(Math.round(6 * s2.ease));
  });
  it('不正解で間隔は1日に戻り、失敗回数が増え、EFが下がる', () => {
    const s1 = review(review(undefined, 'good', today), 'good', today);
    const s2 = review(s1, 'again', today);
    expect(s2.interval).toBe(1);
    expect(s2.reps).toBe(0);
    expect(s2.lapses).toBe(1);
    expect(s2.ease).toBeLessThan(s1.ease);
  });
  it('EF は 1.3 を下回らない', () => {
    let s = review(undefined, 'again', today);
    for (let i = 0; i < 20; i++) s = review(s, 'again', today);
    expect(s.ease).toBe(1.3);
  });
  it('間隔は365日を超えない', () => {
    let s = review(undefined, 'easy', today);
    for (let i = 0; i < 30; i++) s = review(s, 'easy', s.due);
    expect(s.interval).toBeLessThanOrEqual(365);
  });
  it('自信なしの正解は hard', () => {
    expect(ratingFromAnswer(true, true)).toBe('hard');
    expect(ratingFromAnswer(true, false)).toBe('good');
    expect(ratingFromAnswer(false, false)).toBe('again');
  });
  it('期限判定と日付計算', () => {
    const s = review(undefined, 'good', today);
    expect(isDue(s, '2026-10-21')).toBe(false);
    expect(isDue(s, '2026-10-22')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-10-20', '2027-01-20')).toBe(92);
  });
});

describe('同じ日の再解答（詰め込みで復習間隔を伸ばさない）', () => {
  const today = '2026-10-20';
  it('同じ日に2回正解しても、1回目の正解と同じ間隔（2日）のまま', () => {
    const s1 = review(undefined, 'good', today);
    const s2 = review(s1, 'good', today);
    expect(s2).toEqual(s1);
    expect(s2.due).toBe('2026-10-22');
  });
  it('同じ日でも不正解なら間隔は1日に戻る', () => {
    const s1 = review(undefined, 'good', today);
    const s2 = review(s1, 'again', today);
    expect(s2.interval).toBe(1);
    expect(s2.reps).toBe(0);
  });
  it('同じ日に不正解のあと正解した場合は、初回正解として扱う（2日後）', () => {
    const s1 = review(undefined, 'again', today);
    const s2 = review(s1, 'good', today);
    expect(s2.reps).toBe(1);
    expect(s2.interval).toBe(2);
  });
  it('翌日以降の正解は従来どおり間隔が伸びる', () => {
    const s1 = review(undefined, 'good', today);
    const s2 = review(s1, 'good', '2026-10-22');
    expect(s2.interval).toBe(6);
  });
});
