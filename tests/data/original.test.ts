import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QuestionSetSchema, type Question, type QuestionSet } from '../../src/domain/types';

const dir = join(__dirname, '../../src/content/questions');
const sets: QuestionSet[] = readdirSync(dir)
  .filter((f) => /^g2o_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
const qs: Question[] = sets.flatMap((s) => s.questions);
const expl = JSON.parse(readFileSync(join(__dirname, '../../src/content/explanations.json'), 'utf-8')) as Record<
  string,
  { explanation: { status: string; short: string; choiceExplanations?: Record<string, string>; evidence: unknown[] } }
>;

describe('FP2級オリジナル問題（四答択一）の検証', () => {
  it('スキーマに適合し、公式問題ではなく「オリジナル」として出典が明示されている', () => {
    for (const s of sets) {
      const r = QuestionSetSchema.safeParse(s);
      if (!r.success) throw new Error(`${s.id}: ${r.error.message}`);
      expect(s.officialSet).toBe(false);
    }
    for (const q of qs) {
      expect(q.exam).toBe('g2');
      expect(q.source.kind).toBe('original');
      if (q.source.kind === 'original') expect(q.source.basis.length).toBeGreaterThan(0);
    }
  });

  it('四択・難易度・論点キー・法令基準日がそろっている', () => {
    for (const q of qs) {
      expect(q.parts, q.id).toHaveLength(1);
      const p = q.parts[0]!;
      expect(p.kind, q.id).toBe('choice');
      if (p.kind !== 'choice') continue;
      expect(p.choices.map((c) => c.id), q.id).toEqual(['1', '2', '3', '4']);
      expect(new Set(p.choices.map((c) => c.text)).size, q.id).toBe(4);
      expect(['1', '2', '3', '4']).toContain(p.answer);
      expect(q.level, q.id).toBeGreaterThanOrEqual(1);
      expect(q.topic, q.id).toBeTruthy();
      expect(q.topic![0], q.id).toBe(q.field);
      expect(q.lawBaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const c of p.choices) expect(c.text, q.id).not.toMatch(/[1-4１-４]\)|選択肢[1-4]/);
    }
  });

  it('全選択肢に個別解説があり、正解番号と整合し、根拠の引用が照合済み（verified）である', () => {
    for (const q of qs) {
      const e = expl[q.id]?.explanation;
      expect(e, `${q.id} の解説`).toBeTruthy();
      const p = q.parts[0]!;
      if (p.kind !== 'choice') continue;
      expect(e!.short, q.id).toContain(`正解は${p.answer})`);
      expect(Object.keys(e!.choiceExplanations ?? {}).sort(), q.id).toEqual(['1', '2', '3', '4']);
      const asksWrong = /不適切|誤っている/.test(q.stem);
      const ans = e!.choiceExplanations![p.answer]!;
      expect(ans.startsWith(asksWrong ? '不適切。' : '適切。'), `${q.id} 正解肢の判定`).toBe(true);
      for (const c of p.choices) {
        if (c.id !== p.answer) expect(e!.choiceExplanations![c.id]!.startsWith(asksWrong ? '適切。' : '不適切。'), `${q.id} ${c.id}`).toBe(true);
      }
      expect(e!.evidence.length, q.id).toBeGreaterThan(0);
      expect(e!.status, `${q.id} の根拠引用が出典ページと照合できていない`).toBe('verified');
    }
  });

  it('問題文が重複していない', () => {
    const norm = (s: string) => s.replace(/\s|[、。]/g, '');
    const seen = new Set<string>();
    for (const q of qs) {
      const p = q.parts[0]!;
      const key = norm(q.stem) + (p.kind === 'choice' ? p.choices.map((c) => norm(c.text)).sort().join('|') : '');
      expect(seen.has(key), q.id).toBe(false);
      seen.add(key);
    }
  });

  // 「最も適切」で正答肢だけが最長、「最も不適切」で正答肢だけが最短の問題か（4肢の長さがランダムなら約25%）
  const lengthCue = (q: Question): boolean => {
    const p = q.parts[0]!;
    if (p.kind !== 'choice') return false;
    const lens = p.choices.map((c) => c.text.length);
    const a = lens[Number(p.answer) - 1]!;
    const target = /不適切|誤っている/.test(q.stem) ? Math.min(...lens) : Math.max(...lens);
    return a === target && lens.filter((l) => l === target).length === 1;
  };

  it('選択肢の長さが正答の手掛かりになる問題の割合が上限以下（EXT-H01）', () => {
    // 2026-11-04 の外部監査時点 387/825（46.9%）→ 選択肢の書き直し後 262/825（31.8%）。
    // 書き直しが進んだらこの上限を下げる（悪化は禁止）。
    const CEILING = 0.32;
    const cue = qs.filter(lengthCue).length;
    expect(cue / qs.length).toBeLessThanOrEqual(CEILING);
  });

  it('どのバッチでも、長さが正答の手掛かりになる問題は40%以下（EXT-H01・check_batch の警告基準と同じ）', () => {
    const over = sets
      .map((s) => ({ id: s.id, n: s.questions.length, cue: s.questions.filter(lengthCue).length }))
      .filter((b) => b.cue / b.n > 0.4)
      .map((b) => `${b.id} ${b.cue}/${b.n}`);
    expect(over).toEqual([]);
  });

  it('正答位置が不自然に偏っていない（問題数が十分なとき各位置15〜35%）', () => {
    if (qs.length < 40) return;
    const cnt = { '1': 0, '2': 0, '3': 0, '4': 0 } as Record<string, number>;
    for (const q of qs) {
      const p = q.parts[0]!;
      if (p.kind === 'choice') cnt[p.answer]!++;
    }
    for (const k of Object.keys(cnt)) {
      const r = cnt[k]! / qs.length;
      expect(r, `位置${k}`).toBeGreaterThan(0.15);
      expect(r, `位置${k}`).toBeLessThan(0.35);
    }
  });
});

describe('生成ドキュメントと実データの一致（集計の陳腐化を防ぐ）', () => {
  const all: Question[] = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => (JSON.parse(readFileSync(join(dir, f), 'utf-8')) as QuestionSet).questions)
    .filter((q) => q.exam === 'g2' || q.exam === 'j2');
  const docs = join(__dirname, '../../docs');
  it('FP2_DIFFICULTY_AUDIT.md の総数・オリジナル数が実データと一致する（scripts/audit/gen_fp2_docs.py で再生成）', () => {
    const md = readFileSync(join(docs, 'FP2_DIFFICULTY_AUDIT.md'), 'utf-8');
    const m = md.match(/総数 (\d+)（学科 (\d+)／実技 (\d+)）、公式 (\d+)／オリジナル (\d+)/);
    expect(m).not.toBeNull();
    const original = all.filter((q) => q.source.kind === 'original').length;
    expect(m!.slice(1).map(Number)).toEqual([all.length, all.filter((q) => q.exam === 'g2').length, all.filter((q) => q.exam === 'j2').length, all.length - original, original]);
  });
  it('FP2_COVERAGE_MATRIX.md のカバー細目数が実データと一致する', () => {
    const md = readFileSync(join(docs, 'FP2_COVERAGE_MATRIX.md'), 'utf-8');
    const m = md.match(/オリジナル問題が1問以上ある細目：\*\*(\d+) \/ (\d+)\*\*/);
    expect(m).not.toBeNull();
    const topics = new Set(all.filter((q) => q.source.kind === 'original' && q.topic).map((q) => q.topic));
    expect(Number(m![1])).toBe(topics.size);
  });
});
