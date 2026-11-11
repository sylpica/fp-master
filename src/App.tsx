import { Suspense, lazy as reactLazy, type ComponentType } from 'react';
import { HashRouter, Route, Routes, useParams } from 'react-router';
import { ContentProvider } from './content/store';
import { recoverFromStaleBuild } from './content/staleBuild';
import { LoadErrorBoundary } from './ui/LoadErrorScreen';
import { Layout } from './ui/Layout';
import { HomePage } from './pages/Home';
import { PracticePage } from './pages/Practice';
import { SessionPage, SessionResultPage } from './pages/Session';

/** 遅延読み込みのページ。古いビルドの画面が残って旧チャンクが読めないときは、1回だけ自動で現行ビルドへ合流する */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazy<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return reactLazy(() =>
    load().catch(async (e: unknown) => {
      if (await recoverFromStaleBuild(e).catch(() => false)) return new Promise<{ default: T }>(() => undefined);
      throw e;
    }),
  );
}

const QuestionListPage = lazy(() => import('./pages/Questions').then((m) => ({ default: m.QuestionListPage })));
const QuestionDetailPage = lazy(() => import('./pages/Questions').then((m) => ({ default: m.QuestionDetailPage })));

/** 問題が変わるたびに詳細ページを再マウントし、前の問題の解答状態を持ち越さない */
function KeyedQuestionDetailPage() {
  const { id } = useParams();
  return <QuestionDetailPage key={id} />;
}

const CalcHomePage = lazy(() => import('./pages/Calc').then((m) => ({ default: m.CalcHomePage })));
const CalcRunPage = lazy(() => import('./pages/Calc').then((m) => ({ default: m.CalcRunPage })));

const GlossaryPage = lazy(() => import('./pages/Glossary').then((m) => ({ default: m.GlossaryPage })));
const TermPage = lazy(() => import('./pages/Glossary').then((m) => ({ default: m.TermPage })));

const CardsHomePage = lazy(() => import('./pages/Cards').then((m) => ({ default: m.CardsHomePage })));
const CardsRunPage = lazy(() => import('./pages/Cards').then((m) => ({ default: m.CardsRunPage })));

const ReviewPage = lazy(() => import('./pages/Review').then((m) => ({ default: m.ReviewPage })));

const MockHomePage = lazy(() => import('./pages/Mock').then((m) => ({ default: m.MockHomePage })));
const MockResultPage = lazy(() => import('./pages/Mock').then((m) => ({ default: m.MockResultPage })));
const MockRunPage = lazy(() => import('./pages/Mock').then((m) => ({ default: m.MockRunPage })));

const ChallengePage = lazy(() => import('./pages/Challenge').then((m) => ({ default: m.ChallengePage })));
const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })));

const PlanPage = lazy(() => import('./pages/Plan').then((m) => ({ default: m.PlanPage })));

const BookmarksPage = lazy(() => import('./pages/Bookmarks').then((m) => ({ default: m.BookmarksPage })));

const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })));

const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

const DataPage = lazy(() => import('./pages/Data').then((m) => ({ default: m.DataPage })));

const LawPage = lazy(() => import('./pages/Law').then((m) => ({ default: m.LawPage })));

const MenuPage = lazy(() => import('./pages/Menu').then((m) => ({ default: m.MenuPage })));
const AboutPage = lazy(() => import('./pages/Menu').then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import('./pages/Menu').then((m) => ({ default: m.NotFoundPage })));

const MistakesPage = lazy(() => import('./pages/Mistakes').then((m) => ({ default: m.MistakesPage })));
const GuidePage = lazy(() => import('./pages/Guide').then((m) => ({ default: m.GuidePage })));

export function App() {
  return (
    <HashRouter>
      <ContentProvider>
        <LoadErrorBoundary>
        <Suspense fallback={<p role="status" className="p-4">読み込み中…</p>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="practice" element={<PracticePage />} />
            <Route path="session/:id" element={<SessionPage />} />
            <Route path="session/:id/result" element={<SessionResultPage />} />
            <Route path="questions" element={<QuestionListPage />} />
            <Route path="q/:id" element={<KeyedQuestionDetailPage />} />
            <Route path="calc" element={<CalcHomePage />} />
            <Route path="calc/run/:gen" element={<CalcRunPage />} />
            <Route path="glossary" element={<GlossaryPage />} />
            <Route path="glossary/:id" element={<TermPage />} />
            <Route path="cards" element={<CardsHomePage />} />
            <Route path="cards/run" element={<CardsRunPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="mock" element={<MockHomePage />} />
            <Route path="mock/run/:id" element={<MockRunPage />} />
            <Route path="mock/result/:id" element={<MockResultPage />} />
            <Route path="challenge" element={<ChallengePage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="bookmarks" element={<BookmarksPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="mistakes" element={<MistakesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="law" element={<LawPage />} />
            <Route path="menu" element={<MenuPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="guide" element={<GuidePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </Suspense>
        </LoadErrorBoundary>
      </ContentProvider>
    </HashRouter>
  );
}
