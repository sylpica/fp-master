import { describe, expect, it } from 'vitest';
import glossaryJson from '../../src/content/glossary.json';
import questionTermsJson from '../../src/content/question-terms.json';
import syllabus from '../../scripts/original/syllabus_fp2.json';
import { TermSchema, type Term } from '../../src/domain/types';
import { buildMatcher, linkTerms } from '../../src/domain/termlink';

const terms = (glossaryJson as unknown[]).map((t) => TermSchema.parse(t)) as Term[];
const syllabusKeys = new Set((syllabus as { items: { key: string }[] }).items.map((i) => i.key));

describe('用語集データ（拡充フィールドの健全性）', () => {
  it('全用語に法令基準日があり、試験の基準日と一致する', () => {
    for (const t of terms) {
      expect(t.lawBaseDate, t.id).toBe('2026-04-01');
    }
  });

  it('全用語に具体例（example）がある（EXT-M12）', () => {
    const missing = terms.filter((t) => !t.example || t.example.trim().length < 10).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('topics は実在する細目キーだけを指す', () => {
    for (const t of terms) {
      for (const k of t.topics ?? []) {
        expect(syllabusKeys.has(k), `${t.id}: ${k}`).toBe(true);
      }
    }
  });

  it('facts/cautions/compare は空でない文だけを含む', () => {
    for (const t of terms) {
      for (const arr of [t.facts, t.cautions, t.compare]) {
        for (const s of arr ?? []) {
          expect(s.trim().length, t.id).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('最長一致：相続税の基礎控除は相続税側の用語にリンクする', () => {
    const m = buildMatcher(terms);
    const parts = linkTerms('相続税の基礎控除は、3,000万円に法定相続人の数に応じた金額を加えたものである。', m);
    const linked = parts.flatMap((p) => (typeof p === 'string' ? [] : [p.term.id]));
    expect(linked).toContain('sozokuzei-kiso-kojo');
    expect(linked).not.toContain('kiso-kojo');
  });

  it('最長一致：単独の基礎控除は所得税側の用語にリンクする', () => {
    const m = buildMatcher(terms);
    const parts = linkTerms('基礎控除は合計所得金額に応じて逓減する。', m);
    const linked = parts.flatMap((p) => (typeof p === 'string' ? [] : [p.term.id]));
    expect(linked).toContain('kiso-kojo');
  });

  it('リンク対応率：用語の9割以上が少なくとも1問と結びついている', () => {
    const used = new Set(Object.values(questionTermsJson as Record<string, string[]>).flat());
    const covered = terms.filter((t) => used.has(t.id)).length;
    expect(covered / terms.length).toBeGreaterThanOrEqual(0.9);
  });
});
