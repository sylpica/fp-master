import { useState } from 'react';
import { Frac } from '../domain/decimal';

/**
 * 計算トレーニング用の電卓（四則演算・括弧）。
 * 入力式を有理数で厳密に評価するため、0.1+0.2 のような浮動小数点誤差が出ない。
 */
export function evaluate(expr: string): Frac {
  const tokens = expr.replace(/\s+/g, '').match(/\d+(?:\.\d+)?|[+\-×÷*/()]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const parseExpr = (): Frac => {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = parseTerm();
      v = op === '+' ? v.add(r) : v.sub(r);
    }
    return v;
  };
  const parseTerm = (): Frac => {
    let v = parseFactor();
    while (peek() === '×' || peek() === '÷' || peek() === '*' || peek() === '/') {
      const op = next();
      const r = parseFactor();
      v = op === '×' || op === '*' ? v.mul(r) : v.div(r);
    }
    return v;
  };
  const parseFactor = (): Frac => {
    const t = next();
    if (t === '-') return Frac.of(0).sub(parseFactor());
    if (t === '(') {
      const v = parseExpr();
      if (next() !== ')') throw new Error('括弧が閉じていません');
      return v;
    }
    if (t === undefined || !/^\d/.test(t)) throw new Error('式が正しくありません');
    return Frac.of(t);
  };
  const v = parseExpr();
  if (i !== tokens.length) throw new Error('式が正しくありません');
  return v;
}

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+'];

export function Calculator({ onUse }: { onUse?: (v: number) => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const press = (k: string) => {
    setError(null);
    if (k === '=') {
      try {
        const v = evaluate(expr);
        setResult(v.toDecimalString(8));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラー');
      }
      return;
    }
    if (result !== null && /[\d.]/.test(k)) {
      setExpr(k);
      setResult(null);
      return;
    }
    if (result !== null) {
      setExpr(result + k);
      setResult(null);
      return;
    }
    setExpr(expr + k);
  };
  return (
    <div className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-800" aria-label="電卓">
      <div className="mb-2 min-h-14 rounded-xl bg-white px-3 py-2 text-right font-mono dark:bg-slate-900" aria-live="polite">
        <div className="break-all text-sm text-slate-600 dark:text-slate-400">{expr || '0'}</div>
        <div className="text-xl font-bold tabular-nums">{error ?? (result !== null ? Number(result).toLocaleString('ja-JP', { maximumFractionDigits: 8 }) : '')}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button className="btn-secondary min-h-11" onClick={() => { setExpr(''); setResult(null); setError(null); }}>
          C
        </button>
        <button className="btn-secondary min-h-11" onClick={() => setExpr(expr.slice(0, -1))} aria-label="1文字削除">
          ⌫
        </button>
        <button className="btn-secondary min-h-11" onClick={() => press('(')}>
          (
        </button>
        <button className="btn-secondary min-h-11" onClick={() => press(')')}>
          )
        </button>
        {KEYS.map((k) => (
          <button key={k} className={`btn min-h-11 ${k === '=' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-slate-900'}`} onClick={() => press(k)} aria-label={k === '-' ? 'マイナス' : k}>
            {k}
          </button>
        ))}
      </div>
      {onUse && result !== null && (
        <button className="btn-ghost mt-2 w-full" onClick={() => onUse(Number(result))}>
          この値を解答欄に入れる
        </button>
      )}
    </div>
  );
}
