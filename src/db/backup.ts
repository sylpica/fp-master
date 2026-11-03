import { z } from 'zod';
import { DB_SCHEMA_VERSION, TABLE_NAMES, type FpDb, type TableName } from './db';

/**
 * JSON バックアップ・復元。
 * - 復元前に形式を検証し、件数・重複を報告する
 * - 復元は1トランザクションで行い、失敗時は自動的にロールバックされる
 */

export const BACKUP_APP_ID = 'fp-master';

const PRIMARY_KEY: Record<TableName, string> = {
  attempts: 'id',
  srs: 'key',
  bookmarks: 'key',
  later: 'key',
  notes: 'key',
  termState: 'termId',
  sessions: 'id',
  mockResults: 'id',
  reports: 'id',
  settings: 'key',
};

const rowSchemas: Record<TableName, z.ZodType> = {
  attempts: z.looseObject({
    itemId: z.string(),
    itemKind: z.enum(['question', 'card', 'calc']),
    field: z.enum(['A', 'B', 'C', 'D', 'E', 'F']),
    correct: z.boolean(),
    timeMs: z.number(),
    at: z.string(),
  }),
  srs: z.looseObject({ key: z.string(), ease: z.number(), interval: z.number(), reps: z.number(), lapses: z.number(), due: z.string(), last: z.string() }),
  bookmarks: z.looseObject({ key: z.string(), createdAt: z.string() }),
  later: z.looseObject({ key: z.string(), createdAt: z.string() }),
  notes: z.looseObject({ key: z.string(), text: z.string(), updatedAt: z.string() }),
  termState: z.looseObject({ termId: z.string(), favorite: z.boolean(), learned: z.boolean() }),
  sessions: z.looseObject({ id: z.string(), kind: z.string(), itemIds: z.array(z.string()), answers: z.record(z.string(), z.unknown()) }),
  mockResults: z.looseObject({ exam: z.string(), score: z.number(), finishedAt: z.string() }),
  reports: z.looseObject({ itemKey: z.string(), text: z.string(), createdAt: z.string() }),
  settings: z.looseObject({ key: z.string() }),
};

export const BackupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.unknown())),
});
export type Backup = z.infer<typeof BackupSchema>;

export async function exportBackup(db: FpDb): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) tables[t] = await db.table(t).toArray();
  });
  return { app: BACKUP_APP_ID, schemaVersion: DB_SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

export interface BackupInspection {
  ok: boolean;
  errors: string[];
  schemaVersion?: number;
  exportedAt?: string;
  counts: Partial<Record<TableName, { total: number; duplicates: number }>>;
  backup?: Backup;
}

/** 復元前の検証（DBは変更しない） */
export async function inspectBackup(db: FpDb, raw: string): Promise<BackupInspection> {
  const errors: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['JSONとして読み込めません（ファイルが破損している可能性があります）'], counts: {} };
  }
  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, errors: ['FP Master のバックアップ形式ではありません'], counts: {} };
  }
  const b = migrateBackup(parsed.data);
  if (b.schemaVersion > DB_SCHEMA_VERSION) {
    errors.push(`新しいバージョンのアプリで作成されたバックアップです（形式 v${b.schemaVersion}）。アプリを更新してから復元してください。`);
  }
  const counts: BackupInspection['counts'] = {};
  for (const t of TABLE_NAMES) {
    const rows = b.tables[t] ?? [];
    let bad = 0;
    for (const r of rows) if (!rowSchemas[t].safeParse(r).success) bad++;
    if (bad) errors.push(`${t}: ${bad}件のデータが不正です`);
    const pk = PRIMARY_KEY[t];
    let duplicates = 0;
    if (t === 'attempts') {
      // 解答履歴は自動採番のため、内容（問題・時刻・正誤）で重複を判定
      const existing = new Set((await db.attempts.toArray()).map(attemptSig));
      duplicates = rows.filter((r) => existing.has(attemptSig(r as Record<string, unknown>))).length;
    } else if (pk !== 'id' || t === 'sessions') {
      const keys = rows.map((r) => (r as Record<string, unknown>)[pk]).filter((k) => k !== undefined) as string[];
      duplicates = keys.length ? await db.table(t).where(pk).anyOf(keys).count() : 0;
    }
    counts[t] = { total: rows.length, duplicates };
  }
  for (const k of Object.keys(b.tables)) {
    if (!(TABLE_NAMES as readonly string[]).includes(k)) errors.push(`未知のデータ「${k}」が含まれています（無視されます）`);
  }
  const fatal = errors.filter((e) => !e.includes('無視されます'));
  return { ok: fatal.length === 0, errors, schemaVersion: b.schemaVersion, exportedAt: b.exportedAt, counts, backup: b };
}

function attemptSig(o: object): string {
  const r = o as Record<string, unknown>;
  return `${String(r.itemId)}|${String(r.at)}|${String(r.correct)}`;
}

/** 旧形式のバックアップを現在の形式に変換（現在 v1 のみ） */
export function migrateBackup(b: Backup): Backup {
  return b;
}

export type RestoreMode = 'merge' | 'replace';

/**
 * 復元。merge: 既存データを残し、重複しないものを追加（同一キーは、復習予定・メモ・用語の状態・演習は更新日時が新しい方を残し、
 *        ブックマーク・あとで解く・設定はバックアップ側で上書き）
 * replace: 全データをバックアップの内容に置き換える
 * いずれも単一トランザクションで実行し、途中で失敗した場合は変更前の状態に戻る。
 */
export async function restoreBackup(db: FpDb, inspection: BackupInspection, mode: RestoreMode): Promise<void> {
  if (!inspection.ok || !inspection.backup) throw new Error('検証に失敗したバックアップは復元できません');
  const b = inspection.backup;
  await db.transaction('rw', TABLE_NAMES.map((t) => db.table(t)), async () => {
    for (const t of TABLE_NAMES) {
      const rows = (b.tables[t] ?? []) as Record<string, unknown>[];
      const table = db.table(t);
      if (mode === 'replace') {
        await table.clear();
        await table.bulkAdd(rows);
        continue;
      }
      if (t === 'attempts') {
        const existing = new Set((await db.attempts.toArray()).map(attemptSig));
        const fresh = rows.filter((r) => !existing.has(attemptSig(r))).map(({ id: _id, ...rest }) => rest);
        await table.bulkAdd(fresh);
      } else if (t === 'mockResults' || t === 'reports') {
        const existing = new Set((await table.toArray()).map((r: Record<string, unknown>) => JSON.stringify({ ...r, id: undefined })));
        const fresh = rows.filter((r) => !existing.has(JSON.stringify({ ...r, id: undefined }))).map(({ id: _id, ...rest }) => rest);
        await table.bulkAdd(fresh);
      } else if (t in NEWER_STAMP) {
        // 統合では「今のデータを残す」ため、同じキーの行は更新日時が新しい方を採用する
        // （古いバックアップで復習予定・メモ・用語の状態・中断中の演習を巻き戻さない）
        const stamp = NEWER_STAMP[t as keyof typeof NEWER_STAMP];
        const pk = PRIMARY_KEY[t];
        const keys = rows.map((r) => r[pk]).filter((k): k is string => typeof k === 'string');
        const current = new Map<string, Record<string, unknown>>();
        for (const r of (await table.where(pk).anyOf(keys).toArray()) as Record<string, unknown>[]) current.set(String(r[pk]), r);
        await table.bulkPut(rows.filter((r) => backupRowWins(r, current.get(String(r[pk])), stamp)));
      } else {
        await table.bulkPut(rows);
      }
    }
  });
}

/** 統合復元で「新しい方を残す」判定に使う列（ISO 日時または YYYY-MM-DD。文字列比較で新旧を判定できる） */
const NEWER_STAMP = { srs: 'last', notes: 'updatedAt', termState: 'updatedAt', sessions: 'updatedAt' } as const;

/**
 * 統合復元で、バックアップの行を採用するか。
 * 既存の行がない／既存の行に日時がない場合はバックアップを採用し、
 * バックアップ側に日時がない場合と、日時が同じか古い場合は既存の行を残す。
 */
export function backupRowWins(backupRow: Record<string, unknown>, existing: Record<string, unknown> | undefined, stamp: string): boolean {
  if (!existing) return true;
  const cur = existing[stamp];
  const inc = backupRow[stamp];
  if (typeof cur !== 'string' || !cur) return true;
  if (typeof inc !== 'string' || !inc) return false;
  return inc > cur;
}
