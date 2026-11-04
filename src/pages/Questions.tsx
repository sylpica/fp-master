import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { recordAttempt, toggleFlag } from '../db/repo';
import { ratingFromAnswer } from '../domain/srs';
import { scoreQuestion, type Responses } from '../domain/scoring';
import { compareQuestionOrder } from '../domain/selection';
import { EXAM_SPECS, FIELD_IDS, FIELDS } from '../domain/exam';
import type { FieldId } from '../domain/types';
import { useSettings } from '../state/settings';
import { useExamKey, useUserState } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { AnswerArea, QuestionHeader, Stem } from '../ui/QuestionView';
import { Explanation } from '../ui/Explanation';
import { TermPopupProvider } from '../ui/TermText';
import { NoteAndReport } from '../ui/NoteAndReport';
import { Empty, FieldBadge } from '../ui/common';

/** 過去問一覧（公表回・分野・学習状況で絞り込み） */
export function QuestionListPage() {
  const exam = useExamKey();
  const { questions, sets } = useContent();
  const u = useUserState();
  const [set, setSet] = useState<string>('');
  const [field, setField] = useState<FieldId | ''>('');
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (!exam) return [];
    return questions
      .filter((x) => x.exam === exam)
      .filter((x) => !set || x.id.startsWith(set.replace('_', '-')))
      .filter((x) => !field || x.field === field)
      .filter((x) => !q || x.stem.includes(q) || x.theme.includes(q))
      .sort(compareQuestionOrder);
  }, [questions, exam, set, field, q]);
  if (!exam) return null;
  const examSets = sets.filter((s) => s.exam === exam);
  return (
    <div className="space-y-4">
      <PageTitle sub={`${EXAM_SPECS[exam].label}：${list.length}問`}>過去問一覧</PageTitle>
      <div className="grid gap-2 sm:grid-cols-3">
        <select className="input" value={set} onChange={(e) => setSet(e.target.value)} aria-label="公表回">
          <option value="">すべての回</option>
          {examSets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select className="input" value={field} onChange={(e) => setField(e.target.value as FieldId | '')} aria-label="分野">
          <option value="">すべての分野</option>
          {FIELD_IDS.map((f) => (
            <option key={f} value={f}>
              {FIELDS[f].name}
            </option>
          ))}
        </select>
        <input className="input" placeholder="キーワード" value={q} onChange={(e) => setQ(e.target.value)} aria-label="キーワード検索" />
      </div>
      {list.length === 0 ? (
        <Empty>{EXAM_SPECS[exam].subject === 'jitsugi' ? '実技問題は準備中です。' : '該当する問題がありません。'}</Empty>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
          {list.map((x) => {
            const st = u?.stats.get(x.id);
            return (
              <li key={x.id}>
                <Link to={`/q/${x.id}`} className="block min-h-14 px-4 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>{x.source.kind === 'official' ? `${x.source.yearMonth} 問${x.source.number}` : 'オリジナル'}</span>
                    <FieldBadge field={x.field} />
                    {x.requiresCalculation && <span className="badge bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100">計算</span>}
                    {x.status !== 'verified' && <span className="badge bg-rose-100 text-rose-800">隔離中</span>}
                    {st && <span className={st.lastCorrect ? 'text-emerald-700' : 'text-rose-700'}>{st.lastCorrect ? '○' : '×'} {st.correct}/{st.attempts}</span>}
                  </div>
                  <p className="text-sm font-semibold">{x.theme}</p>
                  {q && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{x.stem}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 1問の表示（一覧・履歴・ブックマークから）。解いてから解説を見る */
export function QuestionDetailPage() {
  const { id } = useParams();
  const { questionById, sets } = useContent();
  const settings = useSettings();
  const q = questionById.get(id ?? '');
  // 同じ問題セット内での前後ナビ（一覧に戻らず続けて解けるように）
  const siblings = useMemo(() => {
    if (!q) return { prev: undefined, next: undefined, index: -1, total: 0, title: '' };
    const set = sets.find((s) => s.exam === q.exam && s.questions.some((x) => x.id === q.id));
    if (!set) return { prev: undefined, next: undefined, index: -1, total: 0, title: '' };
    const idx = set.questions.findIndex((x) => x.id === q.id);
    return { prev: set.questions[idx - 1], next: set.questions[idx + 1], index: idx, total: set.questions.length, title: set.title };
  }, [q, sets]);
  // 用語詳細などへ遷移して戻ってきても、入力途中の解答が失われないよう下書きを保持する
  const draftKey = `q-draft:${id ?? ''}`;
  const initialDraft = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) ?? '{}') as { r?: Responses; d?: boolean };
    } catch {
      return {} as { r?: Responses; d?: boolean };
    }
  })();
  const [responses, setResponsesState] = useState<Responses>(initialDraft.r ?? {});
  const [done, setDoneState] = useState<boolean>(initialDraft.d ?? false);
  // setResponses と setDone が同一イベントで連続しても互いを上書きしないよう、最新値を ref で保持して保存する
  const draftRef = useRef({ r: responses, d: done });
  const persistDraft = () => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(draftRef.current));
    } catch { /* 保存できなくても学習は継続できる */ }
  };
  const setResponses = (r: Responses) => {
    draftRef.current = { ...draftRef.current, r };
    setResponsesState(r);
    persistDraft();
  };
  const setDone = (d: boolean) => {
    draftRef.current = { ...draftRef.current, d };
    setDoneState(d);
    persistDraft();
  };
  // 単問ページでの解答も学習履歴・成績・復習対象に記録する（演習セッションと同じ記録経路。
  // 以前はここが無く、一覧や関連問題から解いても履歴に残らなかった）
  const shownAtRef = useRef(Date.now());
  const recordedForRef = useRef<string | null>(null);
  const handleSubmit = (r: Responses) => {
    setResponses(r);
    setDone(true);
    if (!q || recordedForRef.current === q.id) return;
    const res = scoreQuestion(q, r);
    if (!res.complete) return;
    recordedForRef.current = q.id;
    void recordAttempt(
      {
        itemId: q.id,
        itemKind: 'question',
        exam: q.exam,
        field: q.field,
        correct: res.correct,
        unsure: false,
        timeMs: Date.now() - shownAtRef.current,
        mode: 'single',
      },
      ratingFromAnswer(res.correct, false),
    );
  };
  const bookmarked = useLiveQuery(() => db.bookmarks.get(id ?? ''), [id]);
  if (!q || !settings) return <Empty>問題が見つかりません。</Empty>;
  const result = done ? scoreQuestion(q, responses) : undefined;
  return (
    <TermPopupProvider>
      <div className="space-y-2 pb-8">
        <QuestionHeader q={q} />
        {q.status !== 'verified' && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
            この問題は検証が完了していないため出題対象外です（理由：{q.quarantineReason}）。表示は確認用です。
          </p>
        )}
        <Stem q={q} />
        <AnswerArea q={q} responses={responses} onChange={setResponses} onSubmit={handleSubmit} result={result} mode="practice" />
        {!done && (
          <button className="btn-ghost w-full" onClick={() => setDone(true)}>
            解かずに正解と解説を見る
          </button>
        )}
        {done && (
          <>
            <div className="flex gap-2">
              <button className={`chip ${bookmarked ? 'chip-on' : ''}`} onClick={() => toggleFlag('bookmarks', q.id)} aria-pressed={!!bookmarked}>
                ★ ブックマーク
              </button>
            </div>
            <Explanation q={q} initialMode={settings.explanationMode} />
            <NoteAndReport itemKey={q.id} />
          </>
        )}
        {siblings.total > 1 && (
          <nav className="flex items-center justify-between gap-2 pt-3" aria-label="前後の問題">
            {siblings.prev ? (
              <Link className="btn-secondary" to={`/q/${siblings.prev.id}`}>← 前の問題</Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {siblings.title} {siblings.index + 1} / {siblings.total}問
            </span>
            {siblings.next ? (
              <Link className="btn-secondary" to={`/q/${siblings.next.id}`}>次の問題 →</Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </TermPopupProvider>
  );
}
