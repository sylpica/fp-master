import type { ExamKey, FieldId, Question } from './types';
import { createRng, shuffle } from './random';
import { localDayOf } from './stats';

/** 1問ごとの学習状況（履歴から集計） */
export interface ItemStat {
  attempts: number;
  correct: number;
  lastCorrect: boolean | null;
  lastUnsure: boolean;
  lastAt: string | null;
  due: string | null;
}

export type PracticeFilter =
  | 'all'
  | 'unanswered'
  | 'wrong'
  | 'bookmarked'
  | 'later'
  | 'weak'
  | 'due'
  | 'unsure'
  | 'stale';

export interface PracticeConfig {
  exams: ExamKey[];
  count: number;
  filter: PracticeFilter;
  fields?: FieldId[];
  themes?: string[];
  /** 出典年月（YYYY-MM） */
  yearMonths?: string[];
  /** 通常演習に計算問題を含めるか（初期値 false） */
  includeCalc: boolean;
  /** 出題順：random=ランダム / ordered=問題番号順 */
  order: 'random' | 'ordered';
  /** 難易度（1〜5）。指定時は該当レベルの問題のみ（公式問題は難易度未分類のため対象外） */
  levels?: number[];
  /** 出典の種類で絞る */
  sourceKind?: 'official' | 'original';
  /** 優先出題：hard=難易度の高い問題を優先 / unmastered=未習得の論点を優先 */
  focus?: 'hard' | 'unmastered';
}

export interface UserState {
  stats: Map<string, ItemStat>;
  bookmarks: Set<string>;
  later: Set<string>;
  today: string;
  /** 苦手分野（正答率の低い順） */
  weakFields: FieldId[];
}

export const STALE_DAYS = 30;

/**
 * 出題可能な母集団。
 * 通常演習では status=verified のみ・計算問題は includeCalc=false なら除外する。
 */
export function eligibleForPractice(pool: Question[], cfg: Pick<PracticeConfig, 'exams' | 'includeCalc'>): Question[] {
  return pool.filter(
    (q) => q.status === 'verified' && cfg.exams.includes(q.exam) && (cfg.includeCalc || !q.requiresCalculation),
  );
}

/** 計算トレーニング用：計算が必要な検証済み問題のみ */
export function eligibleForCalc(pool: Question[], exams: ExamKey[]): Question[] {
  return pool.filter((q) => q.status === 'verified' && exams.includes(q.exam) && q.requiresCalculation);
}

export function applyFilter(qs: Question[], filter: PracticeFilter, u: UserState): Question[] {
  const st = (q: Question) => u.stats.get(q.id);
  switch (filter) {
    case 'all':
    case 'weak':
      return qs;
    case 'unanswered':
      return qs.filter((q) => !st(q) || st(q)!.attempts === 0);
    case 'wrong':
      return qs.filter((q) => st(q)?.lastCorrect === false);
    case 'bookmarked':
      return qs.filter((q) => u.bookmarks.has(q.id));
    case 'later':
      return qs.filter((q) => u.later.has(q.id));
    case 'due':
      return qs.filter((q) => {
        const d = st(q)?.due;
        return !!d && d <= u.today;
      });
    case 'unsure':
      return qs.filter((q) => st(q)?.lastCorrect === true && st(q)!.lastUnsure);
    case 'stale': {
      const limit = addDaysIso(u.today, -STALE_DAYS);
      return qs.filter((q) => {
        const last = st(q)?.lastAt;
        // lastAt は UTC の ISO 文字列。today（ローカル日付）と同じ基準で比べるためローカル日付に直す
        return !!last && localDayOf(last) <= limit;
      });
    }
  }
}

function addDaysIso(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

export function selectQuestions(pool: Question[], cfg: PracticeConfig, u: UserState, seed: number): Question[] {
  let qs = eligibleForPractice(pool, cfg);
  if (cfg.fields?.length) qs = qs.filter((q) => cfg.fields!.includes(q.field));
  if (cfg.themes?.length) qs = qs.filter((q) => cfg.themes!.includes(q.theme));
  if (cfg.yearMonths?.length) {
    qs = qs.filter((q) => q.source.kind === 'official' && cfg.yearMonths!.includes(q.source.yearMonth));
  }
  if (cfg.levels?.length) qs = qs.filter((q) => q.level !== undefined && cfg.levels!.includes(q.level));
  if (cfg.sourceKind) qs = qs.filter((q) => q.source.kind === cfg.sourceKind);
  qs = applyFilter(qs, cfg.filter, u);

  const rng = createRng(seed);
  if (cfg.focus === 'hard') {
    qs = shuffle(qs, rng)
      .map((q, i) => ({ q, i }))
      .sort((a, b) => (b.q.level ?? 0) - (a.q.level ?? 0) || a.i - b.i)
      .map((x) => x.q);
  } else if (cfg.focus === 'unmastered') {
    qs = prioritizeUnmastered(pool, qs, u, rng);
  } else if (cfg.order === 'ordered') {
    qs = [...qs].sort(compareQuestionOrder);
  } else if (cfg.filter === 'weak' || cfg.filter === 'due') {
    qs = prioritize(qs, cfg.filter, u, rng);
  } else {
    qs = shuffle(qs, rng);
  }
  return qs.slice(0, Math.max(0, cfg.count));
}

/** 論点（なければテーマ）単位の習得度。最後の解答が正解の問題の割合（未解答は0） */
export function topicMastery(pool: Question[], u: UserState): Map<string, number> {
  const tot = new Map<string, { n: number; ok: number }>();
  for (const q of pool) {
    const k = q.topic ?? q.theme;
    const v = tot.get(k) ?? { n: 0, ok: 0 };
    v.n++;
    if (u.stats.get(q.id)?.lastCorrect === true) v.ok++;
    tot.set(k, v);
  }
  return new Map([...tot].map(([k, v]) => [k, v.ok / v.n]));
}

/** 未習得の論点を優先：習得度が低い論点、その中では未解答・直近誤答の問題を先に出す */
function prioritizeUnmastered(pool: Question[], qs: Question[], u: UserState, rng: () => number): Question[] {
  const mastery = topicMastery(pool, u);
  const score = (q: Question): number => {
    const st = u.stats.get(q.id);
    const state = !st || st.attempts === 0 ? 2 : st.lastCorrect === false ? 3 : 0;
    return (1 - (mastery.get(q.topic ?? q.theme) ?? 0)) * 10 + state;
  };
  return shuffle(qs, rng)
    .map((q, i) => ({ q, i, s: score(q) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.q);
}

/** 苦手分野優先・復習予定は優先度順（同順位はランダム） */
function prioritize(qs: Question[], filter: PracticeFilter, u: UserState, rng: () => number): Question[] {
  const shuffled = shuffle(qs, rng);
  const score = (q: Question): number => {
    const s = u.stats.get(q.id);
    if (filter === 'due') return s?.due ? -Number(s.due.replaceAll('-', '')) : 0; // 期限が古い順
    const fieldRank = u.weakFields.indexOf(q.field);
    const fieldScore = fieldRank < 0 ? 0 : (u.weakFields.length - fieldRank) * 10;
    const acc = s && s.attempts > 0 ? s.correct / s.attempts : 0.5;
    const wrongBonus = s?.lastCorrect === false ? 20 : 0;
    return fieldScore + wrongBonus + (1 - acc) * 10;
  };
  return shuffled
    .map((q, i) => ({ q, i, s: score(q) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.q);
}

export function compareQuestionOrder(a: Question, b: Question): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function orderKey(q: Question): string {
  if (q.source.kind === 'official') {
    return `${q.exam}|${q.source.yearMonth}|${String(q.source.number).padStart(3, '0')}`;
  }
  return `${q.exam}|zzzz|${q.id}`;
}

/** 分野別正答率から苦手分野を決める（最低解答数を満たす分野のみ） */
export function weakFieldsFrom(
  perField: Partial<Record<FieldId, { attempts: number; correct: number }>>,
  minAttempts = 5,
): FieldId[] {
  return (Object.entries(perField) as [FieldId, { attempts: number; correct: number }][])
    .filter(([, v]) => v.attempts >= minAttempts)
    .map(([f, v]) => ({ f, acc: v.correct / v.attempts }))
    .filter((x) => x.acc < 0.7)
    .sort((a, b) => a.acc - b.acc)
    .map((x) => x.f);
}
