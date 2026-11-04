import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { toggleFlag } from '../db/repo';
import { startPractice } from '../state/sessions';
import { useExamKey } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { Empty, FieldBadge, questionLabel } from '../ui/common';

export function BookmarksPage() {
  const { questionById } = useContent();
  const exam = useExamKey();
  const nav = useNavigate();
  const marks = useLiveQuery(() => db.bookmarks.orderBy('createdAt').reverse().toArray(), []);
  const later = useLiveQuery(() => db.later.orderBy('createdAt').reverse().toArray(), []);
  if (!marks || !later || !exam) return <p role="status">読み込み中…</p>;
  const qs = marks.map((m) => questionById.get(m.key)).filter((q) => q && q.exam === exam);
  const laterQs = later.map((m) => questionById.get(m.key)).filter((q) => q && q.exam === exam);
  const start = async (ids: string[], filter: 'bookmarked' | 'later') => {
    const pool = ids.map((id) => questionById.get(id)!).filter(Boolean);
    const r = await startPractice(pool, { exams: [exam], count: 100, filter, includeCalc: true, order: 'random' }, filter === 'bookmarked' ? 'ブックマーク' : '後で復習', false);
    if (r.sessionId) nav(`/session/${r.sessionId}`);
  };
  const List = ({ items, table }: { items: typeof qs; table: 'bookmarks' | 'later' }) => (
    <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
      {items.map((q) => (
        <li key={q!.id} className="flex items-center gap-2 px-4 py-2">
          <Link to={`/q/${q!.id}`} className="min-h-12 flex-1 text-sm">
            <FieldBadge field={q!.field} /> {questionLabel(q!)}
          </Link>
          <button className="min-h-10 px-2 text-xs text-slate-600 dark:text-slate-400" onClick={() => toggleFlag(table, q!.id)} aria-label="登録を解除">
            解除
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-4">
      <PageTitle>ブックマーク</PageTitle>
      {qs.length === 0 ? <Empty>ブックマークした問題はありません。解答後の「★ ブックマーク」で追加できます。</Empty> : (
        <>
          <button className="btn-primary w-full" onClick={() => start(qs.map((q) => q!.id), 'bookmarked')}>
            ブックマーク問題を解く（{qs.length}問）
          </button>
          <List items={qs} table="bookmarks" />
        </>
      )}
      <h2 className="pt-2 text-lg font-bold">後で復習</h2>
      {laterQs.length === 0 ? <Empty>「後で復習」に登録した問題はありません。</Empty> : (
        <>
          <button className="btn-secondary w-full" onClick={() => start(laterQs.map((q) => q!.id), 'later')}>
            後で復習の問題を解く（{laterQs.length}問）
          </button>
          <List items={laterQs} table="later" />
        </>
      )}
    </div>
  );
}
