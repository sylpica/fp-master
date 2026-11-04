import { expect, test, type Page } from '@playwright/test';

/** IndexedDB の解答履歴（attempts）の件数 */
async function attemptCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const r = indexedDB.open('fp-master');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const c = r.result.transaction('attempts').objectStore('attempts').count();
          c.onsuccess = () => resolve(c.result);
          c.onerror = () => reject(c.error);
        };
      }),
  );
}

test('「次の問題へ」をダブルタップしても解答履歴は1件だけ記録され、1問ずつ進む', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'すぐに5問解く' }).click();
  await expect(page.getByText('1 / 5')).toBeVisible();
  await page.locator('fieldset button').first().click();
  const next = page.getByRole('button', { name: '次の問題へ' });
  await next.dblclick();
  await expect(page.getByText('2 / 5')).toBeVisible();
  await expect.poll(() => attemptCount(page)).toBe(1);
});

test('数値の解答欄を空にすると、前に入力した値で解答できない', async ({ page }) => {
  await page.goto('./#/q/j2-202605-13');
  const inputs = page.locator('fieldset input');
  await expect(inputs).toHaveCount(3);
  await inputs.nth(0).fill('19');
  await inputs.nth(1).fill('572');
  await inputs.nth(2).fill('5220');
  const submit = page.getByRole('button', { name: '解答する' });
  await expect(submit).toBeEnabled();
  await inputs.nth(2).fill('');
  await expect(submit).toBeDisabled();
  await inputs.nth(2).fill('５，２２０'); // 全角数字・全角カンマも読める
  await expect(submit).toBeEnabled();
});

test('オフラインで初めて解説を開いても、先読みしたデータで解説が表示される', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // 解説データ（explanations-*.js）がランタイムキャッシュに入るまで待つ
  await page.waitForFunction(
    async () => {
      const c = await caches.open('fp-question-data-v1');
      return (await c.keys()).some((r) => /explanations-[^/]*\.js$/.test(r.url));
    },
    undefined,
    { timeout: 30_000, polling: 500 },
  );
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: 'すぐに5問解く' }).click();
  await expect(page.getByText('1 / 5')).toBeVisible();
  await page.locator('fieldset button').first().click();
  const exp = page.getByRole('region', { name: '解説' });
  await expect(exp.getByText('解説を読み込み中…')).toHaveCount(0, { timeout: 10_000 });
  await expect(exp.getByText('解説を読み込めませんでした')).toHaveCount(0);
  await context.setOffline(false);
});

// UIルール（2026-11-03 追記）：ヘッダーはコンパクト、文字の切れ（省略記号・行数制限）を作らない
const ROUTES = ['./', './#/practice', './#/calc', './#/glossary', './#/menu', './#/mock', './#/review', './#/cards', './#/challenge', './#/stats', './#/plan', './#/data', './#/law', './#/guide', './#/questions', './#/history', './#/mistakes', './#/bookmarks', './#/glossary/fukuri', './#/q/g2-202505-01'];
test('UIルール：375pxでヘッダーの高さが52px以下で、文字が省略・切り詰めされない', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 740 });
  const bad: string[] = [];
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const res = await page.evaluate(() => {
      const header = document.querySelector('header');
      const clipped: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || el.closest('.sr-only, .katex')) continue;
        const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (!hasText) continue;
        const clamp = cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '';
        const ellipsis = cs.textOverflow === 'ellipsis';
        const hiddenOverflow = (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
        if (clamp || ellipsis || hiddenOverflow || /…$/.test(el.textContent!.trim())) clipped.push(el.textContent!.trim().slice(0, 30));
      }
      return { header: header ? header.getBoundingClientRect().height : 0, clipped };
    });
    if (res.header > 52) bad.push(`${r}: header ${res.header}px`);
    for (const c of res.clipped) bad.push(`${r}: ${c}`);
  }
  expect(bad).toEqual([]);
});
