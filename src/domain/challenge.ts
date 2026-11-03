import type { FieldId, Question } from './types';
import { accuracy, type Accuracy } from './stats';

/** 95%チャレンジの目標正答率（学習目標であり、本試験の得点を保証するものではない） */
export const CHALLENGE_TARGET = 0.95;

/**
 * 目標の「達成」を判定する初見解答数の下限。
 * 少数の問題で偶然100%になっただけで「達成」と表示しないための値（統計モデルではなく独自設定）。
 * 100問で95%なら、正解95問（誤答5問以内）が必要になる。
 */
export const CHALLENGE_MIN_FIRST = 100;

export interface ChallengeAttempt {
  itemId: string;
  correct: boolean;
  at: string;
}

export interface ChallengeStats {
  /** 累計（同じ問題の再解答を含む） */
  all: Accuracy;
  /** 初見（各問題の最初の1回のみ）。繰り返しで上がった正答率と区別するための指標 */
  first: Accuracy;
  /** 復習（2回目以降） */
  review: Accuracy;
  /** 初見・難易度4以上 */
  hardFirst: Accuracy;
  /** 初見・難易度5（最難関） */
  topFirst: Accuracy;
  /** 初見の分野別 */
  firstByField: Record<FieldId, Accuracy>;
  /** 習得度の低い論点（最後の解答が正解の問題の割合が低い順） */
  weakTopics: { key: string; label: string; total: number; mastered: number; unseen: number }[];
  /** 初見正答率と目標との差（ポイント）。初見が未計測のときは null */
  gapPoints: number | null;
  /** 初見解答数が CHALLENGE_MIN_FIRST 以上で、目標との差を「達成」判定に使えるか */
  reliable: boolean;
}

const FIELDS: FieldId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 解答履歴から95%チャレンジの分析値を計算する（対象は渡した問題のみ） */
export function challengeStats(pool: Question[], attempts: ChallengeAttempt[]): ChallengeStats {
  const byId = new Map(pool.map((q) => [q.id, q]));
  const sorted = attempts.filter((a) => byId.has(a.itemId)).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const seen = new Set<string>();
  const last = new Map<string, boolean>();
  const first: { q: Question; correct: boolean }[] = [];
  const review: { correct: boolean }[] = [];
  for (const a of sorted) {
    last.set(a.itemId, a.correct);
    if (!seen.has(a.itemId)) {
      seen.add(a.itemId);
      first.push({ q: byId.get(a.itemId)!, correct: a.correct });
    } else {
      review.push({ correct: a.correct });
    }
  }
  const firstAcc = accuracy(first);
  const firstByField = Object.fromEntries(FIELDS.map((f) => [f, accuracy(first.filter((x) => x.q.field === f))])) as Record<FieldId, Accuracy>;
  const topics = new Map<string, { label: string; total: number; mastered: number; unseen: number }>();
  for (const q of pool) {
    const key = q.topic ?? q.theme;
    const t = topics.get(key) ?? { label: q.theme, total: 0, mastered: 0, unseen: 0 };
    t.total++;
    if (last.get(q.id) === true) t.mastered++;
    if (!seen.has(q.id)) t.unseen++;
    topics.set(key, t);
  }
  const weakTopics = [...topics]
    .map(([key, v]) => ({ key, ...v }))
    .filter((t) => t.mastered < t.total)
    .sort((a, b) => a.mastered / a.total - b.mastered / b.total || b.total - a.total)
    .slice(0, 10);
  return {
    all: accuracy(sorted),
    first: firstAcc,
    review: accuracy(review),
    hardFirst: accuracy(first.filter((x) => (x.q.level ?? 0) >= 4)),
    topFirst: accuracy(first.filter((x) => x.q.level === 5)),
    firstByField,
    weakTopics,
    gapPoints: firstAcc.rate === null ? null : Math.round((CHALLENGE_TARGET - firstAcc.rate) * 1000) / 10,
    reliable: firstAcc.attempts >= CHALLENGE_MIN_FIRST,
  };
}
