import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { EXAM_SPECS, fieldIdsFor, fieldsFor } from '../domain/exam';
import { accuracy, accuracyByField, dailyTrend, medianTimeMs } from '../domain/stats';
import { estimateReadiness } from '../domain/readiness';
import { eligibleForPractice } from '../domain/selection';
import { localDate } from '../domain/srs';
import type { FieldId } from '../domain/types';
import { useExamKey } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { LineChart } from '../ui/Chart';
import { Empty, ProgressBar, Stat, formatMs, pct } from '../ui/common';

/** 成績分析（正答率推移・分野別・テーマ別の未学習・解答速度・模擬試験・到達度） */
export function StatsPage() {
  const exam = useExamKey();
  const { questions } = useContent();
  const pool = useMemo(() => (exam ? eligibleForPractice(questions, { exams: [exam], includeCalc: true }) : []), [questions, exam]);
  const data = useLiveQuery(async () => {
    if (!exam) return null;
    const ids = new Set(pool.map((q) => q.id));
    const attempts = (await db.attempts.where('itemKind').equals('question').toArray()).filter((a) => ids.has(a.itemId));
    const mocks = await db.mockResults.where('exam').equals(exam).sortBy('finishedAt');
    const srs = await db.srs.toArray();
    return { attempts, mocks, srs };
  }, [exam, pool]);
  if (!exam || !data) return <p role="status">読み込み中…</p>;
  const { attempts, mocks, srs } = data;
  if (attempts.length === 0 && mocks.length === 0) {
    return (
      <div>
        <PageTitle>成績分析</PageTitle>
        <Empty>まだ学習記録がありません。演習を始めると、ここに成績が表示されます。</Empty>
      </div>
    );
  }
  const today = localDate();
  const acc = accuracy(attempts);
  const trend = dailyTrend(attempts, today, 30);
  const byField = accuracyByField(attempts);
  const attempted = new Set(attempts.map((a) => a.itemId));
  const coverage = Object.fromEntries(
    fieldIdsFor(exam).map((f) => {
      const qs = pool.filter((q) => q.field === f);
      return [f, qs.length ? qs.filter((q) => attempted.has(q.id)).length / qs.length : 0];
    }),
  ) as Record<FieldId, number>;
  const themes = new Map<string, { total: number; done: number; field: FieldId }>();
  for (const q of pool) {
    const k = `${q.field}|${q.theme}`;
    const t = themes.get(k) ?? { total: 0, done: 0, field: q.field };
    t.total++;
    if (attempted.has(q.id)) t.done++;
    themes.set(k, t);
  }
  const recent = [...attempts].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 200);
  // 今日が期限の復習のうち、今日すでに解いたものの割合
  const qsrs = srs.filter((s) => s.key.startsWith('q:') && attempted.has(s.key.slice(2)));
  const pending = qsrs.filter((s) => s.due <= today).length;
  const doneToday = qsrs.filter((s) => s.last === today).length;
  const readiness = estimateReadiness({
    recent: recent.map((a) => ({ field: a.field, correct: a.correct })),
    coverage,
    mockRates: [...mocks].reverse().map((m) => m.score / m.max),
    reviewCompletion: pending + doneToday > 0 ? doneToday / (pending + doneToday) : null,
    passRate: EXAM_SPECS[exam].passScore / EXAM_SPECS[exam].maxScore,
    fields: fieldIdsFor(exam),
  });
  const median = medianTimeMs(attempts);

  return (
    <div className="space-y-4">
      <PageTitle sub={EXAM_SPECS[exam].label}>成績分析</PageTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="解答数" value={acc.attempts} />
        <Stat label="正答率" value={pct(acc.rate)} />
        <Stat label="解答速度（中央値）" value={formatMs(median)} />
      </div>

      <section className="card space-y-2">
        <h2 className="font-bold">合格到達度（目安）</h2>
        <p className="text-2xl font-bold">
          {readiness.label}
          {readiness.score !== null && <span className="ml-2 text-base text-slate-600 dark:text-slate-400">到達度スコア {readiness.score}</span>}
        </p>
        <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
          {readiness.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2 className="mb-2 font-bold">正答率の推移（30日）</h2>
        <LineChart points={trend.map((t) => ({ x: t.day, y: t.rate }))} label="日別正答率の推移" />
      </section>

      <section className="card">
        <h2 className="mb-2 font-bold">分野別</h2>
        <ul className="space-y-2">
          {fieldIdsFor(exam).map((f) => (
            <li key={f} className="text-sm">
              <div className="flex justify-between">
                <span>{fieldsFor(exam)[f].name}</span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  正答率 {pct(byField[f].rate)}・学習済み {pct(coverage[f])}
                </span>
              </div>
              <ProgressBar value={Math.round(coverage[f] * 100)} max={100} label={`${fieldsFor(exam)[f].name}の学習済み割合`} />
            </li>
          ))}
        </ul>
      </section>

      <details className="card">
        <summary className="min-h-10 cursor-pointer font-bold">未学習範囲（テーマ別）</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {[...themes.entries()]
            .sort((a, b) => a[1].done / a[1].total - b[1].done / b[1].total)
            .map(([k, t]) => (
              <li key={k} className="flex justify-between">
                <span>
                  {fieldsFor(exam)[t.field].short}：{k.split('|')[1]}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-400">
                  {t.done}/{t.total}
                </span>
              </li>
            ))}
        </ul>
      </details>

      {mocks.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">模擬試験の成績比較</h2>
          <LineChart
            points={mocks.map((m) => ({ x: m.finishedAt.slice(0, 10), y: m.score }))}
            max={EXAM_SPECS[exam].maxScore}
            format={(v) => `${Math.round(v)}`}
            label="模擬試験の得点推移"
          />
          <p className="text-sm text-slate-600 dark:text-slate-400">合格基準：{EXAM_SPECS[exam].passScore}点</p>
        </section>
      )}
    </div>
  );
}
