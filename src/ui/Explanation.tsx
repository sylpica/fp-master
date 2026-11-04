import { useState } from 'react';
import { Link } from 'react-router';
import type { Question } from '../domain/types';
import { formatAnswer } from '../domain/scoring';
import type { ExplanationMode } from '../state/settings';
import { useContent, useExplanationEntry } from '../content/store';
import { ReviewBadge, Tex, questionLabel } from './common';
import { TermText } from './TermText';
import { LawNotice, SourceLine } from './QuestionView';

/** 標準・詳細モードで簡潔解説のほかに表示できる内容があるか */
function hasExtra(q: Question, e: Question['explanation'], mode: ExplanationMode): boolean {
  if (!e) return false;
  if (e.standard || e.whyCorrect || e.wrongChoices || e.choiceExplanations) return true;
  if (mode === 'detail' && (e.detail || e.example || e.formulas?.length || e.pitfalls || e.mnemonic || e.relatedQuestions?.length)) return true;
  return choicePart(q) !== null;
}

/** 選択肢の文面が本文として載っている択一問題の解答欄（画像問題の「1」「2」だけの選択肢は対象外） */
function choicePart(q: Question) {
  const p = q.parts.length === 1 ? q.parts[0] : undefined;
  if (!p || p.kind !== 'choice') return null;
  if (p.choices.every((c) => c.text.trim() === c.id)) return null;
  return p;
}

/** 択一問題：設問が「適切／不適切」のどちらを選ぶ形式かと、各選択肢の正誤の位置づけを示す（理由は簡潔解説・出典を参照） */
function ChoiceReview({ q, notes }: { q: Question; notes?: Record<string, string> }) {
  const p = choicePart(q);
  if (!p) return null;
  const asksWrong = /不適切|誤っているもの|適切でないもの|最も不適切/.test(q.stem);
  const asksRight = !asksWrong && /適切なもの|正しいもの|最も適切|あてはまる/.test(q.stem);
  const kind = asksWrong ? '不適切なもの' : asksRight ? '適切（正しい）もの' : null;
  return (
    <div>
      <h3 className="label">選択肢の確認</h3>
      {kind && <p className="text-sm text-slate-600 dark:text-slate-400">この問題は「{kind}」を選ぶ問題です。公式の正答は {p.answer}) です。</p>}
      <ul className="mt-1 space-y-1">
        {p.choices.map((c) => (
          <li key={c.id} className="leading-relaxed">
            <b>{c.id})</b> <TermText text={c.text} />
            {c.id === p.answer && <span className="ml-1 font-semibold text-brand-700 dark:text-brand-200">← 正解</span>}
            {notes?.[c.id] && (
              <p className="mt-0.5 rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-800 dark:bg-slate-800/60 dark:text-slate-100"><TermText text={notes[c.id]!} /></p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 解説。初期は簡潔表示、必要な人だけ展開できる。
 * 解説が未作成・未照合の問題は、その旨を明示する（推測で補わない）。
 */
export function Explanation({ q, initialMode }: { q: Question; initialMode: ExplanationMode }) {
  const [mode, setMode] = useState<ExplanationMode>(initialMode);
  const { questionById, terms } = useContent();
  const { entry, retry } = useExplanationEntry(q.id);
  const e = entry && entry !== 'error' ? entry.explanation : undefined;
  const relatedTerms = terms.filter((t) => q.terms?.includes(t.id));

  return (
    <section aria-label="解説" className="mt-4 space-y-3">
      <div className="card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">正解：{q.parts.map((p) => formatAnswer(p)).join('／')}</h2>
          {e && <ReviewBadge status={e.status} />}
        </div>
        {q.source.kind === 'official' && <p className="text-xs text-slate-600 dark:text-slate-400">正答は日本FP協会の公表解答と照合済みです。</p>}
        {e ? (
          <>
            <p className="leading-relaxed">
              <TermText text={e.short} />
            </p>
            {mode !== 'short' && <ChoiceReview q={q} notes={e.choiceExplanations} />}
            {mode !== 'short' && e.standard && <p className="whitespace-pre-line leading-relaxed"><TermText text={e.standard} /></p>}
            {mode !== 'short' && e.whyCorrect && (
              <div>
                <h3 className="label">正解の理由</h3>
                <p className="leading-relaxed"><TermText text={e.whyCorrect} /></p>
              </div>
            )}
            {mode !== 'short' && e.wrongChoices && (
              <div>
                <h3 className="label">誤りの選択肢</h3>
                <ul className="space-y-1">
                  {Object.entries(e.wrongChoices).map(([k, v]) => (
                    <li key={k} className="leading-relaxed">
                      <b>{k})</b> <TermText text={v} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {mode !== 'short' && !hasExtra(q, e, mode) && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                この問題の{mode === 'standard' ? '標準' : '詳細'}解説は準備中です。簡潔な解説と、下の根拠資料・関連用語を参照してください。
              </p>
            )}
            {mode === 'detail' && (
              <>
                {e.detail && (
                  <div>
                    <h3 className="label">制度の仕組み</h3>
                    <p className="leading-relaxed"><TermText text={e.detail} /></p>
                  </div>
                )}
                {e.example && (
                  <div>
                    <h3 className="label">具体例</h3>
                    <p className="leading-relaxed"><TermText text={e.example} /></p>
                  </div>
                )}
                {e.formulas?.map((f) => (
                  <div key={f.name}>
                    <h3 className="label">{f.name}</h3>
                    <Tex tex={f.tex} block />
                  </div>
                ))}
                {e.pitfalls && (
                  <div>
                    <h3 className="label">間違えやすいポイント</h3>
                    <p className="leading-relaxed"><TermText text={e.pitfalls} /></p>
                  </div>
                )}
                {e.mnemonic && (
                  <div>
                    <h3 className="label">暗記のコツ</h3>
                    <p className="leading-relaxed"><TermText text={e.mnemonic} /></p>
                  </div>
                )}
                {e.relatedQuestions?.length ? (
                  <div>
                    <h3 className="label">関連する問題</h3>
                    <ul>
                      {e.relatedQuestions
                        .map((id) => questionById.get(id))
                        .filter(Boolean)
                        .map((rq) => (
                          <li key={rq!.id}>
                            <Link className="text-brand-700 underline dark:text-brand-200" to={`/q/${rq!.id}`}>
                              {questionLabel(rq!)}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="label">根拠資料（法令基準日 {e.lawBaseDate}・確認日 {e.checkedAt}）</h3>
                  <ul className="text-sm">
                    {e.sources.map((s) => (
                      <li key={s.url}>
                        <a className="text-brand-700 underline dark:text-brand-200" href={s.url} target="_blank" rel="noreferrer">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
            <div role="group" aria-label="解説の詳しさ" className="flex gap-2 pt-1">
              {(['short', 'standard', 'detail'] as const).map((m) => (
                <button key={m} className={`chip ${mode === m ? 'chip-on' : ''}`} onClick={() => setMode(m)} aria-pressed={mode === m}>
                  {{ short: '簡潔', standard: '標準', detail: '詳細' }[m]}
                </button>
              ))}
            </div>
          </>
        ) : entry === undefined ? (
          <p className="text-sm text-slate-600 dark:text-slate-400" role="status">
            解説を読み込み中…
          </p>
        ) : entry === 'error' ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>解説を読み込めませんでした。オフラインのときは、一度オンラインで解説を表示すると以後はオフラインでも読めます。</p>
            <button className="btn-secondary min-h-10 text-sm" onClick={retry}>
              もう一度読み込む
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-400">この問題の解説は準備中です（根拠資料と照合した解説のみ掲載します）。</p>
        )}
        {relatedTerms.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {relatedTerms.map((t) => (
              <Link key={t.id} to={`/glossary/${t.id}`} className="chip">
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      <LawNotice q={q} />
      <SourceLine q={q} />
    </section>
  );
}
