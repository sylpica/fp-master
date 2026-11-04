import { expect, test } from '@playwright/test';

test('説明書：機能ごとの使い方を開くと、入力項目・結果の読み方・対処が読める', async ({ page }) => {
  await page.goto('./#/guide');
  const mock = page.locator('details', { has: page.locator('summary', { hasText: /^模擬試験$/ }) });
  await mock.locator('summary').click();
  await expect(mock.getByRole('heading', { name: '操作と入力項目' })).toBeVisible();
  await expect(mock.getByRole('heading', { name: '結果の読み方' })).toBeVisible();
  await expect(mock.getByRole('heading', { name: 'うまくいかないとき' })).toBeVisible();
  await expect(mock.getByText(/時間切れになると/)).toBeVisible();
  await expect(mock.getByRole('link', { name: '模擬試験を開く' })).toHaveAttribute('href', /#\/mock$/);
});

test('説明書：計算種別の詳細は生成器から描かれ、まれな出題パターンも載る', async ({ page }) => {
  await page.goto('./#/guide');
  const item = page.locator('li', { hasText: /^退職所得（/ });
  await item.locator('summary').click();
  await expect(item.getByText(/応用：.*特定役員退職手当等/)).toBeVisible();
  await expect(item.getByText(/与えられる値：勤続年数・退職一時金/)).toBeVisible();
  await expect(item.getByText(/端数処理：円未満切捨て/)).toBeVisible();
});
