import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QuestionSetSchema, TermSchema, type Question, type QuestionSet } from '../../src/domain/types';
import { blueprintFor } from '../../src/domain/mock';
import syllabusLit from '../../scripts/original/syllabus_lit.json';

const dir = join(__dirname, '../../src/content/questions');
const sets: QuestionSet[] = readdirSync(dir)
  .filter((f) => /^lit_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
const qs: Question[] = sets.flatMap((s) => s.questions);
const expl = JSON.parse(readFileSync(join(__dirname, '../../src/content/explanations.json'), 'utf-8')) as Record<
  string,
  { explanation: { status: string; short: string } }
>;
const syllabusKeys = new Set((syllabusLit as { items: { key: string; field: string }[] }).items.map((i) => i.key));

describe('金融リテラシー検定（lit）オリジナル問題の検証', () => {
  it('10セット・250問がそろい、スキーマに適合する', () => {
    expect(sets).toHaveLength(10);
    expect(qs).toHaveLength(250);
    for (const s of sets) {
      const r = QuestionSetSchema.safeParse(s);
      if (!r.success) throw new Error(`${s.id}: ${r.error.message}`);
      expect(s.exam).toBe('lit');
      expect(s.officialSet).toBe(false);
      expect(s.lawBaseDate).toBe('2026-04-01');
    }
    for (const q of qs) {
      expect(q.exam).toBe('lit');
      expect(q.source.kind).toBe('original');
      if (q.source.kind === 'original') expect(q.source.basis.length).toBeGreaterThan(0);
      expect(q.status).toBe('verified');
      expect(q.lawBaseDate).toBe('2026-04-01');
    }
  });

  it('分野ごとに50問（正誤35問＋三答択一15問）で、本試験の形式比率を再現する', () => {
    for (const f of ['A', 'B', 'C', 'D', 'E'] as const) {
      const inField = qs.filter((q) => q.field === f);
      expect(inField, `分野${f}`).toHaveLength(50);
      const tf = inField.filter((q) => q.parts[0]!.kind === 'truefalse');
      const mc = inField.filter((q) => q.parts[0]!.kind === 'choice');
      expect(tf, `分野${f} 正誤`).toHaveLength(35);
      expect(mc, `分野${f} 三択`).toHaveLength(15);
      for (const q of mc) {
        const p = q.parts[0]!;
        if (p.kind === 'choice') expect(p.choices, q.id).toHaveLength(3);
      }
    }
  });

  it('論点キーは独自シラバス（syllabus_lit.json）の細目と一致し、分野と合っている', () => {
    for (const q of qs) {
      expect(q.topic, q.id).toBeTruthy();
      expect(syllabusKeys.has(q.topic!), `${q.id}: ${q.topic}`).toBe(true);
      expect(q.topic![0], q.id).toBe(q.field);
      expect(q.level, q.id).toBeGreaterThanOrEqual(1);
      expect(q.level, q.id).toBeLessThanOrEqual(5);
    }
  });

  it('全問に解説があり、正解表示が正答と一致する（照合状態は draft / verified のいずれか）', () => {
    for (const q of qs) {
      const e = expl[q.id]?.explanation;
      expect(e, `${q.id} の解説`).toBeTruthy();
      // 根拠引用のオンライン照合は統括側で実施するため、ここでは verified を要求しない
      expect(['draft', 'verified'], `${q.id} の照合状態`).toContain(e!.status);
      const p = q.parts[0]!;
      if (p.kind === 'truefalse') expect(e!.short, q.id).toContain(p.answer ? '正解は○' : '正解は×');
      if (p.kind === 'choice') expect(e!.short, q.id).toContain(`正解は${p.answer})`);
    }
  });

  it('模擬試験ブループリントは分野ごとに正誤7問＋三択3問（合計50問）', () => {
    const bp = blueprintFor('lit');
    expect(bp.slots).toHaveLength(10);
    const total = bp.slots.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(50);
    for (const f of ['A', 'B', 'C', 'D', 'E'] as const) {
      expect(bp.slots.find((s) => s.field === f && s.kind === 'truefalse')?.count).toBe(7);
      expect(bp.slots.find((s) => s.field === f && s.kind === 'choice')?.count).toBe(3);
    }
  });

  it('用語スキーマは grades の lit と litField を受け付ける', () => {
    const base = {
      id: 'lit-sample',
      name: 'サンプル',
      reading: 'さんぷる',
      short: '短い説明',
      detail: '詳しい説明',
      related: [],
      importance: 2,
      field: 'A',
      reviewStatus: 'draft',
      sources: [{ title: '出典', url: 'https://example.com/' }],
      checkedAt: '2026-11-25',
    };
    expect(TermSchema.safeParse({ ...base, grades: ['lit'] }).success).toBe(true);
    expect(TermSchema.safeParse({ ...base, grades: [2, 3, 'lit'], litField: 'D' }).success).toBe(true);
    expect(TermSchema.safeParse({ ...base, grades: ['fp'] }).success).toBe(false);
  });
});
