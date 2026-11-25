import { z } from 'zod';

/** 級 */
export const GradeSchema = z.union([z.literal(2), z.literal(3)]);
export type Grade = z.infer<typeof GradeSchema>;

/** 科目（学科・実技） */
export const SubjectSchema = z.enum(['gakka', 'jitsugi']);
export type Subject = z.infer<typeof SubjectSchema>;

/** 試験区分キー：g=学科, j=実技（日本FP協会・資産設計提案業務）, lit=金融リテラシー検定 */
export const ExamKeySchema = z.enum(['g3', 'j3', 'g2', 'j2', 'lit']);
export type ExamKey = z.infer<typeof ExamKeySchema>;

/** 最上位ユニット（学習対象のまとまり）：FP3級・FP2級・金融リテラシー検定 */
export const UnitSchema = z.enum(['fp3', 'fp2', 'lit']);
export type Unit = z.infer<typeof UnitSchema>;

/**
 * 用語・カードの所属範囲を表す区分。FPの級（2/3）に加え、金融リテラシー検定を 'lit' で表す。
 * FPの Grade（2|3）とは別型にし、級そのものの意味は変えない。
 */
export const ContentGradeSchema = z.union([GradeSchema, z.literal('lit')]);
export type ContentGrade = z.infer<typeof ContentGradeSchema>;

/** 6分野 */
export const FieldIdSchema = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);
export type FieldId = z.infer<typeof FieldIdSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 形式');

export const SourceRefSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * 根拠の引用。url のページ本文（空白を除去したテキスト）に quote が含まれることを
 * scripts/verify-sources.mjs で自動照合する。含まれなくなった場合は制度改正等の可能性がある。
 */
export const EvidenceSchema = z.object({
  url: z.url(),
  quote: z.string().min(4),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const OfficialSourceSchema = z.object({
  kind: z.literal('official'),
  /** 出典表記（日本FP協会の利用条件に従った掲載例どおりの表記） */
  citation: z.string().min(1),
  /** 公表年月 or 実施年月（例: 2026-05） */
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  number: z.number().int().positive(),
  url: z.url(),
  answerUrl: z.url().optional(),
  /** 修正・加工の有無（ありの場合は「加工して作成」を表示） */
  modified: z.boolean(),
  modificationNote: z.string().optional(),
});

export const OriginalSourceSchema = z.object({
  kind: z.literal('original'),
  author: z.string().min(1),
  basis: z.array(SourceRefSchema).min(1),
});

export const QuestionSourceSchema = z.discriminatedUnion('kind', [OfficialSourceSchema, OriginalSourceSchema]);
export type QuestionSource = z.infer<typeof QuestionSourceSchema>;

const ChoiceSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });
export type Choice = z.infer<typeof ChoiceSchema>;

/** 1問の中の解答欄（学科は1つ、実技は複数のことがある） */
export const PartSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('truefalse'),
    id: z.string(),
    prompt: z.string().optional(),
    answer: z.boolean(),
  }),
  z.object({
    kind: z.literal('choice'),
    id: z.string(),
    prompt: z.string().optional(),
    choices: z.array(ChoiceSchema).min(2),
    answer: z.string(),
  }),
  z.object({
    kind: z.literal('numeric'),
    id: z.string(),
    prompt: z.string().optional(),
    unit: z.string().optional(),
    answer: z.number(),
  }),
]);
export type Part = z.infer<typeof PartSchema>;

export const ExplanationSchema = z.object({
  /** verified: 根拠資料と照合済み / draft: 作成済みだが根拠照合が未完了 */
  status: z.enum(['verified', 'draft']),
  /** 簡潔モード（数行） */
  short: z.string().min(1),
  /** 標準モード（前提を含む） */
  standard: z.string().optional(),
  /** 詳細モード（制度の仕組み） */
  detail: z.string().optional(),
  whyCorrect: z.string().optional(),
  /** 選択肢IDごとの誤りの理由 */
  wrongChoices: z.record(z.string(), z.string()).optional(),
  /** 全選択肢（正解を含む）の個別解説。選択肢IDをキーにする */
  choiceExplanations: z.record(z.string(), z.string()).optional(),
  example: z.string().optional(),
  formulas: z.array(z.object({ name: z.string(), tex: z.string() })).optional(),
  pitfalls: z.string().optional(),
  mnemonic: z.string().optional(),
  relatedQuestions: z.array(z.string()).optional(),
  sources: z.array(SourceRefSchema),
  evidence: z.array(EvidenceSchema).optional(),
  /** 解説の根拠となる法令基準日 */
  lawBaseDate: IsoDate,
  checkedAt: IsoDate,
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const MaterialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), title: z.string().optional(), body: z.string() }),
  z.object({
    kind: z.literal('table'),
    title: z.string().optional(),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    kind: z.literal('image'),
    title: z.string().optional(),
    src: z.string(),
    alt: z.string(),
    /** 画像に問題文も含まれている（原本PDFからの切り出し） */
    includesStem: z.boolean().optional(),
    /** 複数の問題に共通する設例の画像（問題の画像より先に表示する） */
    shared: z.boolean().optional(),
  }),
]);
export type Material = z.infer<typeof MaterialSchema>;

export const QuestionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    exam: ExamKeySchema,
    field: FieldIdSchema,
    theme: z.string().min(1),
    source: QuestionSourceSchema,
    /** 問題が前提とする法令基準日 */
    lawBaseDate: IsoDate,
    stem: z.string().min(1),
    materials: z.array(MaterialSchema).optional(),
    parts: z.array(PartSchema).min(1),
    /** 難易度（1基礎・2標準・3応用・4高難度・5最難関）。オリジナル問題のみ付与（公式問題は未分類） */
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
    /** 公式試験範囲（細目）の論点キー（例：A5-4）。scripts/original/syllabus_fp2.json 参照 */
    topic: z.string().regex(/^[A-F]\d+(\.\d+)?-\d+$/).optional(),
    /** 解答に計算プロセスが必要か（数値が登場するだけの知識問題は false） */
    requiresCalculation: z.boolean(),
    /** 分類の根拠（requiresCalculation=true のとき必須） */
    calcReason: z.string().optional(),
    /**
     * verified: 抽出・問題番号・公式正答の照合・分類レビューが完了
     * quarantined: 抽出結果が不明瞭などの理由で隔離（出題しない）
     */
    status: z.enum(['verified', 'quarantined']),
    quarantineReason: z.string().optional(),
    explanation: ExplanationSchema.optional(),
    terms: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.requiresCalculation && !q.calcReason) {
      ctx.addIssue({ code: 'custom', message: 'requiresCalculation=true には calcReason が必要', path: ['calcReason'] });
    }
    if (q.status === 'quarantined' && !q.quarantineReason) {
      ctx.addIssue({ code: 'custom', message: '隔離には quarantineReason が必要', path: ['quarantineReason'] });
    }
    for (const [i, p] of q.parts.entries()) {
      if (p.kind === 'choice' && !p.choices.some((c) => c.id === p.answer)) {
        ctx.addIssue({ code: 'custom', message: '正答が選択肢に存在しない', path: ['parts', i, 'answer'] });
      }
    }
  });
export type Question = z.infer<typeof QuestionSchema>;

export const QuestionSetSchema = z.object({
  id: z.string(),
  exam: ExamKeySchema,
  title: z.string(),
  /** 本試験と同じ構成の公表セットか */
  officialSet: z.boolean(),
  lawBaseDate: IsoDate,
  questions: z.array(QuestionSchema),
});
export type QuestionSet = z.infer<typeof QuestionSetSchema>;

export const TermSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  /** ひらがな読み（五十音順ソート用） */
  reading: z.string().regex(/^[ぁ-ゖー・a-zA-Z0-9]+$/),
  aliases: z.array(z.string()).optional(),
  short: z.string().min(1),
  detail: z.string().min(1),
  example: z.string().optional(),
  system: z.string().optional(),
  /** 重要な数字・適用条件（表示用の短い文の列） */
  facts: z.array(z.string()).optional(),
  /** 例外規定・注意点 */
  cautions: z.array(z.string()).optional(),
  /** 類似用語との違い */
  compare: z.array(z.string()).optional(),
  /** 対応する試験範囲の細目キー（FP2シラバス等） */
  topics: z.array(z.string()).optional(),
  /** この用語の説明が前提とする法令基準日 */
  lawBaseDate: IsoDate.optional(),
  formula: z.object({ name: z.string(), tex: z.string() }).optional(),
  related: z.array(z.string()),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  grades: z.array(ContentGradeSchema).min(1),
  field: FieldIdSchema,
  /** 金融リテラシー検定での分野（A〜E）。FPと共用の用語で分野対応が異なる場合に付く */
  litField: FieldIdSchema.optional(),
  /** verified: 根拠の引用が公式ページで照合済み / draft: 未照合（「要確認」と表示） */
  reviewStatus: z.enum(['verified', 'draft']),
  sources: z.array(SourceRefSchema),
  evidence: z.array(EvidenceSchema).optional(),
  checkedAt: IsoDate,
});
export type Term = z.infer<typeof TermSchema>;

export const FactCardSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  front: z.string().min(1),
  back: z.string().min(1),
  field: FieldIdSchema,
  grades: z.array(ContentGradeSchema).min(1),
  category: z.enum(['number', 'rate', 'deadline', 'formula', 'rule']),
  termId: z.string().optional(),
  reviewStatus: z.enum(['verified', 'draft']),
  sources: z.array(SourceRefSchema),
  evidence: z.array(EvidenceSchema).optional(),
  lawBaseDate: IsoDate,
});
export type FactCard = z.infer<typeof FactCardSchema>;

export const LawChangeSchema = z.object({
  id: z.string(),
  title: z.string(),
  field: FieldIdSchema,
  /** 施行日・適用開始日 */
  effective: IsoDate,
  summary: z.string(),
  before: z.string(),
  after: z.string(),
  sources: z.array(SourceRefSchema).min(1),
  evidence: z.array(EvidenceSchema).optional(),
  /** confirmed: 公的資料で確認済み / candidate: 変更候補（未確認・出題に反映しない） */
  status: z.enum(['confirmed', 'candidate']),
  /** 影響を受ける問題。impact: 正答への影響（unchanged=正答は変わらないが記述が旧制度 / changed=正答が変わる / unknown=未確認） */
  affectedQuestions: z.array(
    z.object({ id: z.string(), impact: z.enum(['unchanged', 'changed', 'unknown']), note: z.string() }),
  ),
  affectedTerms: z.array(z.string()),
  checkedAt: IsoDate,
});
export type LawChange = z.infer<typeof LawChangeSchema>;
