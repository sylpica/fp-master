/**
 * 古いビルドの画面（シェル）が残った端末への対処。
 *
 * registerType 'prompt' の SW は、新しい SW を「待機」させたまま古いプリキャッシュの index.html と本体を返し続ける。
 * その本体が読みに行く旧ハッシュのチャンクがキャッシュに無く、デプロイでサーバーからも消えていると、
 * 動的 import は毎回 404 で失敗し、同じ URL の再試行や通常の再読み込みでは直らない
 * （再読み込みでは待機中の SW が有効にならないため）。
 * そこで、待機中の SW を有効化してから1回だけ再読み込みし、現行ビルドへ合流させる。
 * 学習データ（IndexedDB）やキャッシュは消さない。
 */

const GUARD_KEY = 'fp-stale-build-reload';
/** 自動の再読み込みを再び許すまでの時間（ループ防止） */
const GUARD_MS = 5 * 60 * 1000;

/** モジュール（チャンク）の読み込み失敗か。Safari・Chromium・Firefox の文言に対応 */
export function isModuleLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|Loading chunk .* failed/i.test(
    msg,
  );
}

function readGuard(): number | null {
  try {
    const v = sessionStorage.getItem(GUARD_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeGuard(v: number | null): boolean {
  try {
    if (v === null) sessionStorage.removeItem(GUARD_KEY);
    else sessionStorage.setItem(GUARD_KEY, String(v));
    return true;
  } catch {
    return false;
  }
}

/** 読み込みが成功したら呼ぶ（次に別の更新で失敗したときに再び自動で合流できるように） */
export function clearStaleBuildGuard(): void {
  writeGuard(null);
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SW の更新を確認し、待機中（またはインストール中）の新しい SW があれば有効化してページの制御を移す */
export async function activateWaitingServiceWorker(waitMs = 10_000): Promise<void> {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw) return;
  const reg = await sw.getRegistration().catch(() => undefined);
  if (!reg) return;
  await Promise.race([reg.update().catch(() => undefined), timeout(waitMs)]);
  const installing = reg.installing;
  if (installing && !reg.waiting) {
    await Promise.race([
      new Promise<void>((resolve) => {
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installing') resolve();
        });
      }),
      timeout(waitMs),
    ]);
  }
  const waiting = reg.waiting;
  if (!waiting) return;
  const changed = new Promise<void>((resolve) => sw.addEventListener('controllerchange', () => resolve(), { once: true }));
  waiting.postMessage({ type: 'SKIP_WAITING' });
  await Promise.race([changed, timeout(waitMs)]);
}

/** 現行ビルドへ合流するための再読み込み（利用者の操作から呼ぶ。ガードは見ない） */
export async function reloadToLatestBuild(): Promise<void> {
  await activateWaitingServiceWorker().catch(() => undefined);
  location.reload();
}

/**
 * モジュール読み込みの恒常的な失敗を検出したときに、1回だけ自動で現行ビルドへ合流する。
 * 再読み込みを始めたら true（呼び出し側はエラー表示を出さずに待つ）。
 * 直近に自動の再読み込みをしていた・sessionStorage が使えない・オフラインのときは false。
 */
export async function recoverFromStaleBuild(e: unknown, now = Date.now()): Promise<boolean> {
  if (!isModuleLoadError(e)) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const last = readGuard();
  if (last !== null && now - last < GUARD_MS) return false;
  if (!writeGuard(now)) return false; // ガードを記録できないと再読み込みがループしうるため自動では行わない
  await reloadToLatestBuild();
  return true;
}
