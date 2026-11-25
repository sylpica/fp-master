import type { FieldId, Grade, Unit } from './types';
import { FIELD_IDS } from './exam';
import { addDays, daysBetween } from './srs';

/** 1問あたりの想定時間（分）。金融リテラシー検定は本試験が50問40分のため0.8分 */
export function minutesPerQuestionFor(unit: Unit | undefined, grade: Grade): number {
  if (unit === 'lit') return 0.8;
  return grade === 2 ? 2 : 1.5;
}

export interface PlanInput {
  today: string;
  examDate: string;
  grade: Grade;
  /** 最上位ユニット（未指定はFPとして扱う） */
  unit?: Unit;
  /** 対象分野（未指定はFPの6分野） */
  fields?: FieldId[];
  /** 1日の学習可能時間（分） */
  minutesPerDay: number;
  /** 週の学習日数（1〜7） */
  daysPerWeek: number;
  /** 自己評価の理解度（1〜5） */
  understanding: number;
  weakFields: FieldId[];
  /** 出題対象の検証済み問題数（学科＋実技） */
  poolSize: number;
  /** これまでに解いた（ユニークな）問題数 */
  learnedCount: number;
}

export interface PlanDay {
  date: string;
  kind: 'study' | 'mock' | 'rest' | 'final';
  fields: FieldId[];
  newQuestions: number;
  reviewMinutes: number;
}

export interface StudyPlan {
  daysLeft: number;
  studyDays: number;
  dailyNew: number;
  dailyMinutes: number;
  /** 1問あたりの想定時間（分） */
  minutesPerQuestion: number;
  days: PlanDay[];
  warnings: string[];
}

/** 曜日パターン：週 n 日学習する場合の休日（0=日曜...）。土日に寄せず分散させる */
const REST_PATTERN: Record<number, number[]> = {
  7: [],
  6: [3],
  5: [3, 6],
  4: [1, 3, 5],
  3: [1, 3, 5, 0],
  2: [1, 2, 4, 5, 0],
  1: [1, 2, 3, 4, 5, 0],
};

export function buildPlan(inp: PlanInput): StudyPlan {
  const warnings: string[] = [];
  const daysLeft = daysBetween(inp.today, inp.examDate);
  if (daysLeft <= 0) {
    return { daysLeft, studyDays: 0, dailyNew: 0, dailyMinutes: 0, minutesPerQuestion: 1.5, days: [], warnings: ['受験予定日が今日以前です。'] };
  }
  const dpw = Math.min(7, Math.max(1, Math.round(inp.daysPerWeek)));
  const restDays = REST_PATTERN[dpw]!;
  const fieldIds = inp.fields ?? FIELD_IDS;
  const minutesPerQuestion = minutesPerQuestionFor(inp.unit, inp.grade);
  // 復習に充てる割合：理解度が低いほど新規学習を多めにする
  const reviewShare = 0.25 + (inp.understanding - 1) * 0.05;

  const dates: string[] = [];
  for (let i = 0; i < daysLeft; i++) dates.push(addDays(inp.today, i));
  const isRest = (d: string) => restDays.includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const studyDates = dates.filter((d) => !isRest(d));

  // 模擬試験：試験前の最終2週間は週1回、それ以前は2週に1回（最終日前日は総復習）
  const mockDates = new Set<string>();
  for (let i = studyDates.length - 2; i >= 0; ) {
    const d = studyDates[i]!;
    mockDates.add(d);
    const remain = daysBetween(d, inp.examDate);
    i -= remain <= 14 ? Math.max(1, Math.round(dpw)) : Math.max(1, dpw * 2);
  }
  const finalDate = studyDates[studyDates.length - 1];

  const remaining = Math.max(0, inp.poolSize - inp.learnedCount);
  const newDays = Math.max(1, studyDates.length - mockDates.size - 1);
  const capacity = Math.floor((inp.minutesPerDay * (1 - reviewShare)) / minutesPerQuestion);
  const needed = Math.ceil(remaining / newDays);
  const dailyNew = Math.max(0, Math.min(capacity, needed));
  if (needed > capacity) {
    warnings.push(`未学習の${remaining}問を受験日までに一巡するには1日${needed}問が必要ですが、学習時間から見た目安は${capacity}問です。苦手分野を優先して進めましょう。`);
  }
  if (daysLeft < 14) warnings.push('受験日まで2週間未満です。新規学習より復習と模擬試験を優先しましょう。');

  // 分野ローテーション：苦手分野は2回分の枠を持つ
  const rotation: FieldId[] = [...fieldIds, ...inp.weakFields];
  let r = 0;
  const days: PlanDay[] = dates.map((date) => {
    if (isRest(date)) return { date, kind: 'rest', fields: [], newQuestions: 0, reviewMinutes: 0 };
    if (date === finalDate) return { date, kind: 'final', fields: [...fieldIds], newQuestions: 0, reviewMinutes: inp.minutesPerDay };
    if (mockDates.has(date)) return { date, kind: 'mock', fields: [...fieldIds], newQuestions: 0, reviewMinutes: 0 };
    const f1 = rotation[r++ % rotation.length]!;
    return {
      date,
      kind: 'study',
      fields: [f1],
      newQuestions: dailyNew,
      reviewMinutes: Math.round(inp.minutesPerDay * reviewShare),
    };
  });

  return {
    daysLeft,
    studyDays: studyDates.length,
    dailyNew,
    dailyMinutes: inp.minutesPerDay,
    minutesPerQuestion,
    days,
    warnings,
  };
}

/** 計画に対する遅れ（予定累計 − 実績累計）。正の値は遅れ */
export function progressGap(plan: StudyPlan, today: string, actualNewSincePlan: number): number {
  const planned = plan.days.filter((d) => d.date < today).reduce((s, d) => s + d.newQuestions, 0);
  return planned - actualNewSincePlan;
}
