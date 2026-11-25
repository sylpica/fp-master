import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db } from '../db/db';
import type { Grade, Subject, Unit } from '../domain/types';
import type { PracticeConfig } from '../domain/selection';

export type ExplanationMode = 'short' | 'standard' | 'detail';

export interface Settings {
  /** 最上位ユニット（FP3級／FP2級／金融リテラシー検定）。級から導出される移行値も含む */
  unit: Unit;
  grade: Grade;
  subject: Subject;
  /** 通常演習にも計算問題を含める（初期値 OFF） */
  includeCalcInPractice: boolean;
  /** 単語帳（暗記カード）の表裏を逆にして出題する（初期値 OFF） */
  cardsReversed: boolean;
  /** 解説の表示モード（初期値 簡潔） */
  explanationMode: ExplanationMode;
  theme: 'system' | 'light' | 'dark';
  /** 1日の目標問題数 */
  dailyGoal: number;
  /** 受験予定日 YYYY-MM-DD */
  examDate: string | null;
  /** 前回の演習条件 */
  lastPractice: Partial<PracticeConfig> | null;
  /** お気に入りの出題設定 */
  presets: { name: string; config: Partial<PracticeConfig> }[];
  /** 学習計画の入力 */
  plan: { minutesPerDay: number; daysPerWeek: number; understanding: number; createdAt: string } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'fp3',
  grade: 3,
  subject: 'gakka',
  includeCalcInPractice: false,
  cardsReversed: false,
  explanationMode: 'short',
  theme: 'system',
  dailyGoal: 20,
  examDate: null,
  lastPractice: null,
  presets: [],
  plan: null,
};

/**
 * 設定値の形式。古い・壊れたバックアップの復元などで不正な値が入っていても、
 * 画面が表示できなくなる（例：級が 2/3 以外）ことがないよう、読み込み時に検査して初期値で補う。
 * 保存されている値は書き換えない（データを消さない）。
 */
const SETTING_SCHEMAS: { [K in keyof Settings]: z.ZodType } = {
  unit: z.enum(['fp3', 'fp2', 'lit']),
  grade: z.union([z.literal(2), z.literal(3)]),
  subject: z.enum(['gakka', 'jitsugi']),
  includeCalcInPractice: z.boolean(),
  cardsReversed: z.boolean(),
  explanationMode: z.enum(['short', 'standard', 'detail']),
  theme: z.enum(['system', 'light', 'dark']),
  dailyGoal: z.number().int().positive(),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lastPractice: z.record(z.string(), z.unknown()).nullable(),
  presets: z.array(z.object({ name: z.string(), config: z.record(z.string(), z.unknown()) })),
  plan: z
    .object({ minutesPerDay: z.number(), daysPerWeek: z.number(), understanding: z.number(), createdAt: z.string() })
    .nullable(),
};

export function normalizeSettings(rows: { key: string; value: unknown }[]): Settings {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  let unitStored = false;
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    if (SETTING_SCHEMAS[r.key as keyof Settings].safeParse(r.value).success) {
      out[r.key] = r.value;
      if (r.key === 'unit') unitStored = true;
    }
  }
  // ユニット導入前の保存値（級のみ）からの移行：級がそのままユニットになる
  if (!unitStored) out.unit = out.grade === 2 ? 'fp2' : 'fp3';
  return out as unknown as Settings;
}

export async function getSettings(): Promise<Settings> {
  return normalizeSettings(await db.settings.toArray());
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value });
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}
