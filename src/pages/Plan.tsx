import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { FIELDS, lawBaseDateFor } from '../domain/exam';
import { buildPlan, progressGap } from '../domain/plan';
import { eligibleForPractice } from '../domain/selection';
import { localDate } from '../domain/srs';
import { setSetting, useSettings } from '../state/settings';
import { useExamKey, useUserState } from '../ui/hooks';
import { PageNote, PageTitle } from '../ui/Layout';
import { Empty } from '../ui/common';

/** 学習計画（受験日・学習時間・理解度・苦手分野から自動生成。毎日再計算して遅れを吸収する） */
export function PlanPage() {
  const settings = useSettings();
  const exam = useExamKey();
  const u = useUserState();
  const { questions } = useContent();
  const [form, setForm] = useState<{ examDate: string; minutesPerDay: number; daysPerWeek: number; understanding: number } | null>(null);
  const pool = useMemo(() => (exam ? eligibleForPractice(questions, { exams: [exam], includeCalc: true }) : []), [questions, exam]);
  const learnedSincePlan = useLiveQuery(async () => {
    if (!settings?.plan) return 0;
    const xs = await db.attempts.where('at').aboveOrEqual(settings.plan.createdAt).toArray();
    const before = new Set((await db.attempts.where('at').below(settings.plan.createdAt).toArray()).map((a) => a.itemId));
    return new Set(xs.filter((a) => a.itemKind === 'question' && !before.has(a.itemId)).map((a) => a.itemId)).size;
  }, [settings?.plan]);
  if (!settings || !exam || !u) return <p role="status">読み込み中…</p>;

  const f = form ?? {
    examDate: settings.examDate ?? '',
    minutesPerDay: settings.plan?.minutesPerDay ?? 20,
    daysPerWeek: settings.plan?.daysPerWeek ?? 6,
    understanding: settings.plan?.understanding ?? 2,
  };
  const today = localDate();
  const learned = new Set([...u.stats.entries()].filter(([id, s]) => s.attempts > 0 && pool.some((q) => q.id === id)).map(([id]) => id)).size;
  const plan =
    settings.examDate && settings.plan
      ? buildPlan({
          today,
          examDate: settings.examDate,
          grade: settings.grade,
          minutesPerDay: settings.plan.minutesPerDay,
          daysPerWeek: settings.plan.daysPerWeek,
          understanding: settings.plan.understanding,
          weakFields: u.weakFields,
          poolSize: pool.length,
          learnedCount: learned,
        })
      : null;
  const save = async () => {
    await setSetting('examDate', f.examDate || null);
    await setSetting('plan', { minutesPerDay: f.minutesPerDay, daysPerWeek: f.daysPerWeek, understanding: f.understanding, createdAt: settings.plan?.createdAt ?? new Date().toISOString() });
    await setSetting('dailyGoal', Math.max(5, Math.round(f.minutesPerDay / (settings.grade === 2 ? 2 : 1.5))));
    setForm(null);
  };
  const lbd = f.examDate ? lawBaseDateFor(f.examDate) : null;

  return (
    <div className="space-y-4">
      <PageTitle>学習計画</PageTitle>
      <section className="card space-y-3">
        <label className="block">
          <span className="label">受験予定日</span>
          <input type="date" className="input mt-1" value={f.examDate} min={today} onChange={(e) => setForm({ ...f, examDate: e.target.value })} />
          {f.examDate && (
            <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
              {lbd ? `適用される法令基準日：${lbd}（日本FP協会 試験日程より）` : '法令基準日が公表されていない期間です。'}
            </span>
          )}
        </label>
        <label className="block">
          <span className="label">1日の学習時間：{f.minutesPerDay}分</span>
          <input type="range" min={5} max={120} step={5} className="w-full accent-brand-700" value={f.minutesPerDay} onChange={(e) => setForm({ ...f, minutesPerDay: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="label">週の学習日数：{f.daysPerWeek}日</span>
          <input type="range" min={1} max={7} className="w-full accent-brand-700" value={f.daysPerWeek} onChange={(e) => setForm({ ...f, daysPerWeek: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="label">現在の理解度（自己評価）：{['', 'ほぼ初学者', '少し分かる', '半分くらい', 'だいたい分かる', '仕上げ段階'][f.understanding]}</span>
          <input type="range" min={1} max={5} className="w-full accent-brand-700" value={f.understanding} onChange={(e) => setForm({ ...f, understanding: Number(e.target.value) })} />
        </label>
        <button className="btn-primary w-full" onClick={save} disabled={!f.examDate}>
          計画を作成・更新
        </button>
      </section>

      {!plan ? (
        <Empty>受験予定日を入力して計画を作成してください。</Empty>
      ) : (
        <>
          <section className="card space-y-1 text-sm">
            <p>
              受験日まで <b>{plan.daysLeft}日</b>（学習日 {plan.studyDays}日）
            </p>
            <p>
              1日の目標：新しい問題 <b>{plan.dailyNew}問</b>＋復習（約{plan.days.find((d) => d.kind === 'study')?.reviewMinutes ?? 0}分）
            </p>
            {u.weakFields.length > 0 && <p>苦手分野（多めに配分）：{u.weakFields.map((x) => FIELDS[x].short).join('・')}</p>}
            {learnedSincePlan !== undefined && settings.plan && progressGap(plan, today, learnedSincePlan) > 0 && (
              <p className="text-amber-700 dark:text-amber-300">計画より少し遅れています。今日からの目標を再計算しました。</p>
            )}
            {plan.warnings.map((w) => (
              <p key={w} className="text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}
          </section>
          <section className="card">
            <h2 className="mb-2 font-bold">今後2週間の予定</h2>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {plan.days.slice(0, 14).map((d) => (
                <li key={d.date} className="flex min-h-11 items-center justify-between gap-2 py-1.5">
                  <span className="tabular-nums">
                    {d.date.slice(5).replace('-', '/')}（{'日月火水木金土'[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}）
                  </span>
                  <span className="text-right">
                    {d.kind === 'rest' && <span className="text-slate-400">休み</span>}
                    {d.kind === 'mock' && <b>模擬試験</b>}
                    {d.kind === 'final' && <b>総復習（苦手・間違えた問題）</b>}
                    {d.kind === 'study' && `${d.fields.map((x) => FIELDS[x].short).join('・')} ${d.newQuestions}問＋復習${d.reviewMinutes}分`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <PageNote>
        <p>短時間でも続けられる計画を自動で作ります。計画は毎日、現在の進み具合から作り直されます。</p>
      </PageNote>
    </div>
  );
}
