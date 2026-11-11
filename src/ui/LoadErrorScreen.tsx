import { Component, useState, type ReactNode } from 'react';
import { reloadToLatestBuild } from '../content/staleBuild';

/** 読み込みに失敗したときの画面（再読み込みで現行ビルドへ合流する。学習履歴は IndexedDB にあり消えない） */
export function LoadErrorScreen({ title, detail }: { title: string; detail: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-6" role="alert">
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <button
        type="button"
        className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void reloadToLatestBuild();
        }}
      >
        {busy ? '再読み込み中…' : '再読み込み'}
      </button>
      <p className="text-sm text-slate-600 dark:text-slate-400">学習履歴はこの端末に残っています。</p>
      <p className="break-words text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </main>
  );
}

/** 画面（遅延読み込みのページ）の描画で例外が起きたときに、白画面ではなく読み込みエラー画面を出す */
export class LoadErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) return <LoadErrorScreen title="画面を読み込めませんでした" detail={String(this.state.error)} />;
    return this.props.children;
  }
}
