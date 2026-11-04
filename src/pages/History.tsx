import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { getGenerator } from '../domain/calc';
import { PageTitle } from '../ui/Layout';
import { Empty, questionLabel } from '../ui/common';

/** 学習履歴の検索 */
export function HistoryPage() {
  const { questionById, cards } = useContent();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | 'question' | 'card' | 'calc'>('');
  const [result, setResult] = useState<'' | 'ok' | 'ng'>('');
  const [limit, setLimit] = useState(100);
  const attempts = useLiveQuery(() => db.attempts.orderBy('at').reverse().toArray(), []);
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const rows = useMemo(() => {
    if (!attempts) return [];
    return attempts
      .filter((a) => !kind || a.itemKind === kind)
      .filter((a) => !result || (result === 'ok' ? a.correct : !a.correct))
      .map((a) => {
        const question = a.itemKind === 'question' ? questionById.get(a.itemId) : undefined;
        const title =
          a.itemKind === 'question'
            ? question
              ? questionLabel(question)
              : a.itemId
            : a.itemKind === 'card'
              ? cardById.get(a.itemId)?.front ?? a.itemId
              : `${getGenerator(a.itemId.split(':')[0]!)?.title ?? ''}：${a.pattern ?? ''}`;
        // 一覧には欠けのない短いラベルを出し、検索は問題文も対象にする
        return { a, title, search: `${title}\n${question?.stem ?? ''}` };
      })
      .filter((r) => !q || r.search.includes(q));
  }, [attempts, kind, result, q, questionById, cardById]);
  if (!attempts) return <p role="status">読み込み中…</p>;
  return (
    <div className="space-y-4">
      <PageTitle sub={`全${attempts.length}件`}>学習履歴</PageTitle>
      <input className="input" type="search" placeholder="問題文・カード・パターンで検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="履歴を検索" />
      <div className="flex flex-wrap gap-2">
        {(['', 'question', 'card', 'calc'] as const).map((k) => (
          <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>
            {{ '': 'すべて', question: '問題', card: '暗記カード', calc: '計算' }[k]}
          </button>
        ))}
        {(['', 'ok', 'ng'] as const).map((k) => (
          <button key={`r${k}`} className={`chip ${result === k ? 'chip-on' : ''}`} onClick={() => setResult(k)}>
            {{ '': '正誤すべて', ok: '正解のみ', ng: '不正解のみ' }[k]}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty>該当する履歴がありません。</Empty>
      ) : (
        <ul className="card divide-y divide-slate-100 p-0 text-sm dark:divide-slate-800">
          {rows.slice(0, limit).map(({ a, title }) => (
            <li key={a.id} className="px-4 py-2">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>{new Date(a.at).toLocaleString('ja-JP')}</span>
                <span className={a.correct ? 'text-emerald-700' : 'text-rose-700'}>
                  {a.correct ? (a.unsure ? '○（自信なし）' : '○') : '×'}
                </span>
              </div>
              {a.itemKind === 'question' ? (
                <Link to={`/q/${a.itemId}`} className="underline decoration-slate-300">
                  {title}
                </Link>
              ) : (
                <p>{title}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > limit && (
        <button className="btn-ghost w-full" onClick={() => setLimit(limit + 100)}>
          さらに表示
        </button>
      )}
    </div>
  );
}
