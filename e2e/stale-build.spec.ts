import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * 旧ビルドの画面が残った端末が、デプロイで消えた旧ハッシュのチャンクを読みに行く経路の再現。
 * 旧ビルド＝npm run build の dist、新ビルド＝dist の内容ハッシュ付きファイル名をすべて付け替えたもの
 * （本番のデプロイで全チャンクのハッシュが変わった状態と同じ。旧ファイルは新ビルドに存在しない）。
 */
const BASE = '/fp-master/';
let ORIGIN = '';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** dist を複製し、ハッシュ付きファイル名を付け替えた「新ビルド」を作る */
function makeNextBuild(src: string, dst: string): void {
  cpSync(src, dst, { recursive: true });
  const renames = new Map<string, string>();
  for (const p of walk(dst)) {
    const name = p.slice(p.lastIndexOf('/') + 1);
    if (/^workbox-[0-9a-f]+\.js$/.test(name) || (p.includes('/assets/') && /\.(js|css)$/.test(name))) {
      const next = name.replace(/\.(js|css)$/, 'N.$1');
      // workbox は sw.js から拡張子なしで参照される。拡張子なしの語幹で置換する（二重置換を避ける）
      if (name.startsWith('workbox-')) renames.set(name.replace(/\.js$/, ''), next.replace(/\.js$/, ''));
      else renames.set(name, next);
      renameSync(p, join(p.slice(0, p.lastIndexOf('/')), next));
    }
  }
  const textFiles = walk(dst).filter((p) => ['.html', '.js', '.css', '.webmanifest'].includes(extname(p)));
  for (const p of textFiles) {
    let s = readFileSync(p, 'utf8');
    for (const [from, to] of renames) s = s.split(from).join(to);
    writeFileSync(p, s);
  }
  // プリキャッシュのリビジョン（内容の md5）を新しい内容に合わせる（index.html 等が再取得されるように）
  const swPath = join(dst, 'sw.js');
  const sw = readFileSync(swPath, 'utf8').replace(/\{url:"([^"]+)",revision:"[^"]+"\}/g, (_m, url: string) => {
    const file = join(dst, url);
    const rev = existsSync(file) ? createHash('md5').update(readFileSync(file)).digest('hex') : 'x';
    return `{url:"${url}",revision:"${rev}"}`;
  });
  writeFileSync(swPath, sw);
}

// 各テストで配信内容（旧/新ビルド）を切り替えるため、同じファイル内は直列に実行する
test.describe.configure({ mode: 'serial' });

let server: Server;
let root = '';
/** true の間、問題データのチャンクはサーバーが 404 を返す（現行ビルドにも存在しない状態） */
let blockChunks = false;
let oldBuild = '';
let nextBuild = '';
let work = '';

test.beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'fp-stale-'));
  oldBuild = join(work, 'old');
  nextBuild = join(work, 'next');
  cpSync('dist', oldBuild, { recursive: true });
  makeNextBuild(oldBuild, nextBuild);
  root = oldBuild;
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end();
      return;
    }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = join(root, rel);
    if (blockChunks && /\/g2_[^/]*\.js$/.test(file)) {
      res.writeHead(404).end('Not Found');
      return;
    }
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/html' }).end('Not Found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(readFileSync(file));
  });
  return new Promise<void>((resolve) =>
    server.listen(0, () => {
      const addr = server.address();
      ORIGIN = `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve();
    }),
  );
});

test.afterEach(() => {
  blockChunks = false;
});

test.afterAll(() => {
  server?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

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

test('旧ビルドの画面が残った端末でも、デプロイ後に自動で現行ビルドへ合流し学習履歴は残る', async ({ context }) => {
  test.setTimeout(90_000);
  root = oldBuild;
  // 1回目の訪問（旧ビルド）：SW がインストールされ、旧シェルがプリキャッシュされる。1問解いて履歴を作る
  const first = await context.newPage();
  await first.goto(`${ORIGIN}${BASE}`);
  await first.getByRole('link', { name: 'すぐに5問解く' }).click();
  await expect(first.getByText('1 / 5')).toBeVisible();
  await first.locator('fieldset button').first().click();
  await first.getByRole('button', { name: '次の問題へ' }).click();
  await expect.poll(() => attemptCount(first)).toBe(1);
  await first.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw new Error('SW not active');
  });
  await first.close();

  // デプロイ：旧ハッシュのファイルはサーバーから消える
  root = nextBuild;
  const oldChunk = readdirSync(join(oldBuild, 'assets')).find((n) => /^g2_.*\.js$/.test(n))!;
  expect(existsSync(join(nextBuild, 'assets', oldChunk))).toBe(false);

  // 2回目の訪問：旧 SW が旧シェルを返し、旧チャンクの読み込みは 404 になる
  const page = await context.newPage();
  await page.goto(`${ORIGIN}${BASE}`);
  await expect(page.getByRole('link', { name: 'すぐに5問解く' })).toBeVisible({ timeout: 45_000 });
  // 現行ビルド（付け替え後のファイル名）で動いている
  const scripts = await page.evaluate(() => Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute('src')));
  expect(scripts.some((s) => /N\.js$/.test(s ?? ''))).toBe(true);
  expect(await attemptCount(page)).toBe(1);
});

test('自動の合流に失敗したときは再読み込みボタンを出し、学習履歴が残ることを示す', async ({ context }) => {
  test.setTimeout(60_000);
  root = oldBuild;
  blockChunks = true;
  const page = await context.newPage();
  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });
  await page.goto(`${ORIGIN}${BASE}`);
  const reload = page.getByRole('button', { name: '再読み込み' });
  await expect(reload).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('学習履歴はこの端末に残っています')).toBeVisible();
  // 自動の再読み込みは1回だけ：エラー画面に到達した後、さらに待っても再読み込みが続かない
  const settled = navigations;
  await page.waitForTimeout(3000);
  expect(navigations).toBe(settled);
  expect(settled).toBeLessThanOrEqual(3); // 初回表示＋自動の再読み込み1回（＋SW 制御開始時の1回）まで
  blockChunks = false;
  await reload.click();
  await expect(page.getByRole('link', { name: 'すぐに5問解く' })).toBeVisible({ timeout: 30_000 });
});
