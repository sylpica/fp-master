import { useState } from 'react';
import { Link } from 'react-router';
import type { Part, Question } from '../domain/types';
import { formatAnswer, parseNumericInput, scoreQuestion, type PartResponse, type QuestionResult, type Responses } from '../domain/scoring';
import { EXAM_SPECS } from '../domain/exam';
import { useContent } from '../content/store';
import { FieldBadge } from './common';
import { TermChips, TermText } from './TermText';
import { useCurrentLawBaseDate } from './hooks';

/** 出典表示（日本FP協会の利用条件に基づく出典明記） */
export function SourceLine({ q }: { q: Question }) {
  if (q.source.kind === 'official') {
    return (
      <p className="text-xs text-slate-600 dark:text-slate-400">
        出典：{q.source.citation} 問{q.source.number}
        {q.source.modified && '（加工して作成）'}
      </p>
    );
  }
  return <p className="text-xs text-slate-600 dark:text-slate-400">オリジナル問題（FP Master作成・公式問題ではありません）</p>;
}

export function LawNotice({ q }: { q: Question }) {
  const { lawByQuestion } = useContent();
  const current = useCurrentLawBaseDate();
  const changes = lawByQuestion.get(q.id) ?? [];
  const older = current && q.lawBaseDate < current;
  if (!older && changes.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      {older && (
        <p>
          この問題は <b>{q.lawBaseDate}</b> 時点の法令に基づいています（現在の試験の法令基準日：{current}）。
        </p>
      )}
      {changes.map(({ change, impact }) => (
        <p key={change.id} className="mt-1">
          関連する制度改正：
          <Link to={`/law#${change.id}`} className="underline">
            {change.title}
          </Link>
          （{impact.impact === 'unchanged' ? '正答への影響なし' : impact.impact === 'changed' ? '正答が変わります' : '影響を確認中'}）— {impact.note}
        </p>
      ))}
    </div>
  );
}

export function QuestionHeader({ q, index, total }: { q: Question; index?: number; total?: number }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
      {index !== undefined && total !== undefined && (
        <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {index + 1} / {total}
        </span>
      )}
      <FieldBadge field={q.field} />
      <span>{q.theme}</span>
      <span className="text-xs">{EXAM_SPECS[q.exam].shortLabel}</span>
      {q.source.kind === 'original' && <span className="badge bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">オリジナル</span>}
      {q.level && (
        <span className="badge bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" title="難易度：1基礎・2標準・3応用・4高難度・5最難関">
          難易度 Lv{q.level}
        </span>
      )}
      {q.requiresCalculation && <span className="badge bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100">計算</span>}
    </div>
  );
}

export function Stem({ q }: { q: Question }) {
  const sharedImgs = q.materials?.filter((m) => m.kind === 'image' && m.shared) ?? [];
  const img = q.materials?.find((m) => m.kind === 'image' && !m.shared);
  return (
    <div className="space-y-3">
      {sharedImgs.map((m, i) =>
        m.kind === 'image' ? (
          <figure key={`shared-${i}`}>
            <img src={`${import.meta.env.BASE_URL}${m.src}`} alt={m.alt} className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" loading="lazy" />
            <figcaption className="mt-1 text-xs text-slate-600 dark:text-slate-400">{m.title}</figcaption>
          </figure>
        ) : null,
      )}
      {img && img.kind === 'image' && img.includesStem ? (
        <>
          <p className="sr-only">{q.stem}</p>
          <figure>
            <img src={`${import.meta.env.BASE_URL}${img.src}`} alt={img.alt} className="w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" loading="lazy" />
            <figcaption className="mt-1 text-xs text-slate-600 dark:text-slate-400">{img.title}</figcaption>
          </figure>
        </>
      ) : (
        <p className="qtext whitespace-pre-wrap">
          <TermText text={q.stem} />
        </p>
      )}
      {q.materials
        ?.filter((m) => m !== img && !sharedImgs.includes(m))
        .map((m, i) =>
          m.kind === 'table' ? (
            <div key={i} className="overflow-x-auto">
              {m.title && <div className="label mb-1">{m.title}</div>}
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {m.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((c, ci) => (
                        <td key={ci} className="border border-slate-300 px-2 py-1 dark:border-slate-700">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : m.kind === 'text' ? (
            <pre key={i} className="overflow-x-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">
              {m.body}
            </pre>
          ) : (
            <img key={i} src={`${import.meta.env.BASE_URL}${m.src}`} alt={m.alt} className="w-full rounded-lg" loading="lazy" />
          ),
        )}
    </div>
  );
}

type Mode = 'practice' | 'exam';

/**
 * 解答欄。practice モードでは単一欄の問題はワンタップで解答確定、
 * exam モード（模擬試験）では選択のみ行い正誤は表示しない。
 */
export function AnswerArea({
  q,
  responses,
  onChange,
  onSubmit,
  result,
  mode,
}: {
  q: Question;
  responses: Responses;
  onChange: (r: Responses) => void;
  onSubmit?: (r: Responses) => void;
  result?: QuestionResult;
  mode: Mode;
}) {
  const single = q.parts.length === 1 && q.parts[0]!.kind !== 'numeric';
  const set = (part: Part, v: PartResponse | undefined) => {
    // 数値欄を空にした・読めない値にしたときは、前に入力した値を解答として残さない
    const next = { ...responses, [part.id]: v };
    if (v === undefined) delete next[part.id];
    onChange(next);
    if (v !== undefined && mode === 'practice' && single && onSubmit) onSubmit(next);
  };
  return (
    <div className="mt-4 space-y-4">
      {q.parts.map((p) => (
        <PartInput key={p.id} part={p} value={responses[p.id]} onSelect={(v) => set(p, v)} result={result?.parts.find((r) => r.partId === p.id)} locked={!!result} mode={mode} showPartResult={q.parts.length > 1 || p.kind === 'numeric'} />
      ))}
      {mode === 'practice' && !single && !result && (
        <button className="btn-primary w-full" disabled={!scoreQuestion(q, responses).complete} onClick={() => onSubmit?.(responses)}>
          解答する
        </button>
      )}
    </div>
  );
}

function PartInput({
  part,
  value,
  onSelect,
  result,
  locked,
  mode,
  showPartResult,
}: {
  part: Part;
  value: PartResponse | undefined;
  onSelect: (v: PartResponse | undefined) => void;
  result?: { correct: boolean };
  locked: boolean;
  mode: Mode;
  showPartResult: boolean;
}) {
  const [num, setNum] = useState(value?.kind === 'numeric' ? String(value.value) : '');
  const reveal = mode === 'practice' && locked;
  const style = (selected: boolean, isAnswer: boolean) => {
    if (reveal && isAnswer) return 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50';
    if (reveal && selected && !isAnswer) return 'border-rose-600 bg-rose-50 dark:bg-rose-950/50';
    if (selected) return 'border-brand-700 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/40';
    return 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900';
  };
  return (
    <fieldset>
      {part.prompt && <legend className="label mb-2">{part.prompt}</legend>}
      {part.kind === 'truefalse' && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: true, label: '〇', sub: '適切' },
            { v: false, label: '×', sub: '不適切' },
          ].map((o) => {
            const selected = value?.kind === 'truefalse' && value.value === o.v;
            return (
              <button
                key={String(o.v)}
                type="button"
                disabled={locked}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: 'truefalse', value: o.v })}
                className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 text-3xl font-bold ${style(selected, part.answer === o.v)}`}
              >
                {o.label}
                <span className="text-xs font-normal text-slate-600 dark:text-slate-400">{o.sub}</span>
              </button>
            );
          })}
        </div>
      )}
      {part.kind === 'choice' && (
        <div className="space-y-2.5">
          {part.choices.map((c) => {
            const selected = value?.kind === 'choice' && value.value === c.id;
            return (
              <div key={c.id}>
              <button
                type="button"
                disabled={locked}
                aria-pressed={selected}
                onClick={() => onSelect({ kind: 'choice', value: c.id })}
                className={`flex min-h-14 w-full items-start gap-3 rounded-2xl border-2 p-3 text-left ${style(selected, part.answer === c.id)}`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold dark:bg-slate-800">{c.id}</span>
                <span className="qtext">{c.text}</span>
              </button>
              <TermChips text={c.text} />
              </div>
            );
          })}
        </div>
      )}
      {part.kind === 'numeric' && (
        <div className="flex items-center gap-2">
          <input
            className="input text-right text-lg tabular-nums"
            inputMode="decimal"
            value={num}
            disabled={locked}
            aria-label={part.prompt ?? '数値を入力'}
            onChange={(e) => {
              setNum(e.target.value);
              const v = parseNumericInput(e.target.value);
              onSelect(v === null ? undefined : { kind: 'numeric', value: v });
            }}
          />
          {part.unit && <span>{part.unit}</span>}
        </div>
      )}
      {reveal && result && showPartResult && (
        <p className={`mt-2 text-sm font-semibold ${result.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {result.correct ? '正解' : `不正解　正答：${formatAnswer(part)}`}
        </p>
      )}
    </fieldset>
  );
}
