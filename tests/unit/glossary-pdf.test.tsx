import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlossaryPage } from '../../src/pages/Glossary';

// 問題データの読込が終わらない状態を再現する（useEffect の完了前でもボタンが出ることの回帰防止）。
// vi.mock の工場は import より先に評価されるため、保留 Promise は工場内で直接作る。
const h = vi.hoisted(() => ({ load: null as unknown }));

vi.mock('../../src/content/index', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/content/index')>();
  return {
    ...orig,
    loadAllQuestionSets: () => h.load as Promise<unknown[]>,
  };
});

import { ContentProvider } from '../../src/content/store';
import { Layout } from '../../src/ui/Layout';
import { LoadErrorBoundary } from '../../src/ui/LoadErrorScreen';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom には matchMedia がないため、Layout のテーマ判定用に最小スタブを置く
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList;
  }
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  h.load = null;
});

describe('用語集：要点まとめPDFボタン（コンテンツ非依存）', () => {
  it('問題データの読込完了後、用語集画面に両級のボタンを表示する', async () => {
    h.load = Promise.resolve([]); // 空の問題セットで即時完了させ、用語集（静的用語データ）だけを描画する
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <ContentProvider>
          <LoadErrorBoundary>
            <MemoryRouter initialEntries={['/glossary']}>
              <Routes>
                <Route element={<Layout />}>
                  <Route path="glossary" element={<GlossaryPage />} />
                </Route>
              </Routes>
            </MemoryRouter>
          </LoadErrorBoundary>
        </ContentProvider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('2級 要点まとめPDFを開く');
    expect(labels).toContain('3級 要点まとめPDFを開く');
  });
});
