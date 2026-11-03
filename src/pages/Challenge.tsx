import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { CHALLENGE_MIN_FIRST, CHALLENGE_TARGET, challengeStats } from '../domain/challenge';
import { FIELD_IDS, FIELDS } from '../domain/exam';
import type { PracticeConfig } from '../domain/selection';
import type { FieldId } from '../domain/types';
import { startPractice } from '../state/sessions';
import { useExamKey } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { Empty, Stat, pct } from '../ui/common';

const COUNTS = [20, 50, 100];

interface Mode {
  id: string;
  title: string;
  sub: string;
  cfg: Partial<PracticeConfig>;
}

const MODES: Mode[] = [
  { id: 'hard', title: '高難度を優先（Lv4以上）', sub: '難易度の高い問題から出題します', cfg: { focus: 'hard', levels: [4, 5] } },
  { id: 'top', title: '最難関のみ（Lv5）', sub: '複数論点・例外・特例の判断が必要な問題', cfg: { levels: [5] } },
  { id: 'unseen', title: '初見の問題を優先', sub: 'まだ解いていない問題だけ（初見の対応力を測る）', cfg: { filter: 'unanswered' } },
  { id: 'unmastered', title: '未習得の論点を優先', sub: '最後の解答が正解の問題が少ない論点から', cfg: { focus: 'unmastered' } },
  { id: 'weak', title: '苦手問題を優先', sub: '苦手分野・直近の誤答から', cfg: { filter: 'weak' } },
  { id: 'all', title: '全分野を横断', sub: '難易度を問わずランダムに', cfg: {} },
];

/**
 * 95%チャレンジ（2級学科専用）。
 * 初見正答率を主指標にする：同じ問題を繰り返して上がった正答率を、初見の問題への対応力と混同しない。
 */
export function ChallengePage() {
  const exam = useExamKey();
  const { questions } = useContent();
  const nav = useNavigate();
  const [count, setCount] = useState(20);
  const [fields, setFields] = useState<FieldId[]>([]);
  const [includeCalc, setIncludeCalc] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pool = useMemo(() => questions.filter((q) => q.exam === 'g2' && q.status === 'verified'), [questions]);
  const attempts = useLiveQuery(() => db.attempts.where('itemKind').equals('question').toArray(), []);
  const stats = useMemo(() => (attempts ? challengeStats(pool, attempts) : null), [pool, attempts]);

  if (!exam) return <p role="status">読み込み中…</p>;
  if (exam !== 'g2') {
    return (
      <div className="space-y-4">
        <PageTitle>95%チャレンジ</PageTitle>
        <Empty>95%チャレンジは2級学科専用です。設定で「2級」「学科」に切り替えてください。</Empty>
      </div>
    );
  }
  const leveled = pool.filter((q) => q.level !== undefined);
  const start = async (m: Mode) => {
    const cfg: PracticeConfig = {
      exams: ['g2'],
      count,
      filter: 'all',
      includeCalc,
      order: 'random',
      fields: fields.length ? fields : undefined,
      ...m.cfg,
    };
    const r = await startPractice(questions, cfg, `95%チャレンジ：${m.title}`, false);
    if (r.sessionId) nav(`/session/${r.sessionId}`);
    else setMessage('条件に合う問題がありません。分野や問題数、計算問題の設定を変えてください。');
  };
  const toggle = (f: FieldId) => setFields(fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f]);

  return (
    <div className="space-y-5">
      <PageTitle sub={`2級学科／検証済み ${pool.length}問（うち難易度つき ${leveled.length}問）`}>95%チャレンジ</PageTitle>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        正答率95%は学習の目標です。本試験での得点や合格を保証するものではありません。初見の問題への正答率を主な指標にします。
      </p>
      {message && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {message}
        </p>
      )}

      <section aria-labelledby="ch-stats" className="card space-y-3">
        <h2 id="ch-stats" className="font-bold">
          あなたの正答率
        </h2>
        {!stats || stats.all.attempts === 0 ? (
          <p className="text-sm text-slate-700 dark:text-slate-300">まだ記録がありません。下のモードで解くと、ここに分析が表示されます。</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="初見の正答率" value={pct(stats.first.rate)} sub={`${stats.first.correct}/${stats.first.attempts}問`} />
              <Stat label="復習の正答率" value={pct(stats.review.rate)} sub={`${stats.review.correct}/${stats.review.attempts}回`} />
              <Stat label="累計の正答率" value={pct(stats.all.rate)} sub={`${stats.all.correct}/${stats.all.attempts}回`} />
              <Stat
                label={`${Math.round(CHALLENGE_TARGET * 100)}%との差（初見）`}
                value={stats.gapPoints === null ? '—' : stats.gapPoints > 0 ? `あと${stats.gapPoints}pt` : stats.reliable ? '達成' : '到達中'}
                sub={stats.gapPoints !== null && !stats.reliable ? `判定は初見${CHALLENGE_MIN_FIRST}問から` : undefined}
              />
              <Stat label="高難度（Lv4以上）初見" value={pct(stats.hardFirst.rate)} sub={`${stats.hardFirst.correct}/${stats.hardFirst.attempts}問`} />
              <Stat label="最難関（Lv5）初見" value={pct(stats.topFirst.rate)} sub={`${stats.topFirst.correct}/${stats.topFirst.attempts}問`} />
            </div>
            <div>
              <h3 className="label mb-1">分野別の初見正答率</h3>
              <ul className="grid grid-cols-2 gap-x-4 text-sm">
                {FIELD_IDS.map((f) => (
                  <li key={f} className="flex justify-between">
                    <span>{FIELDS[f].short}</span>
                    <span className="tabular-nums">{pct(stats.firstByField[f].rate)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {stats.weakTopics.length > 0 && (
              <div>
                <h3 className="label mb-1">未習得の論点（習得度の低い順）</h3>
                <ul className="space-y-1 text-sm">
                  {stats.weakTopics.slice(0, 5).map((t) => (
                    <li key={t.key} className="flex justify-between gap-2">
                      <span>
                        {t.label}
                        <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">{t.key}</span>
                      </span>
                      <span className="tabular-nums">
                        {t.mastered}/{t.total}習得
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="ch-count">
        <h2 id="ch-count" className="label mb-2">
          問題数
        </h2>
        <div className="flex gap-2">
          {COUNTS.map((n) => (
            <button key={n} className={`chip ${count === n ? 'chip-on' : ''}`} onClick={() => setCount(n)} aria-pressed={count === n}>
              {n}問
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="ch-field">
        <h2 id="ch-field" className="label mb-2">
          分野（未選択は全分野）
        </h2>
        <div className="flex flex-wrap gap-2">
          {FIELD_IDS.map((f) => (
            <button key={f} className={`chip ${fields.includes(f) ? 'chip-on' : ''}`} onClick={() => toggle(f)} aria-pressed={fields.includes(f)}>
              {FIELDS[f].short}
            </button>
          ))}
        </div>
        <label className="mt-3 flex min-h-12 items-center justify-between gap-3">
          <span>計算問題も含める</span>
          <input type="checkbox" className="h-6 w-6 accent-brand-700" checked={includeCalc} onChange={(e) => setIncludeCalc(e.target.checked)} />
        </label>
      </section>

      <section aria-labelledby="ch-modes" className="space-y-2">
        <h2 id="ch-modes" className="label">
          モードを選んで開始
        </h2>
        {MODES.map((m) => (
          <button key={m.id} className="btn-secondary w-full flex-col items-start gap-0 py-3 text-left" onClick={() => start(m)}>
            <span className="font-semibold">{m.title}</span>
            <span className="text-sm font-normal text-slate-700 dark:text-slate-300">{m.sub}</span>
          </button>
        ))}
      </section>
    </div>
  );
}
