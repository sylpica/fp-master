import { beforeEach, describe, expect, it } from 'vitest';
import { clearStaleBuildGuard, isModuleLoadError, recoverFromStaleBuild } from '../../src/content/staleBuild';

describe('古いビルドへの対処', () => {
  beforeEach(() => sessionStorage.clear());

  it('モジュール読み込み失敗を Safari・Chromium・Firefox の文言で判定する', () => {
    expect(isModuleLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isModuleLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/a.js'))).toBe(true);
    expect(isModuleLoadError(new TypeError('error loading dynamically imported module: http://x/a.js'))).toBe(true);
    expect(isModuleLoadError(new Error('unknown question set: x'))).toBe(false);
  });

  it('モジュール以外のエラーでは自動の再読み込みをしない', async () => {
    expect(await recoverFromStaleBuild(new Error('unknown question set: x'))).toBe(false);
  });

  it('直近に自動の再読み込みをしていたら、再び行わない（ループ防止）', async () => {
    const now = Date.now();
    sessionStorage.setItem('fp-stale-build-reload', String(now - 1000));
    expect(await recoverFromStaleBuild(new TypeError('Importing a module script failed.'), now)).toBe(false);
  });

  it('読み込みに成功したらガードを解除する', async () => {
    sessionStorage.setItem('fp-stale-build-reload', String(Date.now()));
    clearStaleBuildGuard();
    expect(sessionStorage.getItem('fp-stale-build-reload')).toBeNull();
  });
});
