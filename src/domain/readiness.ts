import type { FieldId } from './types';
import { FIELD_IDS } from './exam';

/**
 * 合格到達度の推定。
 * 統計モデルによる合格確率ではなく、学習データから「到達度」を段階表示する。
 * データが不足する場合は判定しない（docs/DECISIONS.md D-009）。
 */
export interface ReadinessInput {
  /** 直近の解答（新しい順に最大200件程度）の分野別正誤 */
  recent: { field: FieldId; correct: boolean }[];
  /** 分野ごとの出題母集団に対する学習済み割合（0〜1） */
  coverage: Record<FieldId, number>;
  /** 直近の模擬試験の得点率（新しい順） */
  mockRates: number[];
  /** 今日までに期限が来た復習のうち完了した割合（0〜1、対象なしは null） */
  reviewCompletion: number | null;
  /** 合格基準の得点率（学科 0.6、実技 0.6） */
  passRate: number;
  /** 対象分野（未指定はFPの6分野） */
  fields?: FieldId[];
}

export type ReadinessLevel = 'insufficient' | 'early' | 'building' | 'near' | 'ready';

export interface ReadinessResult {
  level: ReadinessLevel;
  label: string;
  /** 0〜100 の到達度スコア（確率ではない）。データ不足は null */
  score: number | null;
  fieldRates: Record<FieldId, number | null>;
  weakFields: FieldId[];
  notes: string[];
}

export const MIN_RECENT = 30;
const MIN_FIELD = 5;

export function estimateReadiness(inp: ReadinessInput): ReadinessResult {
  const fieldIds = inp.fields ?? FIELD_IDS;
  const fieldRates = {} as Record<FieldId, number | null>;
  for (const f of FIELD_IDS) fieldRates[f] = null;
  for (const f of fieldIds) {
    const xs = inp.recent.filter((r) => r.field === f);
    fieldRates[f] = xs.length >= MIN_FIELD ? xs.filter((x) => x.correct).length / xs.length : null;
  }
  const notes: string[] = [];
  if (inp.recent.length < MIN_RECENT) {
    notes.push(`判定には直近の解答が${MIN_RECENT}問以上必要です（現在${inp.recent.length}問）。`);
    return { level: 'insufficient', label: 'データ不足', score: null, fieldRates, weakFields: [], notes };
  }
  const recentRate = inp.recent.filter((r) => r.correct).length / inp.recent.length;
  const cov = fieldIds.reduce((s, f) => s + (inp.coverage[f] ?? 0), 0) / fieldIds.length;
  const mock = inp.mockRates.length ? inp.mockRates.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, inp.mockRates.length) : null;

  // 加重平均（重みは独自設定）。模擬試験がなければ正答率と網羅率のみ
  let score = mock === null ? recentRate * 0.75 + cov * 0.25 : recentRate * 0.45 + mock * 0.35 + cov * 0.2;
  if (inp.reviewCompletion !== null && inp.reviewCompletion < 0.5) {
    score -= 0.05;
    notes.push('復習の消化率が50%未満です。');
  }
  score = Math.max(0, Math.min(1, score));

  const weakFields = fieldIds.filter((f) => fieldRates[f] !== null && fieldRates[f]! < inp.passRate);
  const unlearned = fieldIds.filter((f) => (inp.coverage[f] ?? 0) < 0.2);
  if (unlearned.length) notes.push(`学習が進んでいない分野があります：${unlearned.join('・')}`);
  if (mock === null) notes.push('模擬試験の成績がないため、演習の正答率と網羅率のみで推定しています。');
  notes.push('この到達度は学習データからの目安であり、合格確率ではありません。');

  const pct = Math.round(score * 100);
  const p = inp.passRate;
  let level: ReadinessLevel;
  if (score >= p + 0.15 && weakFields.length === 0) level = 'ready';
  else if (score >= p + 0.05) level = 'near';
  else if (score >= p - 0.15) level = 'building';
  else level = 'early';
  const label = { ready: '合格ライン到達圏', near: 'あと一歩', building: '実力養成中', early: '基礎固め', insufficient: 'データ不足' }[level];
  return { level, label, score: pct, fieldRates, weakFields, notes };
}
