import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { applyFilter, eligibleForPractice, type PracticeFilter } from '../domain/selection';
import { localDate } from '../domain/srs';
import { FIELDS } from '../domain/exam';
import { FILTER_LABELS, startPractice } from '../state/sessions';
import { useExamKey, useUserState } from '../ui/hooks';
import { PageNote, PageTitle } from '../ui/Layout';

const MODES: { filter: PracticeFilter; desc: string }[] = [
  { filter: 'due', desc: '間隔反復で今日が復習日の問題' },
  { filter: 'wrong', desc: '直近の解答が不正解だった問題' },
  { filter: 'weak', desc: '正答率の低い分野・問題を優先' },
  { filter: 'unsure', desc: '正解したが「自信なし」だった問題' },
  { filter: 'stale', desc: '30日以上解いていない問題' },
  { filter: 'bookmarked', desc: 'ブックマークした問題' },
  { filter: 'later', desc: '「後で復習」に登録した問題' },
];

/** 苦手問題の復習（今日の復習・間違えた問題・苦手分野など） */
export function ReviewPage() {
  const exam = useExamKey();
  const { questions } = useContent();
  const u = useUserState();
  const nav = useNavigate();
  const dueCards = useLiveQuery(async () => (await db.srs.where('key').startsWith('c:').toArray()).filter((s) => s.due <= localDate()).length, []);
  // 復習では、解いたことのある計算問題も対象に含める
  const pool = useMemo(() => (exam ? eligibleForPractice(questions, { exams: [exam], includeCalc: true }) : []), [questions, exam]);
  const counts = useMemo(() => (u ? Object.fromEntries(MODES.map((m) => [m.filter, m.filter === 'weak' ? null : applyFilter(pool, m.filter, u).length])) : {}), [u, pool]);
  if (!exam || !u) return <p role="status">読み込み中…</p>;
  const start = async (filter: PracticeFilter) => {
    const r = await startPractice(pool, { exams: [exam], count: filter === 'due' ? 50 : 20, filter, includeCalc: true, order: 'random' }, FILTER_LABELS[filter], false);
    if (r.sessionId) nav(`/session/${r.sessionId}`);
  };
  return (
    <div className="space-y-4">
      <PageTitle>苦手問題の復習</PageTitle>
      {u.weakFields.length > 0 && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          苦手分野：{u.weakFields.map((f) => FIELDS[f].name).join('、')}
        </p>
      )}
      <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
        {MODES.map((m) => {
          const n = counts[m.filter];
          return (
            <li key={m.filter} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
              <div>
                <div className="font-semibold">
                  {m.filter === 'due' ? '今日の復習' : FILTER_LABELS[m.filter]}
                  {n !== null && n !== undefined && <span className="ml-2 tabular-nums text-slate-600 dark:text-slate-400">{n}問</span>}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">{m.desc}</div>
              </div>
              <button className="btn-secondary min-h-10 shrink-0" disabled={n === 0} onClick={() => start(m.filter)}>
                開始
              </button>
            </li>
          );
        })}
      </ul>
      <Link to="/cards/run?mode=due" className="btn-secondary w-full">
        暗記カードの復習（{dueCards ?? 0}枚）
      </Link>
      <Link to="/mistakes" className="btn-ghost w-full">
        間違いノートを見る
      </Link>
      <PageNote>
        <p>学習履歴にもとづく復習です。復習日はSM-2方式で自動計算されます。</p>
      </PageNote>
    </div>
  );
}
