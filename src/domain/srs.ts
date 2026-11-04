/**
 * 間隔反復（SM-2 方式）。
 * 採用理由は docs/DECISIONS.md（D-005）参照。日単位で次回復習日を管理する。
 */

export interface SrsState {
  /** 易しさ係数（EF）。初期値 2.5、下限 1.3 */
  ease: number;
  /** 現在の復習間隔（日） */
  interval: number;
  /** 連続成功回数 */
  reps: number;
  /** 忘却（失敗）回数 */
  lapses: number;
  /** 次回復習日 YYYY-MM-DD */
  due: string;
  /** 最終学習日 YYYY-MM-DD */
  last: string;
}

/**
 * 自己評価（0〜5 の SM-2 品質値に対応）
 * again: 不正解・覚えていない(1) / hard: 正解だが自信なし・曖昧(3)
 * good: 正解(4) / easy: 即答で正解・覚えた(5)
 */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

const QUALITY: Record<Rating, number> = { again: 1, hard: 3, good: 4, easy: 5 };
export const MAX_INTERVAL_DAYS = 365;

export function initialSrs(today: string): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today, last: today };
}

export function review(prev: SrsState | undefined, rating: Rating, today: string): SrsState {
  const s = prev ?? initialSrs(today);
  const q = QUALITY[rating];
  // 同じ日に正解済みの問題をもう一度正解しても、復習間隔は伸ばさない（詰め込みで次回復習が先送りされるのを防ぐ。
  // 記憶の定着は日をまたいだ想起で判断する）。同じ日の不正解は従来どおり間隔を1日に戻す。
  if (prev && prev.last === today && prev.reps > 0 && q >= 3) return { ...prev };
  let { ease, interval, reps, lapses } = s;

  if (q < 3) {
    reps = 0;
    lapses += 1;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = rating === 'hard' ? 1 : rating === 'easy' ? 4 : 2;
    else if (reps === 2) interval = rating === 'hard' ? 3 : 6;
    else interval = Math.round(interval * ease * (rating === 'hard' ? 0.8 : 1));
  }
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(1.3, Math.round(ease * 100) / 100);
  interval = Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval));

  return { ease, interval, reps, lapses, due: addDays(today, interval), last: today };
}

/** 問題演習の結果から評価を決める */
export function ratingFromAnswer(correct: boolean, unsure: boolean): Rating {
  if (!correct) return 'again';
  return unsure ? 'hard' : 'good';
}

export function isDue(s: SrsState | undefined, today: string): boolean {
  return !!s && s.due <= today;
}

/** ローカル日付 YYYY-MM-DD */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}
