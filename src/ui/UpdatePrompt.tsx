import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** 新しいバージョンがあるときに更新を促す（学習データは IndexedDB にあり、更新で消えない） */
/**
 * 通知の位置：通常の画面では本題を覆わないよう下部ナビの上、演習中など下部に操作ボタンがある画面では上部。
 */
export function UpdatePrompt({ bottom = false }: { bottom?: boolean }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  // 「オフライン対応完了」は操作を妨げないよう数秒で自動的に閉じる
  useEffect(() => {
    if (!offlineReady) return;
    const t = setTimeout(() => setOfflineReady(false), 4000);
    return () => clearTimeout(t);
  }, [offlineReady, setOfflineReady]);
  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className={`fixed inset-x-4 z-50 mx-auto max-w-md rounded-xl bg-slate-900 p-3 text-sm text-white shadow-lg dark:bg-slate-700 ${bottom ? 'bottom-[calc(env(safe-area-inset-bottom)+4rem)]' : 'top-[calc(env(safe-area-inset-top)+0.5rem)]'}`}
    >
      {needRefresh ? (
        <div className="flex items-center justify-between gap-2">
          <span>新しいバージョンがあります（学習履歴は保持されます）</span>
          <button className="shrink-0 rounded-lg bg-brand-500 px-3 py-2 font-semibold" onClick={() => updateServiceWorker(true)}>
            更新
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span>オフラインでも利用できるようになりました</span>
          <button className="shrink-0 px-2 py-2" onClick={() => setOfflineReady(false)}>
            閉じる
          </button>
        </div>
      )}
      {needRefresh && (
        <button className="mt-1 text-xs text-slate-300 underline" onClick={() => setNeedRefresh(false)}>
          後で
        </button>
      )}
    </div>
  );
}
