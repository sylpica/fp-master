import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { FIELDS } from '../domain/exam';
import { buildItemStats } from '../domain/stats';
import { useExamKey } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { Empty, FieldBadge, questionLabel } from '../ui/common';

/** 間違いノート：間違えたことのある問題を、誤答回数とメモつきで一覧 */
export function MistakesPage() {
  const { questionById } = useContent();
  const exam = useExamKey();
  const data = useLiveQuery(async () => ({
    attempts: await db.attempts.where('itemKind').equals('question').toArray(),
    notes: await db.notes.toArray(),
  }), []);
  const rows = useMemo(() => {
    if (!data || !exam) return [];
    const stats = buildItemStats(data.attempts);
    const notes = new Map(data.notes.map((n) => [n.key, n.text]));
    return [...stats.entries()]
      .map(([id, s]) => ({ q: questionById.get(id), s, wrong: s.attempts - s.correct, note: notes.get(id) }))
      .filter((r) => r.q && r.q.exam === exam && r.wrong > 0)
      .sort((a, b) => Number(b.s.lastCorrect === false) - Number(a.s.lastCorrect === false) || b.wrong - a.wrong);
  }, [data, exam, questionById]);
  if (!data) return <p role="status">読み込み中…</p>;
  return (
    <div className="space-y-4">
      <PageTitle sub={rows.length ? `${rows.length}問（直近で不正解の問題が上）` : undefined}>間違いノート</PageTitle>
      {rows.length === 0 ? (
        <Empty>まだ間違えた問題はありません。</Empty>
      ) : (
        <>
          <Link to="/review" className="btn-primary w-full">
            間違えた問題をまとめて復習
          </Link>
          <ul className="space-y-2">
            {rows.map(({ q, s, wrong, note }) => (
              <li key={q!.id} className="card">
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <FieldBadge field={q!.field} />
                  <span>{FIELDS[q!.field].short}</span>
                  <span className="ml-auto">
                    誤答 {wrong}回・直近 {s.lastCorrect ? '○' : '×'}
                  </span>
                </div>
                <Link to={`/q/${q!.id}`} className="text-sm underline decoration-slate-300">
                  {questionLabel(q!)}
                </Link>
                {note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-950/40">メモ：{note}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
