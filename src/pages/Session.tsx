import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type StudySession } from '../db/db';
import { saveSession, toggleFlag } from '../db/repo';
import { scoreQuestion, type Responses } from '../domain/scoring';
import { useContent } from '../content/store';
import { useSettings } from '../state/settings';
import { commitAnswer, commitPending, finishSession } from '../state/sessions';
import { AnswerArea, QuestionHeader, Stem } from '../ui/QuestionView';
import { Explanation } from '../ui/Explanation';
import { TermPopupProvider } from '../ui/TermText';
import { NoteAndReport } from '../ui/NoteAndReport';
import { Empty, ProgressBar, pct, questionLabel } from '../ui/common';

/** 通常演習・復習の実行画面（1画面1問・ワンタップ解答・即時正誤） */
export function SessionPage() {
  const { id } = useParams();
  const { questionById } = useContent();
  const settings = useSettings();
  const nav = useNavigate();
  const [s, setS] = useState<StudySession | null | undefined>(undefined);
  const shownAt = useRef(Date.now());
  const busy = useRef(false);

  useEffect(() => {
    let alive = true;
    db.sessions.get(id ?? '').then(async (x) => {
      if (!alive) return;
      if (!x) return setS(null);
      // 前回中断時に確定していない解答を確定
      setS(await commitPending(x, questionById, 'practice'));
    });
    return () => {
      alive = false;
    };
  }, [id, questionById]);

  const qid = s?.itemIds[s.index];
  const q = qid ? questionById.get(qid) : undefined;
  const bookmarked = useLiveQuery(() => (qid ? db.bookmarks.get(qid) : undefined), [qid]);
  const later = useLiveQuery(() => (qid ? db.later.get(qid) : undefined), [qid]);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [qid]);

  if (s === undefined || !settings) return <p role="status">読み込み中…</p>;
  if (s === null) return <Empty>セッションが見つかりません。</Empty>;
  if (s.finishedAt) return <Navigate to={`/session/${s.id}/result`} replace />;
  if (!q) return <Empty>問題が見つかりません（データ更新で削除された可能性があります）。</Empty>;

  const ans = s.answers[q.id];
  const result = ans?.correct !== undefined ? scoreQuestion(q, ans.responses) : undefined;
  const total = s.itemIds.length;

  const update = async (next: StudySession) => {
    setS(next);
    await saveSession(next);
  };
  const onChange = (responses: Responses) => update({ ...s, answers: { ...s.answers, [q.id]: { ...ans, responses } } });
  const onSubmit = (responses: Responses) => {
    const r = scoreQuestion(q, responses);
    void update({
      ...s,
      answers: { ...s.answers, [q.id]: { responses, correct: r.correct, unsure: ans?.unsure ?? false, timeMs: Date.now() - shownAt.current } },
    });
  };
  const toggleUnsure = () => update({ ...s, answers: { ...s.answers, [q.id]: { ...ans!, unsure: !ans?.unsure } } });
  const next = async () => {
    // 連打で2問先へ進んだり結果画面へ二重遷移したりしないよう、処理中の再入を無視する
    if (busy.current) return;
    busy.current = true;
    try {
      await goNext();
    } finally {
      busy.current = false;
    }
  };
  const goNext = async () => {
    let cur = await commitAnswer(s, q, 'practice');
    if (cur.index + 1 >= total) {
      await finishSession(cur);
      nav(`/session/${s.id}/result`, { replace: true });
      return;
    }
    cur = { ...cur, index: cur.index + 1 };
    await update(cur);
  };
  const quit = async () => {
    await commitAnswer(s, q, 'practice');
    nav('/');
  };

  return (
    <TermPopupProvider>
      <div className="pb-28">
        <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 pt-3 backdrop-blur dark:bg-slate-950/95">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={quit} className="min-h-10 px-1 text-sm text-slate-600 dark:text-slate-400" aria-label="中断して戻る（続きから再開できます）">
              ← 中断
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{s.title}</span>
          </div>
          <ProgressBar value={s.index + (result ? 1 : 0)} max={total} label="進み具合" />
        </div>
        <QuestionHeader q={q} index={s.index} total={total} />
        <Stem q={q} />
        {!result && (
          <div className="mt-3 flex justify-end">
            <button className={`chip ${ans?.unsure ? 'chip-on' : ''}`} onClick={toggleUnsure} aria-pressed={!!ans?.unsure}>
              自信なし
            </button>
          </div>
        )}
        <AnswerArea q={q} responses={ans?.responses ?? {}} onChange={onChange} onSubmit={onSubmit} result={result} mode="practice" />
        {result && (
          <>
            <div className={`mt-4 rounded-2xl p-3 text-center text-lg font-bold ${result.correct ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'}`} role="status">
              {result.correct ? '正解！' : '不正解'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={`chip ${ans?.unsure ? 'chip-on' : ''}`} onClick={toggleUnsure} aria-pressed={!!ans?.unsure}>
                自信なし
              </button>
              <button className={`chip ${bookmarked ? 'chip-on' : ''}`} onClick={() => toggleFlag('bookmarks', q.id)} aria-pressed={!!bookmarked}>
                ★ ブックマーク
              </button>
              <button className={`chip ${later ? 'chip-on' : ''}`} onClick={() => toggleFlag('later', q.id)} aria-pressed={!!later}>
                後で復習
              </button>
            </div>
            <Explanation q={q} initialMode={settings.explanationMode} />
            <NoteAndReport itemKey={q.id} />
          </>
        )}
        {result && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
            <div className="mx-auto max-w-2xl">
              <button className="btn-primary w-full" onClick={next} autoFocus>
                {s.index + 1 >= total ? '結果を見る' : '次の問題へ'}
              </button>
            </div>
          </div>
        )}
      </div>
    </TermPopupProvider>
  );
}

export function SessionResultPage() {
  const { id } = useParams();
  const { questionById } = useContent();
  const s = useLiveQuery(() => db.sessions.get(id ?? ''), [id]);
  if (!s) return <p role="status">読み込み中…</p>;
  const answered = s.itemIds.filter((x) => s.answers[x]?.correct !== undefined);
  const correct = answered.filter((x) => s.answers[x]!.correct);
  const wrong = answered.filter((x) => !s.answers[x]!.correct);
  const unsure = answered.filter((x) => s.answers[x]!.correct && s.answers[x]!.unsure);
  const rate = answered.length ? correct.length / answered.length : null;
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">{s.title}</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          {correct.length} / {answered.length}
        </p>
        <p className="text-slate-600 dark:text-slate-400">正答率 {pct(rate)}</p>
        {unsure.length > 0 && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">自信なしの正解：{unsure.length}問（復習予定に入りました）</p>}
      </div>
      {wrong.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-bold">間違えた問題</h2>
          <ul className="space-y-2">
            {wrong.map((qid) => {
              const q = questionById.get(qid);
              return (
                <li key={qid}>
                  <Link to={`/q/${qid}`} className="block text-sm underline decoration-slate-300">
                    {q ? questionLabel(q) : qid}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="grid gap-2">
        <Link to="/practice?quick=5" className="btn-primary">
          続けて5問解く
        </Link>
        {wrong.length > 0 && (
          <Link to="/review" className="btn-secondary">
            間違えた問題を復習する
          </Link>
        )}
        <Link to="/" className="btn-ghost">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
