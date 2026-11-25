import type { ExamKey, FieldId, Grade, Subject, Unit } from './types';

/**
 * 試験仕様。出典：日本FP協会「2級・3級FP技能検定 試験要綱」
 * https://www.jafp.or.jp/exam/outline/ （2026-10-20 確認）
 * 金融リテラシー検定は金融財政事情研究会（きんざい）「金融リテラシー検定試験の概要」
 * https://products.kinzai.or.jp/exam/financialliteracy/ （2026-11-25 確認）
 */
export const EXAM_SPEC_SOURCE = {
  title: '日本FP協会 2級・3級FP技能検定 試験要綱',
  url: 'https://www.jafp.or.jp/exam/outline/',
  checkedAt: '2026-10-20',
} as const;

export const LIT_EXAM_SPEC_SOURCE = {
  title: '金融財政事情研究会（きんざい）金融リテラシー検定試験の概要',
  url: 'https://products.kinzai.or.jp/exam/financialliteracy/',
  checkedAt: '2026-11-25',
} as const;

export interface ExamSpec {
  key: ExamKey;
  /** FP技能検定のみ（金融リテラシー検定は級なし） */
  grade?: Grade;
  /** FP技能検定のみ（金融リテラシー検定は学科・実技の区別なし） */
  subject?: Subject;
  label: string;
  shortLabel: string;
  minutes: number;
  questionCount: number;
  format: string;
  maxScore: number;
  passScore: number;
  /** 1問あたりの配点。公式に公表されていない場合は独自仕様 */
  pointsPerQuestion: number;
  pointsOfficial: boolean;
}

export const EXAM_SPECS: Record<ExamKey, ExamSpec> = {
  g3: {
    key: 'g3',
    grade: 3,
    subject: 'gakka',
    label: '3級 学科',
    shortLabel: '3級学科',
    minutes: 90,
    questionCount: 60,
    format: '正誤式30問・三答択一式30問（多肢選択式）',
    maxScore: 60,
    passScore: 36,
    pointsPerQuestion: 1,
    pointsOfficial: true,
  },
  j3: {
    key: 'j3',
    grade: 3,
    subject: 'jitsugi',
    label: '3級 実技（資産設計提案業務）',
    shortLabel: '3級実技',
    minutes: 60,
    questionCount: 20,
    format: '多肢選択式',
    maxScore: 100,
    passScore: 60,
    pointsPerQuestion: 5,
    // 100点満点・20問は公式。1問5点の均等配点は公式資料で確認できないため独自仕様
    pointsOfficial: false,
  },
  g2: {
    key: 'g2',
    grade: 2,
    subject: 'gakka',
    label: '2級 学科',
    shortLabel: '2級学科',
    minutes: 120,
    questionCount: 60,
    format: '四答択一式60問（多肢選択式）',
    maxScore: 60,
    passScore: 36,
    pointsPerQuestion: 1,
    pointsOfficial: true,
  },
  j2: {
    key: 'j2',
    grade: 2,
    subject: 'jitsugi',
    label: '2級 実技（資産設計提案業務）',
    shortLabel: '2級実技',
    minutes: 90,
    questionCount: 40,
    format: '多肢選択式及び記述式',
    maxScore: 100,
    passScore: 60,
    pointsPerQuestion: 2.5,
    // 100点満点・40問は公式。1問2.5点の均等配点は独自仕様
    pointsOfficial: false,
  },
  lit: {
    key: 'lit',
    label: '金融リテラシー検定',
    shortLabel: 'リテラシー検定',
    minutes: 40,
    questionCount: 50,
    format: '正誤問題35問・三答択一式15問',
    maxScore: 100,
    passScore: 60,
    pointsPerQuestion: 2,
    // 100点満点・60点合格は公式。配点は公式に公表されていないため均等2点は独自仕様
    pointsOfficial: false,
  },
};

export function examKeyOf(grade: Grade, subject: Subject): ExamKey {
  return `${subject === 'gakka' ? 'g' : 'j'}${grade}` as ExamKey;
}

/** 試験区分が属する最上位ユニット */
export function unitOfExam(exam: ExamKey): Unit {
  if (exam === 'lit') return 'lit';
  return exam.endsWith('3') ? 'fp3' : 'fp2';
}

/** ユニットに対応する用語・カードの所属区分（FP3級=3、FP2級=2、金融リテラシー検定='lit'） */
export function contentGradeOfUnit(unit: Unit): Grade | 'lit' {
  return unit === 'lit' ? 'lit' : unit === 'fp2' ? 2 : 3;
}

export const FIELDS: Record<FieldId, { name: string; short: string }> = {
  A: { name: 'ライフプランニングと資金計画', short: 'ライフ' },
  B: { name: 'リスク管理', short: 'リスク' },
  C: { name: '金融資産運用', short: '金融' },
  D: { name: 'タックスプランニング', short: 'タックス' },
  E: { name: '不動産', short: '不動産' },
  F: { name: '相続・事業承継', short: '相続' },
};
export const FIELD_IDS: FieldId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * 金融リテラシー検定の5分野（公式の出題範囲）。
 * FPの分野記号（A〜F）とは意味が異なるため、試験ごとに解決する。
 */
export const LIT_FIELDS: Record<'A' | 'B' | 'C' | 'D' | 'E', { name: string; short: string }> = {
  A: { name: 'ライフプラン・キャリア', short: 'ライフプラン' },
  B: { name: '消費者トラブル・消費者信用', short: '消費者' },
  C: { name: '金融・経済', short: '金融・経済' },
  D: { name: '金融商品・保険', short: '金融商品' },
  E: { name: '社会保険・税金', short: '社会保険・税金' },
};
export const LIT_FIELD_IDS: FieldId[] = ['A', 'B', 'C', 'D', 'E'];

/** 試験区分に応じた分野一覧 */
export function fieldIdsFor(exam: ExamKey | undefined): FieldId[] {
  return exam === 'lit' ? LIT_FIELD_IDS : FIELD_IDS;
}

/** 試験区分に応じた分野名の対応表（lit の F は存在しないため FP の表で代替する） */
export function fieldsFor(exam: ExamKey | undefined): Record<FieldId, { name: string; short: string }> {
  if (exam !== 'lit') return FIELDS;
  return { ...LIT_FIELDS, F: FIELDS.F } as Record<FieldId, { name: string; short: string }>;
}

/** 分野の表示名を試験区分に応じて解決する */
export function fieldInfo(exam: ExamKey | undefined, field: FieldId): { name: string; short: string } {
  return fieldsFor(exam)[field];
}

/**
 * 2級・3級CBT試験の法令基準日。出典：日本FP協会「試験日程」
 * https://www.jafp.or.jp/exam/schedule/ （2026-10-20 確認）
 * 受検月の範囲（from〜to、両端含む YYYY-MM）→ 法令基準日
 */
export const LAW_BASE_PERIODS: { from: string; to: string; lawBaseDate: string }[] = [
  { from: '2026-04', to: '2026-05', lawBaseDate: '2025-04-01' },
  { from: '2026-06', to: '2027-05', lawBaseDate: '2026-04-01' },
  { from: '2027-06', to: '2028-05', lawBaseDate: '2027-04-01' },
];
export const LAW_BASE_SOURCE = {
  title: '日本FP協会 FP技能検定 試験日程',
  url: 'https://www.jafp.or.jp/exam/schedule/',
  checkedAt: '2026-10-20',
} as const;

/**
 * 受検日（YYYY-MM-DD）に適用される法令基準日を返す。
 * 公表済み期間外の場合は null（推測しない）。
 */
export function lawBaseDateFor(examDate: string): string | null {
  const ym = examDate.slice(0, 7);
  const p = LAW_BASE_PERIODS.find((x) => x.from <= ym && ym <= x.to);
  return p ? p.lawBaseDate : null;
}
