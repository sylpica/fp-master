import type { Part, Question } from './types';

/** 解答欄ごとのユーザー解答 */
export type PartResponse =
  | { kind: 'truefalse'; value: boolean }
  | { kind: 'choice'; value: string }
  | { kind: 'numeric'; value: number };

export type Responses = Record<string, PartResponse | undefined>;

export interface PartResult {
  partId: string;
  answered: boolean;
  correct: boolean;
}

export interface QuestionResult {
  correct: boolean;
  /** 全解答欄に回答済みか */
  complete: boolean;
  parts: PartResult[];
}

/**
 * 数値入力の比較。浮動小数点誤差を避けるため、正答の小数桁数に合わせて
 * 整数化して比較する（例：1.25 → 125 / 100）。
 */
export function numericEquals(input: number, answer: number): boolean {
  if (!Number.isFinite(input) || !Number.isFinite(answer)) return false;
  const decimals = Math.max(decimalPlaces(answer), decimalPlaces(input));
  const scale = 10 ** Math.min(decimals, 10);
  return Math.round(input * scale) === Math.round(answer * scale);
}

/**
 * 数値入力欄の文字列を数値に変換する。空欄・数値として読めない入力は null。
 * 日本語入力の全角数字・全角カンマ・全角マイナス（−）、桁区切りのカンマ・空白を受け付ける。
 */
export function parseNumericInput(raw: string): number | null {
  const s = raw
    .normalize('NFKC')
    .replace(/[\u2212\u2010-\u2015\uFF0D]/g, '-')
    .replace(/[,\s]/g, '');
  if (s === '' || !/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function decimalPlaces(n: number): number {
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function scorePart(part: Part, response: PartResponse | undefined): PartResult {
  if (!response || response.kind !== part.kind) {
    return { partId: part.id, answered: false, correct: false };
  }
  let correct = false;
  switch (part.kind) {
    case 'truefalse':
      correct = response.value === part.answer;
      break;
    case 'choice':
      correct = response.value === part.answer;
      break;
    case 'numeric':
      correct = numericEquals(response.value as number, part.answer);
      break;
  }
  return { partId: part.id, answered: true, correct };
}

/**
 * 1問の採点。複数解答欄のある問題は、すべての欄が正解のときのみ正解とする
 * （本試験の部分点の扱いは公表されていないため独自仕様）。
 */
export function scoreQuestion(q: Pick<Question, 'parts'>, responses: Responses): QuestionResult {
  const parts = q.parts.map((p) => scorePart(p, responses[p.id]));
  return {
    parts,
    complete: parts.every((p) => p.answered),
    correct: parts.length > 0 && parts.every((p) => p.correct),
  };
}

/** 正答を人が読める文字列で返す */
export function formatAnswer(part: Part): string {
  switch (part.kind) {
    case 'truefalse':
      return part.answer ? '〇（適切）' : '×（不適切）';
    case 'choice': {
      const c = part.choices.find((x) => x.id === part.answer);
      return c ? `${part.answer}) ${c.text}` : part.answer;
    }
    case 'numeric':
      return `${part.answer.toLocaleString('ja-JP')}${part.unit ?? ''}`;
  }
}
