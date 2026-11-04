import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db, type StudySession } from '../db/db';
import { recordAttempt, saveSession } from '../db/repo';
import { buildOfficialSetMock, buildRandomMock, scoreMock, type MockBuildResult } from '../domain/mock';
import { EXAM_SPECS, FIELD_IDS, FIELDS } from '../domain/exam';
import { newSeed } from '../domain/random';
import { scoreQuestion, type Responses } from '../domain/scoring';
import { ratingFromAnswer } from '../domain/srs';
import type { ExamKey } from '../domain/types';
import { newId } from '../state/sessions';
import { useExamKey } from '../ui/hooks';
import { PageNote, PageTitle } from '../ui/Layout';
import { AnswerArea, QuestionHeader, Stem } from '../ui/QuestionView';
import { Empty, ProgressBar, pct, questionLabel } from '../ui/common';
import { TermPopupProvider } from '../ui/TermText';

export function MockHomePage() {
  const exam = useExamKey();
  const { questions, sets } = useContent();
  const nav = useNavigate();
  const history = useLiveQuery(() => (exam ? db.mockResults.where('exam').equals(exam).reverse().sortBy('finishedAt') : []), [exam]);
  const [preview, setPreview] = useState<{ title: string; build: MockBuildResult } | null>(null);
  if (!exam) return null;
  const spec = EXAM_SPECS[exam];
  const examSets = sets.filter((s) => s.exam === exam && s.officialSet);

  const begin = async (title: string, build: MockBuildResult) => {
    const now = new Date().toISOString();
    const s: StudySession = {
      id: newId(),
      kind: 'mock',
      title,
      config: { exam, complete: build.complete },
      itemIds: build.questions.map((q) => q.id),
      answers: {},
      flagged: [],
      index: 0,
      startedAt: now,
      updatedAt: now,
      exam,
      // 問題数が本試験より少ない場合は時間を比例配分（独自仕様）
      timeLimitSec: Math.round((spec.minutes * 60 * build.questions.length) / spec.questionCount),
    };
    await saveSession(s);
    nav(`/mock/run/${s.id}`);
  };

  return (
    <div className="space-y-4">
      <PageTitle>模擬試験</PageTitle>
      <section className="card text-sm">
        <h2 className="mb-1 font-bold">{spec.label}</h2>
        <p>
          試験時間 {spec.minutes}分／{spec.questionCount}問／{spec.format}／合格基準 {spec.passScore}点以上（{spec.maxScore}点満点）
        </p>
      </section>

      {examSets.length === 0 ? (
        <Empty>
          {spec.subject === 'jitsugi'
            ? '実技試験（資産設計提案業務）の検証済み問題がまだないため、模擬試験は利用できません。公式問題の取り込みと検証を進めています。'
            : '検証済みの問題が不足しています。'}
        </Empty>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="label">公表問題をそのまま解く（本試験と同じ構成）</h2>
            {examSets.map((s) => {
              const ym = s.questions[0]?.source.kind === 'official' ? s.questions[0].source.yearMonth : '';
              const build = buildOfficialSetMock(questions, exam, ym);
              return (
                <button key={s.id} className="btn-secondary w-full justify-between" onClick={() => setPreview({ title: s.title, build })}>
                  <span>{s.title}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{build.questions.length}問</span>
                </button>
              );
            })}
          </section>
          <section className="space-y-2">
            <h2 className="label">
              ランダム構成（{questions.some((q) => q.exam === exam && q.source.kind === 'original' && q.status === 'verified') ? '公表問題とオリジナル問題' : '複数回の公表問題'}から分野配分どおりに出題）
            </h2>
            <button className="btn-secondary w-full" onClick={() => setPreview({ title: `${spec.shortLabel} ランダム模擬試験`, build: buildRandomMock(questions, exam, newSeed()) })}>
              ランダムに作成する
            </button>
          </section>
        </>
      )}

      {preview && (
        <section className="card space-y-2" aria-live="polite">
          <h2 className="font-bold">{preview.title}</h2>
          <p className="text-sm">
            {preview.build.questions.length}問（うち計算問題 {preview.build.calcCount}問）／制限時間 {Math.round((spec.minutes * preview.build.questions.length) / spec.questionCount)}分
          </p>
          {!preview.build.complete && (
            <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-semibold">制限事項：本試験と同じ問題数・構成になっていません。</p>
              <ul className="list-disc pl-5">
                {preview.build.shortages.map((x, i) => (
                  <li key={i}>
                    {x.kind === 'any' || x.kind === 'truefalse' || x.kind === 'choice' ? `${FIELDS[x.field].short}（${{ any: '全形式', truefalse: '正誤式', choice: '択一式' }[x.kind]}）` : x.kind}：必要{x.needed}問／検証済み{x.available}問
                  </li>
                ))}
              </ul>
              <p>得点は満点換算の参考値です。</p>
            </div>
          )}
          <button className="btn-primary w-full" disabled={!preview.build.questions.length} onClick={() => begin(preview.title, preview.build)}>
            開始する
          </button>
        </section>
      )}

      {history && history.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">成績履歴</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((h) => (
              <li key={h.id}>
                <Link to={`/mock/result/${h.id}`} className="flex min-h-12 items-center justify-between py-2 text-sm">
                  <span>
                    {new Date(h.finishedAt).toLocaleDateString('ja-JP')} {h.title}
                  </span>
                  <span className={`tabular-nums font-semibold ${h.passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                    {h.score}/{h.max}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PageNote>
        <p>本試験の時間・問題数・合格基準に準拠し、計算問題も本試験と同様に含みます。</p>
        {!spec.pointsOfficial && <p>1問あたりの配点は公表されていないため、本アプリでは均等配点（1問{spec.pointsPerQuestion}点）で採点します（独自仕様）。</p>}
        <p>出典：日本FP協会 試験要綱（2026年10月確認）</p>
      </PageNote>
    </div>
  );
}

function useCountdown(s: StudySession | null | undefined): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!s?.timeLimitSec) return null;
  return Math.max(0, Math.round(s.timeLimitSec - (now - Date.parse(s.startedAt)) / 1000));
}

export function MockRunPage() {
  const { id } = useParams();
  const { questionById } = useContent();
  const nav = useNavigate();
  const [s, setS] = useState<StudySession | null | undefined>(undefined);
  const [showList, setShowList] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const remaining = useCountdown(s);

  useEffect(() => {
    db.sessions.get(id ?? '').then((x) => setS(x ?? null));
  }, [id]);

  const submit = async (cur: StudySession) => {
    if (cur.finishedAt) return;
    const exam = cur.exam as ExamKey;
    const items = cur.itemIds.map((qid) => {
      const q = questionById.get(qid)!;
      const r = scoreQuestion(q, cur.answers[qid]?.responses ?? {});
      return { q, correct: r.correct, answered: r.complete };
    });
    const finishedAt = new Date().toISOString();
    const sc = scoreMock(exam, items.map((x) => ({ field: x.q.field, correct: x.correct })));
    // 「採点する」の連打や制限時間切れとの同時発生で二重に採点しないよう、
    // 採点済みかの確認・履歴の記録・成績の保存・セッションの終了を1つのトランザクションで行う
    const resultId = await db.transaction('rw', [db.sessions, db.attempts, db.srs, db.mockResults], async () => {
      const stored = await db.sessions.get(cur.id);
      if (stored?.finishedAt) return (await db.mockResults.where('finishedAt').equals(stored.finishedAt).first())?.id ?? null;
      for (const it of items.filter((x) => x.answered)) {
        await recordAttempt(
          { itemId: it.q.id, itemKind: 'question', exam: it.q.exam, field: it.q.field, correct: it.correct, timeMs: 0, sessionId: cur.id, mode: 'mock', at: finishedAt },
          ratingFromAnswer(it.correct, false),
        );
      }
      const id = await db.mockResults.add({
        sessionId: cur.id,
        exam,
        title: cur.title,
        startedAt: cur.startedAt,
        finishedAt,
        score: sc.score,
        max: sc.max,
        pass: sc.pass,
        passed: sc.passed,
        correctCount: sc.correctCount,
        total: sc.total,
        complete: (cur.config as { complete?: boolean }).complete ?? false,
        byField: sc.byField,
        elapsedSec: Math.round((Date.parse(finishedAt) - Date.parse(cur.startedAt)) / 1000),
      });
      await db.sessions.put({ ...cur, finishedAt, updatedAt: finishedAt });
      return id;
    });
    nav(resultId ? `/mock/result/${resultId}` : '/mock', { replace: true });
  };

  useEffect(() => {
    if (s && remaining === 0 && !s.finishedAt) void submit(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, s]);

  if (s === undefined) return <p role="status">読み込み中…</p>;
  if (s === null) return <Empty>模擬試験が見つかりません。</Empty>;
  if (s.finishedAt) return <Navigate to="/mock" replace />;
  const q = questionById.get(s.itemIds[s.index]!);
  if (!q) return <Empty>問題が見つかりません。</Empty>;
  const update = async (next: StudySession) => {
    setS(next);
    await saveSession(next);
  };
  const ans = s.answers[q.id];
  const answeredCount = s.itemIds.filter((x) => scoreQuestion(questionById.get(x)!, s.answers[x]?.responses ?? {}).complete).length;
  const flagged = s.flagged.includes(q.id);
  const mm = remaining !== null ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : '';

  return (
    <TermPopupProvider enabled={false}>
      <div className="pb-28">
        <div className="sticky top-0 z-10 -mx-4 bg-slate-50/95 px-4 pb-2 pt-3 backdrop-blur dark:bg-slate-950/95">
          <div className="mb-2 flex items-center justify-between text-sm">
            <button className="min-h-10 px-1 text-slate-600 dark:text-slate-400" onClick={() => nav('/mock')}>
              ← 中断
            </button>
            <span className={`font-mono text-base font-bold tabular-nums ${remaining !== null && remaining < 300 ? 'text-rose-700' : ''}`} aria-label="残り時間" role="timer">
              ⏱ {mm}
            </span>
            <button className="chip" onClick={() => setShowList(!showList)} aria-expanded={showList}>
              一覧 {answeredCount}/{s.itemIds.length}
            </button>
          </div>
          <ProgressBar value={answeredCount} max={s.itemIds.length} label="解答済みの問題数" />
        </div>
        {showList && (
          <div className="card my-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10" role="list" aria-label="問題一覧">
            {s.itemIds.map((x, i) => {
              const done = scoreQuestion(questionById.get(x)!, s.answers[x]?.responses ?? {}).complete;
              const fl = s.flagged.includes(x);
              return (
                <button
                  key={x}
                  role="listitem"
                  className={`relative min-h-10 rounded-lg border text-sm tabular-nums ${i === s.index ? 'border-brand-700 font-bold' : 'border-slate-300 dark:border-slate-700'} ${done ? 'bg-brand-100 dark:bg-brand-900/50' : ''}`}
                  aria-label={`問${i + 1}${done ? ' 解答済み' : ' 未解答'}${fl ? ' 見直しフラグあり' : ''}`}
                  onClick={() => {
                    void update({ ...s, index: i });
                    setShowList(false);
                  }}
                >
                  {i + 1}
                  {fl && <span className="absolute -right-1 -top-1 text-xs text-amber-600">●</span>}
                </button>
              );
            })}
          </div>
        )}
        <QuestionHeader q={q} index={s.index} total={s.itemIds.length} />
        <Stem q={q} />
        <AnswerArea
          q={q}
          responses={ans?.responses ?? {}}
          onChange={(r: Responses) => update({ ...s, answers: { ...s.answers, [q.id]: { responses: r } } })}
          mode="exam"
        />
        <button className={`chip mt-4 ${flagged ? 'chip-on' : ''}`} aria-pressed={flagged} onClick={() => update({ ...s, flagged: flagged ? s.flagged.filter((x) => x !== q.id) : [...s.flagged, q.id] })}>
          後で見直す
        </button>
        {confirm && (
          <div role="alertdialog" aria-label="採点の確認" className="card mt-4 space-y-2 border-brand-600">
            <p>
              未解答が {s.itemIds.length - answeredCount}問、見直しフラグが {s.flagged.length}問あります。採点しますか？
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => setConfirm(false)}>
                戻る
              </button>
              <button className="btn-primary" onClick={() => submit(s)}>
                採点する
              </button>
            </div>
          </div>
        )}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2">
            <button className="btn-secondary" disabled={s.index === 0} onClick={() => update({ ...s, index: s.index - 1 })}>
              前へ
            </button>
            <button className="btn-secondary" onClick={() => setConfirm(true)}>
              採点
            </button>
            <button className="btn-primary" disabled={s.index + 1 >= s.itemIds.length} onClick={() => update({ ...s, index: s.index + 1 })}>
              次へ
            </button>
          </div>
        </div>
      </div>
    </TermPopupProvider>
  );
}

export function MockResultPage() {
  const { id } = useParams();
  const { questionById } = useContent();
  const r = useLiveQuery(() => db.mockResults.get(Number(id)), [id]);
  const session = useLiveQuery(() => (r ? db.sessions.get(r.sessionId) : undefined), [r]);
  const prev = useLiveQuery(async () => {
    if (!r) return [];
    return (await db.mockResults.where('exam').equals(r.exam).sortBy('finishedAt')).filter((x) => x.finishedAt < r.finishedAt).slice(-1);
  }, [r]);
  const wrong = useMemo(() => {
    if (!session) return [];
    return session.itemIds.filter((x) => {
      const q = questionById.get(x);
      return q && !scoreQuestion(q, session.answers[x]?.responses ?? {}).correct;
    });
  }, [session, questionById]);
  if (!r) return <p role="status">読み込み中…</p>;
  const spec = EXAM_SPECS[r.exam];
  const last = prev?.[0];
  return (
    <div className="space-y-4">
      <div className="card text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">{r.title}</p>
        <p className="mt-2 text-4xl font-bold tabular-nums">
          {r.score} <span className="text-lg text-slate-600 dark:text-slate-400">/ {r.max}点</span>
        </p>
        <p className={`mt-1 font-semibold ${r.passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          合格基準（{r.pass}点）{r.passed ? 'に到達' : `まであと${Math.round((r.pass - r.score) * 10) / 10}点`}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          正解 {r.correctCount}/{r.total}問・所要 {Math.round(r.elapsedSec / 60)}分
        </p>
        {last && <p className="mt-1 text-sm">前回比：{r.score - last.score >= 0 ? '+' : ''}{Math.round((r.score - last.score) * 10) / 10}点</p>}
        {!r.complete && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">本試験と同じ問題数ではないため、得点は満点換算の参考値です。</p>}
        {!spec.pointsOfficial && <p className="text-xs text-slate-600 dark:text-slate-400">配点は均等配点の独自仕様です。</p>}
      </div>
      <section className="card">
        <h2 className="mb-2 font-bold">分野別の成績</h2>
        <ul className="space-y-1.5">
          {FIELD_IDS.filter((f) => r.byField[f].total > 0).map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <span className="w-16">{FIELDS[f].short}</span>
              <div className="flex-1">
                <ProgressBar value={r.byField[f].correct} max={r.byField[f].total} label={FIELDS[f].name} />
              </div>
              <span className="w-20 text-right tabular-nums">
                {r.byField[f].correct}/{r.byField[f].total}（{pct(r.byField[f].correct / r.byField[f].total)}）
              </span>
            </li>
          ))}
        </ul>
      </section>
      {wrong.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">間違えた・未解答の問題（{wrong.length}問）</h2>
          <ul className="space-y-2 text-sm">
            {wrong.map((x) => (
              <li key={x}>
                <Link to={`/q/${x}`} className="underline decoration-slate-300">
                  {questionById.has(x) ? questionLabel(questionById.get(x)!) : x}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-2">
        <Link to="/review" className="btn-primary">
          間違えた問題を復習する
        </Link>
        <Link to="/mock" className="btn-secondary">
          模擬試験トップへ
        </Link>
      </div>
    </div>
  );
}
