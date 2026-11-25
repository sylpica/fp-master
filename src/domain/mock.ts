import type { ExamKey, FieldId, Question } from './types';
import { EXAM_SPECS, FIELD_IDS, LIT_FIELD_IDS } from './exam';
import { createRng, shuffle } from './random';

/**
 * 模擬試験の構成。
 * 通常演習の「計算問題除外」設定は適用しない（本試験と同じく計算問題を含める）。
 */
export interface MockBlueprint {
  exam: ExamKey;
  /** 分野ごと・形式ごとの必要数 */
  slots: { field: FieldId; kind: 'truefalse' | 'choice' | 'any'; count: number }[];
}

export function blueprintFor(exam: ExamKey): MockBlueprint {
  if (exam === 'g3') {
    // 3級学科：正誤式30問・三答択一式30問。公表問題では各形式とも6分野×5問の構成
    return {
      exam,
      slots: FIELD_IDS.flatMap((field) => [
        { field, kind: 'truefalse' as const, count: 5 },
        { field, kind: 'choice' as const, count: 5 },
      ]),
    };
  }
  if (exam === 'g2') {
    // 2級学科：四答択一式60問。公表問題では6分野×10問の構成
    return { exam, slots: FIELD_IDS.map((field) => ({ field, kind: 'choice' as const, count: 10 })) };
  }
  if (exam === 'lit') {
    // 金融リテラシー検定：正誤問題35問＋三答択一式15問＝50問。
    // 分野ごとの内訳は公式に公表されていないため、5分野×（正誤7＋三択3）＝10問の均等配分（独自仕様）
    return {
      exam,
      slots: LIT_FIELD_IDS.flatMap((field) => [
        { field, kind: 'truefalse' as const, count: 7 },
        { field, kind: 'choice' as const, count: 3 },
      ]),
    };
  }
  // 実技は分野配分が公表されていないため均等配分（独自仕様）
  const per = EXAM_SPECS[exam].questionCount / FIELD_IDS.length;
  const base = Math.floor(per);
  let rest = EXAM_SPECS[exam].questionCount - base * FIELD_IDS.length;
  return {
    exam,
    slots: FIELD_IDS.map((field) => ({ field, kind: 'any' as const, count: base + (rest-- > 0 ? 1 : 0) })),
  };
}

export interface MockBuildResult {
  questions: Question[];
  /** 不足している枠 */
  shortages: { field: FieldId; kind: string; needed: number; available: number }[];
  /** 本試験と同じ問題数・構成を満たしているか */
  complete: boolean;
  calcCount: number;
}

function partKind(q: Question): 'truefalse' | 'choice' | 'other' {
  if (q.parts.length !== 1) return 'other';
  const k = q.parts[0]!.kind;
  return k === 'truefalse' ? 'truefalse' : k === 'choice' ? 'choice' : 'other';
}

function isFourChoice(q: Question): boolean {
  const p = q.parts[0];
  return !!p && p.kind === 'choice' && p.choices.length === 4 && !q.tags?.includes('四択以外');
}

/** ランダム構成の模擬試験（独自仕様）。検証済み問題のみを使う */
export function buildRandomMock(pool: Question[], exam: ExamKey, seed: number): MockBuildResult {
  const rng = createRng(seed);
  const verified = pool.filter((q) => q.exam === exam && q.status === 'verified');
  const bp = blueprintFor(exam);
  const chosen: Question[] = [];
  const shortages: MockBuildResult['shortages'] = [];
  for (const slot of bp.slots) {
    const cands = verified.filter(
      (q) =>
        q.field === slot.field &&
        (slot.kind === 'any' || partKind(q) === slot.kind) &&
        // 2級学科は四答択一のみ（四択以外の形式のオリジナル問題は本試験の構成に含めない）
        !(exam === 'g2' && slot.kind === 'choice' && !isFourChoice(q)) &&
        !chosen.includes(q),
    );
    const picked = shuffle(cands, rng).slice(0, slot.count);
    if (picked.length < slot.count) {
      shortages.push({ field: slot.field, kind: slot.kind, needed: slot.count, available: picked.length });
    }
    chosen.push(...picked);
  }
  // 本試験の並び（学科：正誤→択一、分野順）に揃える
  const order = (q: Question) => (partKind(q) === 'truefalse' ? 0 : 1) * 10 + FIELD_IDS.indexOf(q.field);
  const questions = [...chosen].sort((a, b) => order(a) - order(b));
  return {
    questions,
    shortages,
    complete: shortages.length === 0 && questions.length === EXAM_SPECS[exam].questionCount,
    calcCount: questions.filter((q) => q.requiresCalculation).length,
  };
}

/** 公表問題1セットをそのまま本試験形式で出題 */
export function buildOfficialSetMock(pool: Question[], exam: ExamKey, yearMonth: string): MockBuildResult {
  const all = pool
    .filter((q) => q.exam === exam && q.source.kind === 'official' && q.source.yearMonth === yearMonth)
    .sort((a, b) => (a.source.kind === 'official' && b.source.kind === 'official' ? a.source.number - b.source.number : 0));
  const questions = all.filter((q) => q.status === 'verified');
  const missing = all.length - questions.length;
  const needed = EXAM_SPECS[exam].questionCount;
  return {
    questions,
    shortages:
      questions.length < needed ? [{ field: 'A', kind: `検証済み問題不足（隔離 ${missing}問）`, needed, available: questions.length }] : [],
    complete: questions.length === needed,
    calcCount: questions.filter((q) => q.requiresCalculation).length,
  };
}

export interface MockScore {
  score: number;
  max: number;
  pass: number;
  passed: boolean;
  correctCount: number;
  total: number;
  byField: Record<FieldId, { correct: number; total: number }>;
}

export function scoreMock(exam: ExamKey, items: { field: FieldId; correct: boolean }[]): MockScore {
  const spec = EXAM_SPECS[exam];
  const byField = Object.fromEntries(FIELD_IDS.map((f) => [f, { correct: 0, total: 0 }])) as MockScore['byField'];
  let correctCount = 0;
  for (const it of items) {
    byField[it.field].total++;
    if (it.correct) {
      byField[it.field].correct++;
      correctCount++;
    }
  }
  // 問題数が本試験と異なる場合は満点に対する比率で換算
  const max = spec.maxScore;
  const score = items.length === 0 ? 0 : Math.round(((correctCount / items.length) * max) * 10) / 10;
  return { score, max, pass: spec.passScore, passed: score >= spec.passScore, correctCount, total: items.length, byField };
}
