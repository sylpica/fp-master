import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FactCard, LawChange, Question, QuestionSet, Term } from '../domain/types';
import { buildMatcher, type TermMatcher } from '../domain/termlink';
import { importWithRetry, loadAllQuestionSets } from './index';
import { clearStaleBuildGuard, recoverFromStaleBuild } from './staleBuild';
import { LoadErrorScreen } from '../ui/LoadErrorScreen';
import glossaryJson from './glossary.json';
import cardsJson from './cards.json';
import lawJson from './law-changes.json';
import questionTermsJson from './question-terms.json';

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  field: Term['field'];
  grades: Term['grades'];
  kind: 'term' | 'fact';
  termId?: string;
  reviewStatus: 'verified' | 'draft';
}

export interface Content {
  sets: QuestionSet[];
  questions: Question[];
  questionById: Map<string, Question>;
  terms: Term[];
  termById: Map<string, Term>;
  /** 用語リンクの照合器（全画面で共有し、コンポーネントごとに再構築しない） */
  termMatcher: TermMatcher;
  cards: StudyCard[];
  lawChanges: LawChange[];
  /** 問題ID → 関連する改正情報（確認済みのみ） */
  lawByQuestion: Map<string, { change: LawChange; impact: LawChange['affectedQuestions'][number] }[]>;
}

export const TERMS = glossaryJson as unknown as Term[];
export const FACT_CARDS = cardsJson as unknown as FactCard[];
export const LAW_CHANGES = lawJson as unknown as LawChange[];
/** 問題ID → 関連用語 */
const QUESTION_TERMS = questionTermsJson as unknown as Record<string, string[]>;

export type ExplanationEntry = { terms: string[]; explanation: NonNullable<Question['explanation']> };
let explanationsPromise: Promise<Record<string, ExplanationEntry>> | null = null;
/** 解説本体（問題データとは別ファイル・サイズが大きい）は、解説を表示するときに初めて読み込む */
export function loadExplanations(): Promise<Record<string, ExplanationEntry>> {
  explanationsPromise ??= importWithRetry(() => import('./explanations.json'))
    .then((m) => m.default as unknown as Record<string, ExplanationEntry>)
    .catch((e: unknown) => {
      // 失敗した Promise をキャッシュし続けると再試行できなくなるため、次回呼び出しで読み直せるよう戻す
      explanationsPromise = null;
      throw e;
    });
  return explanationsPromise;
}

/**
 * 解説データを Service Worker のランタイムキャッシュに入れておく。
 * 解説は初めて表示するときに読み込むため、オンラインで一度も解説を開かずにオフラインになると
 * 解説が読めない。SW がページを制御している（＝取得結果がキャッシュされる）オンライン時に、
 * 操作の邪魔にならないよう少し遅らせて先読みする。
 */
export function prefetchExplanationsForOffline(): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller || !navigator.onLine) return;
  setTimeout(() => void loadExplanations().catch(() => undefined), 3000);
}

export type ExplanationState = ExplanationEntry | null | undefined | 'error';

/** 問題の解説を取得する（読み込み中は undefined、解説がなければ null、読み込みに失敗したら 'error'） */
export function useExplanationEntry(id: string): { entry: ExplanationState; retry: () => void } {
  const [map, setMap] = useState<Record<string, ExplanationEntry> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadExplanations().then(
      (m) => alive && setMap(m),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = () => setAttempt((n) => n + 1);
  if (!map) return { entry: failed ? 'error' : undefined, retry };
  return { entry: map[id] ?? null, retry };
}

export function buildCards(terms: Term[], facts: FactCard[]): StudyCard[] {
  return [
    ...terms.map((t) => ({
      id: `t-${t.id}`,
      front: t.name,
      back: t.short,
      field: t.field,
      grades: t.grades,
      kind: 'term' as const,
      termId: t.id,
      reviewStatus: t.reviewStatus,
    })),
    ...facts.map((f) => ({
      id: f.id,
      front: f.front,
      back: f.back,
      field: f.field,
      grades: f.grades,
      kind: 'fact' as const,
      termId: f.termId,
      reviewStatus: f.reviewStatus,
    })),
  ];
}

export function buildContent(sets: QuestionSet[]): Content {
  const questions = sets.flatMap((s) =>
    s.questions.map((q) => {
      const t = QUESTION_TERMS[q.id];
      return t ? { ...q, terms: [...new Set([...(q.terms ?? []), ...t])] } : q;
    }),
  );
  const lawByQuestion: Content['lawByQuestion'] = new Map();
  for (const change of LAW_CHANGES.filter((c) => c.status === 'confirmed')) {
    for (const impact of change.affectedQuestions) {
      lawByQuestion.set(impact.id, [...(lawByQuestion.get(impact.id) ?? []), { change, impact }]);
    }
  }
  // 「正答が変わる」改正の影響を受ける問題は出題しない（隔離扱い）
  const adjusted = questions.map((q) =>
    lawByQuestion.get(q.id)?.some((x) => x.impact.impact === 'changed')
      ? { ...q, status: 'quarantined' as const, quarantineReason: '制度改正により正答が変わるため出題停止' }
      : q,
  );
  return {
    sets,
    questions: adjusted,
    questionById: new Map(adjusted.map((q) => [q.id, q])),
    terms: TERMS,
    termById: new Map(TERMS.map((t) => [t.id, t])),
    termMatcher: buildMatcher(TERMS),
    cards: buildCards(TERMS, FACT_CARDS),
    lawChanges: LAW_CHANGES,
    lawByQuestion,
  };
}

const Ctx = createContext<Content | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadAllQuestionSets()
      .then((sets) => {
        clearStaleBuildGuard();
        if (alive) setContent(buildContent(sets));
      })
      .catch(async (e: unknown) => {
        // 古いビルドの画面が残っている（旧チャンクが消えた）場合は、1回だけ自動で現行ビルドへ合流する
        if (await recoverFromStaleBuild(e).catch(() => false)) return;
        if (alive) setError(String(e));
      });
    prefetchExplanationsForOffline();
    // 初回訪問では SW がまだページを制御していないため、制御が始まった時点で先読みする
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    sw?.addEventListener('controllerchange', prefetchExplanationsForOffline);
    return () => {
      alive = false;
      sw?.removeEventListener('controllerchange', prefetchExplanationsForOffline);
    };
  }, []);
  if (error) {
    return <LoadErrorScreen title="問題データを読み込めませんでした" detail={error} />;
  }
  if (!content) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-slate-600 dark:text-slate-400" role="status">
        読み込み中…
      </div>
    );
  }
  return <Ctx.Provider value={content}>{children}</Ctx.Provider>;
}

export function useContent(): Content {
  const c = useContext(Ctx);
  if (!c) throw new Error('ContentProvider がありません');
  return c;
}

/** 現在の級・科目の問題 */
export function useExamQuestions(exam: string): Question[] {
  const { questions } = useContent();
  return useMemo(() => questions.filter((q) => q.exam === exam), [questions, exam]);
}
