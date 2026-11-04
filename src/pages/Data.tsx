import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportBackup, inspectBackup, restoreBackup, type BackupInspection, type RestoreMode } from '../db/backup';
import { useContent } from '../content/store';
import { PageNote, PageTitle } from '../ui/Layout';
import { Empty } from '../ui/common';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TABLE_LABELS: Record<string, string> = {
  attempts: '解答履歴',
  srs: '復習スケジュール',
  bookmarks: 'ブックマーク',
  later: '後で復習',
  notes: 'メモ',
  termState: '用語の状態',
  sessions: '演習セッション',
  mockResults: '模擬試験の成績',
  reports: '誤り報告',
  settings: '設定',
};

/** データ管理：バックアップ・復元、誤り報告、保存状況 */
export function DataPage() {
  const { questions, sets, terms, cards } = useContent();
  const [inspection, setInspection] = useState<BackupInspection | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reports = useLiveQuery(() => db.reports.orderBy('createdAt').reverse().toArray(), []);
  const persisted = useLiveQuery(async () => (navigator.storage?.persisted ? navigator.storage.persisted() : null), []);
  const counts = useLiveQuery(async () => ({ attempts: await db.attempts.count(), sessions: await db.sessions.count() }), []);

  const doExport = async () => {
    const b = await exportBackup(db);
    download(`fp-master-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b));
    setMsg({ ok: true, text: 'バックアップを書き出しました。' });
  };
  const onFile = async (f: File | undefined) => {
    setMsg(null);
    if (!f) return;
    setInspection(await inspectBackup(db, await f.text()));
  };
  const doRestore = async () => {
    if (!inspection) return;
    if (mode === 'replace' && !window.confirm('現在の学習データをすべてバックアップの内容に置き換えます。よろしいですか？（置き換える前の学習データは自動でファイルに書き出します）')) return;
    try {
      let saved = '';
      if (mode === 'replace') {
        // 置き換えは今のデータを削除するため、取り違えたファイルで復元しても元に戻せるよう、直前の状態を書き出しておく
        saved = `fp-master-before-restore-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
        download(saved, JSON.stringify(await exportBackup(db)));
      }
      await restoreBackup(db, inspection, mode);
      setMsg({ ok: true, text: saved ? `復元しました。置き換える前のデータを「${saved}」として書き出しました。` : '復元しました。' });
      setInspection(null);
    } catch (e) {
      setMsg({ ok: false, text: `復元に失敗しました。データは変更されていません（${e instanceof Error ? e.message : String(e)}）` });
    }
  };
  const verified = questions.filter((q) => q.status === 'verified').length;

  return (
    <div className="space-y-4">
      <PageTitle>データ管理</PageTitle>
      {msg && (
        <p role="status" className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100'}`}>
          {msg.text}
        </p>
      )}
      <section className="card space-y-2">
        <h2 className="font-bold">バックアップ</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          解答履歴 {counts?.attempts ?? 0}件。別の端末へ移すときや、念のための保存に使います。
          {persisted === false && ' この端末ではストレージの永続化が許可されていないため、定期的なバックアップをおすすめします。'}
        </p>
        <button className="btn-primary w-full" onClick={doExport}>
          JSONファイルに書き出す
        </button>
      </section>
      <section className="card space-y-3">
        <h2 className="font-bold">復元</h2>
        <input type="file" accept="application/json,.json" className="block w-full text-sm" aria-label="バックアップファイルを選択" onChange={(e) => onFile(e.target.files?.[0])} />
        {inspection && (
          <div className="space-y-2 text-sm">
            {inspection.errors.map((e) => (
              <p key={e} className="text-rose-700 dark:text-rose-300">
                {e}
              </p>
            ))}
            {inspection.ok && (
              <>
                <p>作成日時：{inspection.exportedAt ? new Date(inspection.exportedAt).toLocaleString('ja-JP') : '—'}（形式 v{inspection.schemaVersion}）</p>
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-600 dark:text-slate-400">
                      <th>データ</th>
                      <th className="text-right">件数</th>
                      <th className="text-right">既存と重複</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(inspection.counts).map(([k, v]) => (
                      <tr key={k}>
                        <td>{TABLE_LABELS[k] ?? k}</td>
                        <td className="text-right tabular-nums">{v!.total}</td>
                        <td className="text-right tabular-nums">{v!.duplicates}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div role="radiogroup" aria-label="復元方法" className="space-y-1">
                  <label className="flex min-h-10 items-center gap-2">
                    <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> 統合する（今のデータを残し、重複しない履歴を追加）
                  </label>
                  <label className="flex min-h-10 items-center gap-2">
                    <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> 置き換える（今のデータを削除してバックアップの内容にする）
                  </label>
                </div>
                <button className="btn-primary w-full" onClick={doRestore}>
                  復元する
                </button>
                <p className="text-xs text-slate-600 dark:text-slate-400">復元は一括で行い、途中で失敗した場合は元の状態に戻ります。</p>
              </>
            )}
          </div>
        )}
      </section>
      <section className="card space-y-2">
        <h2 className="font-bold">問題・解説の誤り報告</h2>
        {!reports || reports.length === 0 ? (
          <Empty>報告はありません。</Empty>
        ) : (
          <>
            <ul className="space-y-2 text-sm">
              {reports.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div>
                    <Link to={`/q/${r.itemKey}`} className="text-xs underline">
                      {r.itemKey}
                    </Link>
                    <p>{r.text}</p>
                  </div>
                  <button className="min-h-10 shrink-0 px-2 text-xs text-slate-600 dark:text-slate-400" onClick={() => db.reports.delete(r.id!)}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn-secondary w-full" onClick={() => download('fp-master-reports.json', JSON.stringify(reports, null, 2))}>
              報告を書き出す（開発者への連絡用）
            </button>
          </>
        )}
      </section>
      <section className="card text-sm">
        <h2 className="mb-1 font-bold">収録データ</h2>
        <p>
          問題 {questions.length}問（検証済み {verified}問・隔離 {questions.length - verified}問／{sets.length}回分）、用語 {terms.length}語、暗記カード {cards.length}枚
        </p>
        <p className="mt-1">
          <Link to="/law" className="underline">
            制度改正情報
          </Link>
          ・
          <Link to="/about" className="underline">
            出典と利用条件
          </Link>
        </p>
      </section>
      <PageNote>
        <p>学習データはこの端末のブラウザ内（IndexedDB）に保存されています。端末間の自動同期はありません。</p>
      </PageNote>
    </div>
  );
}
