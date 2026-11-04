import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { EXAM_SPECS, FIELD_IDS, FIELDS } from '../domain/exam';
import { eligibleForPractice } from '../domain/selection';
import { useSettings } from '../state/settings';
import { loadDashboard } from '../state/dashboard';
import { latestUnfinished } from '../db/repo';
import { useExamKey } from '../ui/hooks';
import { ProgressBar, Stat, pct } from '../ui/common';
import { PageNote } from '../ui/Layout';

export function HomePage() {
  const settings = useSettings();
  const exam = useExamKey();
  const { questions } = useContent();
  const pool = useMemo(
    () => (exam && settings ? eligibleForPractice(questions, { exams: [exam], includeCalc: true }) : []),
    [questions, exam, settings],
  );
  const d = useLiveQuery(() => (exam ? loadDashboard(exam, pool, settings?.examDate ?? null) : undefined), [exam, pool, settings?.examDate]);
  const resume = useLiveQuery(() => latestUnfinished(), []);
  if (!settings || !exam || !d) return <p role="status">読み込み中…</p>;
  const spec = EXAM_SPECS[exam];
  const goal = settings.dailyGoal;

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">{spec.label}</h1>
          {d.daysToExam !== null && d.daysToExam >= 0 && <span className="text-sm text-slate-600 dark:text-slate-400">受験日まで あと{d.daysToExam}日</span>}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>今日の目標</span>
            <span className="tabular-nums">
              {d.todayCount} / {goal}問
            </span>
          </div>
          <ProgressBar value={d.todayCount} max={goal} label="今日の目標の達成度" />
        </div>
        <Link to="/practice?quick=5" className="btn-primary w-full text-lg">
          すぐに5問解く
        </Link>
        {resume && (
          <Link to={resume.kind === 'mock' ? `/mock/run/${resume.id}` : `/session/${resume.id}`} className="btn-secondary w-full">
            続きから再開：{resume.title}（{resume.index + 1}/{resume.itemIds.length}）
          </Link>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/review" className="btn-secondary px-2 text-sm">
            今日の復習{d.dueQuestions + d.dueCards > 0 ? `（${d.dueQuestions + d.dueCards}）` : ''}
          </Link>
          <Link to="/calc" className="btn-secondary px-2 text-sm whitespace-nowrap">
            計算トレーニング
          </Link>
        </div>
      </section>

      {d.hasHistory ? (
        <section className="card space-y-3" aria-label="学習状況">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="累計解答" value={d.totalAttempts} />
            <Stat label="正答率" value={pct(d.accuracy)} />
            <Stat label="連続学習" value={`${d.streak}日`} />
          </div>
          <div>
            <h2 className="label mb-2">分野別正答率</h2>
            <ul className="space-y-1.5">
              {FIELD_IDS.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0">{FIELDS[f].short}</span>
                  <div className="flex-1">
                    <ProgressBar value={Math.round((d.byField[f].rate ?? 0) * 100)} max={100} label={`${FIELDS[f].name}の正答率`} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {pct(d.byField[f].rate)}（{d.byField[f].attempts}）
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span>未学習：{d.unlearned} / {d.poolSize}問</span>
            {d.weakFields.length > 0 && <span>苦手：{d.weakFields.map((f) => FIELDS[f].short).join('・')}</span>}
            {d.lastMock && (
              <span>
                前回の模擬試験：{d.lastMock.score}/{d.lastMock.max}点（{d.lastMock.passed ? '合格基準以上' : '基準未満'}）
              </span>
            )}
          </div>
          <Link to="/stats" className="btn-ghost w-full">
            詳しい成績を見る
          </Link>
        </section>
      ) : null}

      <nav aria-label="学習メニュー" className="grid grid-cols-2 gap-2">
        <Link to="/mock" className="btn-secondary">
          模擬試験
        </Link>
        <Link to="/cards" className="btn-secondary">
          暗記カード
        </Link>
        <Link to="/questions" className="btn-secondary">
          過去問一覧
        </Link>
        <Link to="/plan" className="btn-secondary">
          学習計画
        </Link>
      </nav>

      {!d.hasHistory && (
        <PageNote>
          <p>「すぐに5問解く」から始めましょう。出題対象は検証済み {d.poolSize}問（{spec.label}）です。</p>
          <p>学習記録はこの端末内（ブラウザ）に保存されます。定期的に「データ管理」からバックアップしてください。</p>
        </PageNote>
      )}
    </div>
  );
}
