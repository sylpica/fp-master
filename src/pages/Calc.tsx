import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CALC_GENERATORS, getGenerator, type CalcProblem, type Difficulty } from '../domain/calc';
import { FIELD_IDS, FIELDS } from '../domain/exam';
import { createRng, newSeed, pick } from '../domain/random';
import { numericEquals, parseNumericInput } from '../domain/scoring';
import { eligibleForCalc } from '../domain/selection';
import { db } from '../db/db';
import { recordAttempt } from '../db/repo';
import { TermPopupProvider, TermText } from '../ui/TermText';
import { useContent } from '../content/store';
import { useSettings } from '../state/settings';
import { startPractice } from '../state/sessions';
import { useExamKey } from '../ui/hooks';
import { PageNote, PageTitle } from '../ui/Layout';
import { Calculator } from '../ui/Calculator';
import { Tex, pct } from '../ui/common';

interface PatternStat {
  attempts: number;
  correct: number;
}

function usePatternStats() {
  return useLiveQuery(async () => {
    const xs = await db.attempts.where('itemKind').equals('calc').toArray();
    const byGen = new Map<string, PatternStat>();
    const byPattern = new Map<string, PatternStat & { gen: string }>();
    for (const a of xs) {
      const gen = a.itemId.split(':')[0]!;
      const g = byGen.get(gen) ?? { attempts: 0, correct: 0 };
      g.attempts++;
      if (a.correct) g.correct++;
      byGen.set(gen, g);
      const key = `${gen}|${a.pattern ?? ''}`;
      const p = byPattern.get(key) ?? { attempts: 0, correct: 0, gen };
      p.attempts++;
      if (a.correct) p.correct++;
      byPattern.set(key, p);
    }
    return { byGen, byPattern, mistakes: xs.filter((a) => !a.correct).slice(-30).reverse() };
  }, []);
}

/** 計算トレーニング（通常演習から独立したモード） */
export function CalcHomePage() {
  const stats = usePatternStats();
  const exam = useExamKey();
  const settings = useSettings();
  const { questions } = useContent();
  const nav = useNavigate();
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const pastCalc = useMemo(() => (exam ? eligibleForCalc(questions, [exam]) : []), [questions, exam]);
  const grade = settings?.grade ?? 3;
  const weak = useMemo(() => {
    if (!stats) return [];
    return [...stats.byPattern.entries()]
      .filter(([, v]) => v.attempts >= 3 && v.correct / v.attempts < 0.7)
      .sort((a, b) => a[1].correct / a[1].attempts - b[1].correct / b[1].attempts)
      .slice(0, 5);
  }, [stats]);

  return (
    <div className="space-y-4">
      <PageTitle>計算トレーニング</PageTitle>
      <div role="radiogroup" aria-label="難易度" className="flex gap-2">
        {([1, 2, 3] as const).map((d) => (
          <button key={d} role="radio" aria-checked={difficulty === d} className={`chip ${difficulty === d ? 'chip-on' : ''}`} onClick={() => setDifficulty(d)}>
            {{ 1: '基本', 2: '標準', 3: '応用' }[d]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link to={`/calc/run/mix?d=${difficulty}`} className="btn-primary">
          ミックス演習
        </Link>
        <Link to={`/calc/run/weak?d=${difficulty}`} className="btn-secondary">
          苦手パターン優先
        </Link>
      </div>
      {FIELD_IDS.map((f) => {
        const gens = CALC_GENERATORS.filter((g) => g.field === f && g.grades.includes(grade));
        if (!gens.length) return null;
        return (
          <section key={f} className="card">
            <h2 className="mb-1 font-bold">{FIELDS[f].name}</h2>
            <ul>
              {gens.map((g) => {
                const s = stats?.byGen.get(g.id);
                return (
                  <li key={g.id}>
                    <Link to={`/calc/run/${g.id}?d=${difficulty}`} className="flex min-h-12 items-center justify-between border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
                      <span>{g.title}</span>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{s ? `${pct(s.correct / s.attempts)}（${s.attempts}問）` : '未学習'} ›</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <section className="card space-y-2">
        <h2 className="font-bold">過去問の計算問題</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">公式過去問のうち、解答に計算が必要な問題（{pastCalc.length}問）を選択式で解きます。</p>
        <button
          className="btn-secondary w-full"
          disabled={!pastCalc.length || !exam}
          onClick={async () => {
            if (!exam) return;
            const r = await startPractice(pastCalc, { exams: [exam], count: 10, filter: 'all', includeCalc: true, order: 'random' }, '過去問の計算問題', false);
            if (r.sessionId) nav(`/session/${r.sessionId}`);
          }}
        >
          過去問の計算問題を解く
        </button>
      </section>
      {weak.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">苦手な計算パターン</h2>
          <ul className="space-y-1 text-sm">
            {weak.map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span>
                  {getGenerator(v.gen)?.title}：{k.split('|')[1]}
                </span>
                <span className="tabular-nums">{pct(v.correct / v.attempts)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {stats && stats.mistakes.length > 0 && (
        <details className="card">
          <summary className="min-h-10 cursor-pointer font-bold">計算ミスの記録（最近30件）</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {stats.mistakes.map((m) => (
              <li key={m.id}>
                {new Date(m.at).toLocaleDateString('ja-JP')} {getGenerator(m.itemId.split(':')[0]!)?.title}／{m.pattern}：入力 {m.given ?? '—'}
              </li>
            ))}
          </ul>
        </details>
      )}
      <PageNote>
        <p>数値を変えて何度でも練習できます。答えは検証済みの計算ロジックで算出しています。</p>
      </PageNote>
    </div>
  );
}

function chooseGenerator(gen: string, grade: 2 | 3, weakGens: string[], rng: () => number) {
  const pool = CALC_GENERATORS.filter((g) => g.grades.includes(grade));
  if (gen === 'mix') return pick(rng, pool);
  if (gen === 'weak') return weakGens.length && rng() < 0.75 ? getGenerator(pick(rng, weakGens))! : pick(rng, pool);
  return getGenerator(gen);
}

export function CalcRunPage() {
  const { gen = 'mix' } = useParams();
  const [params] = useSearchParams();
  const difficulty = (Number(params.get('d')) || 1) as Difficulty;
  const settings = useSettings();
  const stats = usePatternStats();
  const { termById } = useContent();
  const [problem, setProblem] = useState<CalcProblem | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<null | boolean>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [count, setCount] = useState({ done: 0, correct: 0 });
  const shownAt = useRef(Date.now());

  const weakGens = useMemo(
    () => (stats ? [...stats.byGen.entries()].filter(([, v]) => v.attempts >= 3 && v.correct / v.attempts < 0.7).map(([k]) => k) : []),
    [stats],
  );

  const nextProblem = (sameGen?: string) => {
    const seed = newSeed();
    const g = sameGen ? getGenerator(sameGen) : chooseGenerator(gen, settings?.grade ?? 3, weakGens, createRng(seed));
    if (!g) return;
    setProblem(g.generate(seed, difficulty));
    setInput('');
    setChecked(null);
    shownAt.current = Date.now();
  };
  useEffect(() => {
    if (settings && !problem) nextProblem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  if (!problem) return <p role="status">問題を生成中…</p>;
  const generator = getGenerator(problem.generatorId)!;
  const value = parseNumericInput(input);
  const check = async () => {
    if (value === null) return;
    const ok = numericEquals(value, problem.answer);
    setChecked(ok);
    setCount((c) => ({ done: c.done + 1, correct: c.correct + (ok ? 1 : 0) }));
    await recordAttempt({
      itemId: problem.id,
      itemKind: 'calc',
      field: generator.field,
      pattern: problem.pattern,
      correct: ok,
      timeMs: Date.now() - shownAt.current,
      mode: 'calc',
      given: ok ? undefined : input,
    });
  };

  return (
    <TermPopupProvider>
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between pt-3">
        <Link to="/calc" className="min-h-10 px-1 text-sm text-slate-600 dark:text-slate-400">
          ← 計算トレーニング
        </Link>
        <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">
          {count.correct} / {count.done} 正解
        </span>
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-400">
        {generator.title}／{problem.pattern}／{{ 1: '基本', 2: '標準', 3: '応用' }[difficulty]}
      </div>
      <p className="qtext"><TermText text={problem.prompt} /></p>
      <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {problem.given.map((g) => (
          <div key={g.label} className="contents">
            <dt className="text-slate-600 dark:text-slate-400">{g.label}</dt>
            <dd className="tabular-nums">{g.value}</dd>
          </div>
        ))}
      </dl>
      {problem.roundingNote && <p className="text-sm text-slate-600 dark:text-slate-400">端数処理：{problem.roundingNote}</p>}
      <div className="flex items-center gap-2">
        <input
          className="input text-right text-lg tabular-nums"
          inputMode="decimal"
          aria-label="答えを入力"
          value={input}
          disabled={checked !== null}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          placeholder="答え"
        />
        <span className="shrink-0">{problem.unit}</span>
      </div>
      {checked === null ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={() => setShowCalc(!showCalc)} aria-expanded={showCalc}>
            電卓
          </button>
          <button className="btn-primary" onClick={check} disabled={value === null}>
            答え合わせ
          </button>
        </div>
      ) : (
        <div className={`rounded-2xl p-3 text-center font-bold ${checked ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`} role="status">
          {checked ? '正解！' : `不正解　正解は ${problem.answer.toLocaleString('ja-JP')}${problem.unit}`}
        </div>
      )}
      {showCalc && checked === null && <Calculator onUse={(v) => setInput(String(v))} />}
      {checked !== null && (
        <>
          <section className="card space-y-2">
            <h2 className="font-bold">計算過程</h2>
            <ol className="list-decimal space-y-2 pl-5">
              {problem.steps.map((s, i) => (
                <li key={i}>
                  <p><TermText text={s.text} /></p>
                  {s.tex && <Tex tex={s.tex} block />}
                </li>
              ))}
            </ol>
          </section>
          <section className="card space-y-2">
            <h2 className="font-bold">使う公式</h2>
            {problem.formulas.map((f) => (
              <div key={f.name}>
                <div className="label">{f.name}</div>
                <Tex tex={f.tex} block />
                {f.explain && <p className="text-sm text-slate-600 dark:text-slate-400"><TermText text={f.explain} /></p>}
              </div>
            ))}
            <p className="text-xs text-slate-600 dark:text-slate-400">
              根拠：{generator.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              ))}
              （{generator.basis}）
            </p>
          </section>
          {problem.relatedTerms.some((t) => termById.has(t)) && (
            <div className="flex flex-wrap gap-2">
              {problem.relatedTerms
                .filter((t) => termById.has(t))
                .map((t) => (
                  <Link key={t} to={`/glossary/${t}`} className="chip">
                    {termById.get(t)!.name}
                  </Link>
                ))}
              <Link to={`/cards/run?term=${problem.relatedTerms.join(',')}`} className="chip">
                関連の暗記カード
              </Link>
            </div>
          )}
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => nextProblem(problem.generatorId)}>
                数値を変えて再挑戦
              </button>
              <button className="btn-primary" onClick={() => nextProblem()} autoFocus>
                次の問題
              </button>
            </div>
          </div>
        </>
      )}
    </div>
    </TermPopupProvider>
  );
}
