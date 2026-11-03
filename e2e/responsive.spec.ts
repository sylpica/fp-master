import { expect, test } from '@playwright/test';

// 狭い幅（320px）〜PCの広い幅（1920px）で横スクロールが出ないこと（監査指令書 第19節の検証幅）
const ROUTES = ['./', './#/practice', './#/challenge', './#/calc', './#/glossary', './#/cards', './#/review', './#/mock', './#/stats', './#/plan', './#/settings', './#/data', './#/law', './#/menu', './#/guide', './#/q/g3-202605-01', './#/q/j2-202409-24'];
for (const width of [320, 375, 390, 430, 768, 1024, 1366, 1920]) {
  test(`横スクロールなし：幅${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const bad: string[] = [];
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) bad.push(`${r}: +${over}px`);
    }
    expect(bad).toEqual([]);
  });
}
