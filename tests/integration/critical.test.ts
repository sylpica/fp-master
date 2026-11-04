import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { FpDb } from '../../src/db/db';
import { exportBackup, inspectBackup, restoreBackup } from '../../src/db/backup';
import { buildContent } from '../../src/content/store';
import { eligibleForCalc, eligibleForPractice, selectQuestions } from '../../src/domain/selection';
import { buildOfficialSetMock, buildRandomMock } from '../../src/domain/mock';
import type { QuestionSet } from '../../src/domain/types';
import { review } from '../../src/domain/srs';

const dir = join(__dirname, '../../src/content/questions');
const sets: QuestionSet[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
const content = buildContent(sets);
const all = content.questions;
const emptyUser = { stats: new Map(), bookmarks: new Set<string>(), later: new Set<string>(), today: '2026-10-21', weakFields: [] };

describe('出題の安全性（実データ）', () => {
  it('通常演習（初期設定）には計算問題が1問も含まれない', () => {
    for (const exam of ['g3', 'g2'] as const) {
      const pool = eligibleForPractice(all, { exams: [exam], includeCalc: false });
      expect(pool.some((q) => q.requiresCalculation)).toBe(false);
      for (let seed = 0; seed < 20; seed++) {
        const qs = selectQuestions(all, { exams: [exam], count: 100, filter: 'all', includeCalc: false, order: 'random' }, emptyUser, seed);
        expect(qs.every((q) => !q.requiresCalculation)).toBe(true);
      }
    }
  });
  it('未検証（隔離）の問題は通常演習・計算・模擬試験に出題されない', () => {
    // 実データの隔離が0件になっても検証できるよう、検証済みの問題を隔離扱いにした複製を混ぜる
    const decoys = all.filter((q) => q.status === 'verified').slice(0, 30).map((q) => ({ ...q, id: `${q.id}-quarantined`, status: 'quarantined' as const }));
    const pool = [...all, ...decoys];
    const quarantined = new Set(pool.filter((q) => q.status !== 'verified').map((q) => q.id));
    expect(quarantined.size).toBeGreaterThan(0);
    const pools = [
      eligibleForPractice(pool, { exams: ['g3', 'g2'], includeCalc: true }),
      eligibleForCalc(pool, ['g3', 'g2']),
      buildRandomMock(pool, 'g2', 1).questions,
      buildOfficialSetMock(pool, 'g2', '2025-01').questions,
    ];
    for (const p of pools) expect(p.some((q) => quarantined.has(q.id))).toBe(false);
  });
  it('模擬試験は計算問題を除外しない（公表セットの計算問題をすべて含む）', () => {
    const m = buildOfficialSetMock(all, 'g3', '2026-05');
    const expected = all.filter((q) => q.exam === 'g3' && q.source.kind === 'official' && q.source.yearMonth === '2026-05' && q.requiresCalculation && q.status === 'verified');
    expect(m.complete).toBe(true);
    expect(m.calcCount).toBe(expected.length);
    expect(m.calcCount).toBeGreaterThan(0);
  });
  it('ランダム模擬試験は本試験の分野配分（3級：各分野10問、2級：各分野10問）を満たす', () => {
    for (const exam of ['g3', 'g2'] as const) {
      const m = buildRandomMock(all, exam, 42);
      expect(m.complete).toBe(true);
      expect(m.questions).toHaveLength(60);
      for (const f of ['A', 'B', 'C', 'D', 'E', 'F']) expect(m.questions.filter((q) => q.field === f)).toHaveLength(10);
    }
  });
});

describe('学習履歴の保存', () => {
  beforeEach(async () => {
    await Dexie.delete('fp-test');
  });
  it('アプリ更新（DBを開き直す・スキーマ同版）で履歴が消えない', async () => {
    const db1 = new FpDb('fp-test');
    await db1.attempts.add({ itemId: 'g3-202605-01', itemKind: 'question', field: 'A', correct: true, timeMs: 1000, at: '2026-10-21T00:00:00Z' });
    await db1.srs.put({ key: 'q:g3-202605-01', ...review(undefined, 'good', '2026-10-21') });
    db1.close();
    const db2 = new FpDb('fp-test');
    expect(await db2.attempts.count()).toBe(1);
    expect((await db2.srs.get('q:g3-202605-01'))?.due).toBe('2026-10-23');
    db2.close();
  });
  it('バックアップ→置き換え復元で同じデータに戻る', async () => {
    const db = new FpDb('fp-test');
    await db.attempts.add({ itemId: 'x', itemKind: 'question', field: 'B', correct: false, timeMs: 1, at: '2026-10-21T01:00:00Z' });
    await db.bookmarks.put({ key: 'x', createdAt: '2026-10-21' });
    const b = await exportBackup(db);
    await db.attempts.clear();
    await db.bookmarks.clear();
    const ins = await inspectBackup(db, JSON.stringify(b));
    expect(ins.ok).toBe(true);
    await restoreBackup(db, ins, 'replace');
    expect(await db.attempts.count()).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
    db.close();
  });
  it('統合復元では重複した解答履歴を追加しない', async () => {
    const db = new FpDb('fp-test');
    await db.attempts.add({ itemId: 'x', itemKind: 'question', field: 'B', correct: false, timeMs: 1, at: '2026-10-21T01:00:00Z' });
    const ins = await inspectBackup(db, JSON.stringify(await exportBackup(db)));
    expect(ins.counts.attempts).toEqual({ total: 1, duplicates: 1 });
    await restoreBackup(db, ins, 'merge');
    expect(await db.attempts.count()).toBe(1);
    db.close();
  });
  it('統合復元では、古いバックアップで新しい復習予定・メモを巻き戻さない（新しい方を残す）', async () => {
    const db = new FpDb('fp-test');
    const older = review(undefined, 'good', '2026-10-01');
    await db.srs.put({ key: 'q:a', ...older });
    await db.notes.put({ key: 'q:a', text: '古いメモ', updatedAt: '2026-10-01T00:00:00.000Z' });
    const oldBackup = await exportBackup(db);
    // バックアップ後に端末で学習を進めた
    await db.srs.put({ key: 'q:a', ...review(older, 'good', '2026-10-05') });
    await db.notes.put({ key: 'q:a', text: '新しいメモ', updatedAt: '2026-10-05T00:00:00.000Z' });
    // バックアップにしかない行は追加される
    oldBackup.tables.srs!.push({ key: 'q:b', ...review(undefined, 'again', '2026-10-01') });
    const ins = await inspectBackup(db, JSON.stringify(oldBackup));
    expect(ins.ok).toBe(true);
    await restoreBackup(db, ins, 'merge');
    expect((await db.srs.get('q:a'))?.last).toBe('2026-10-05');
    expect((await db.notes.get('q:a'))?.text).toBe('新しいメモ');
    expect(await db.srs.get('q:b')).toBeDefined();
    db.close();
  });
  it('統合復元では、バックアップの方が新しければその行を採用する', async () => {
    const db = new FpDb('fp-test');
    await db.notes.put({ key: 'q:a', text: '端末のメモ', updatedAt: '2026-10-01T00:00:00.000Z' });
    const b = await exportBackup(db);
    b.tables.notes = [{ key: 'q:a', text: '別端末の新しいメモ', updatedAt: '2026-10-09T00:00:00.000Z' }];
    const ins = await inspectBackup(db, JSON.stringify(b));
    await restoreBackup(db, ins, 'merge');
    expect((await db.notes.get('q:a'))?.text).toBe('別端末の新しいメモ');
    db.close();
  });
  it('破損・不正なバックアップは検証で拒否され、DBは変更されない', async () => {
    const db = new FpDb('fp-test');
    await db.attempts.add({ itemId: 'keep', itemKind: 'question', field: 'A', correct: true, timeMs: 1, at: '2026-10-21T00:00:00Z' });
    for (const raw of ['{broken', '{"app":"other"}', JSON.stringify({ app: 'fp-master', schemaVersion: 1, exportedAt: 'x', tables: { attempts: [{ itemId: 1 }] } })]) {
      const ins = await inspectBackup(db, raw);
      expect(ins.ok).toBe(false);
      await expect(restoreBackup(db, ins, 'replace')).rejects.toThrow();
    }
    expect(await db.attempts.count()).toBe(1);
    db.close();
  });
  it('復元の途中で失敗した場合はロールバックされる', async () => {
    const db = new FpDb('fp-test');
    await db.attempts.add({ itemId: 'keep', itemKind: 'question', field: 'A', correct: true, timeMs: 1, at: '2026-10-21T00:00:00Z' });
    const b = await exportBackup(db);
    // 同じ主キーを2件含めて bulkAdd を失敗させる
    b.tables.bookmarks = [{ key: 'dup', createdAt: 'a' }, { key: 'dup', createdAt: 'b' }];
    const ins = await inspectBackup(db, JSON.stringify(b));
    await expect(restoreBackup(db, ins, 'replace')).rejects.toThrow();
    expect(await db.attempts.count()).toBe(1);
    expect(await db.attempts.get(1)).toMatchObject({ itemId: 'keep' });
    db.close();
  });
});

describe('法令基準日・制度改正', () => {
  it('現行制度で正答が変わる改正（changed）の問題は、通常演習・計算トレーニング・模擬試験に出題されない', () => {
    const changed = content.lawChanges
      .filter((c) => c.status === 'confirmed')
      .flatMap((c) => c.affectedQuestions.filter((a) => a.impact === 'changed').map((a) => a.id));
    // EXT-M08：公務員の iDeCo 拠出限度額（年額14万4,000円）を〇とする旧基準の公式問題
    expect(changed).toContain('g3-202405-04');
    for (const id of changed) {
      expect(content.questionById.get(id)?.status, id).toBe('quarantined');
      for (const exam of ['g3', 'g2', 'j3', 'j2'] as const) {
        expect(eligibleForPractice(all, { exams: [exam], includeCalc: true }).some((q) => q.id === id), id).toBe(false);
        expect(eligibleForCalc(all, [exam]).some((q) => q.id === id), id).toBe(false);
        for (let seed = 0; seed < 5; seed++) expect(buildRandomMock(all, exam, seed).questions.some((q) => q.id === id), id).toBe(false);
      }
    }
  });

  it('確認済みの改正が参照する問題IDはすべて実在する', () => {
    for (const c of content.lawChanges) for (const a of c.affectedQuestions) expect(content.questionById.has(a.id), a.id).toBe(true);
  });
  it('用語集の関連用語・カードの参照先が存在する', () => {
    for (const t of content.terms) for (const r of t.related) expect(content.termById.has(r)).toBe(true);
    for (const c of content.cards) if (c.termId) expect(content.termById.has(c.termId)).toBe(true);
  });
});
