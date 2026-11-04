import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useContent } from '../content/store';
import { EXAM_SPECS, FIELD_IDS, FIELDS } from '../domain/exam';
import { eligibleForPractice, type PracticeConfig, type PracticeFilter } from '../domain/selection';
import type { FieldId } from '../domain/types';
import { setSetting, useSettings, type Settings } from '../state/settings';
import { FILTER_LABELS, startPractice } from '../state/sessions';
import { useExamKey } from '../ui/hooks';
import { PageTitle } from '../ui/Layout';
import { Empty } from '../ui/common';

const COUNTS = [5, 10, 20, 50, 100];
const FILTERS: PracticeFilter[] = ['all', 'unanswered', 'wrong', 'weak', 'due', 'unsure', 'stale', 'bookmarked', 'later'];

export function defaultConfig(settings: Settings, exam: PracticeConfig['exams'][number]): PracticeConfig {
  const base: PracticeConfig = { exams: [exam], count: 10, filter: 'all', includeCalc: settings.includeCalcInPractice, order: 'random' };
  // 前回の条件を復元。ただし級・科目は現在の選択を優先する
  return { ...base, ...(settings.lastPractice ?? {}), exams: [exam] };
}

/** 通常演習の条件設定。「すぐに5問」は ?quick=5 で即開始 */
export function PracticePage() {
  const settings = useSettings();
  const exam = useExamKey();
  const { questions } = useContent();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [cfg, setCfg] = useState<PracticeConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (settings && exam && !cfg) setCfg(defaultConfig(settings, exam));
  }, [settings, exam, cfg]);
  useEffect(() => {
    if (cfg && exam && cfg.exams[0] !== exam) setCfg({ ...cfg, exams: [exam] });
  }, [exam, cfg]);

  const pool = useMemo(() => (cfg ? eligibleForPractice(questions, cfg) : []), [questions, cfg]);
  const themes = useMemo(() => [...new Set(pool.filter((q) => !cfg?.fields?.length || cfg.fields.includes(q.field)).map((q) => q.theme))].sort(), [pool, cfg]);
  const years = useMemo(
    () => [...new Set(pool.map((q) => (q.source.kind === 'official' ? q.source.yearMonth : '')).filter(Boolean))].sort().reverse(),
    [pool],
  );

  const quick = params.get('quick');
  const quickStarted = useRef(false);
  useEffect(() => {
    if (!quick || !settings || !exam || quickStarted.current) return;
    quickStarted.current = true;
    const c: PracticeConfig = { exams: [exam], count: Number(quick), filter: 'all', includeCalc: settings.includeCalcInPractice, order: 'random' };
    startPractice(questions, c, `すぐに${quick}問`, false).then((r) => {
      if (r.sessionId) nav(`/session/${r.sessionId}`, { replace: true });
      else setMessage('出題できる問題がありません。');
    });
  }, [quick, settings, exam, questions, nav]);

  if (!settings || !exam || !cfg) return <p role="status">読み込み中…</p>;
  if (quick && !message) return <p role="status">問題を準備中…</p>;

  const spec = EXAM_SPECS[exam];
  const start = async (c: PracticeConfig) => {
    const r = await startPractice(questions, c);
    if (r.sessionId) nav(`/session/${r.sessionId}`);
    else setMessage('条件に合う問題がありません。条件を変えてください。');
  };
  const toggle = <T,>(arr: T[] | undefined, v: T): T[] => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);

  return (
    <div className="space-y-5">
      <PageTitle sub={`${spec.label}／出題対象 ${pool.length}問${cfg.includeCalc ? '（計算問題を含む）' : '（計算問題を除く）'}`}>通常演習</PageTitle>
      {pool.length === 0 && (
        <Empty>
          {spec.subject === 'jitsugi'
            ? '実技（資産設計提案業務）の問題は現在準備中です。公式問題の取り込みと検証が完了しだい追加します。'
            : 'この区分の検証済み問題がありません。'}
        </Empty>
      )}
      {message && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {message}
        </p>
      )}

      <section aria-labelledby="count-h">
        <h2 id="count-h" className="label mb-2">
          問題数
        </h2>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((n) => (
            <button key={n} className={`chip ${cfg.count === n ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, count: n })} aria-pressed={cfg.count === n}>
              {n === 100 ? '100問ノック' : `${n}問`}
            </button>
          ))}
          <label className="flex items-center gap-1">
            <input className="input min-h-10 w-20 py-1" inputMode="numeric" placeholder="自由" value={custom} aria-label="問題数を自由に入力" onChange={(e) => {
              setCustom(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0 && n <= 500) setCfg({ ...cfg, count: n });
            }} />
            <span className="text-sm">問</span>
          </label>
        </div>
      </section>

      <section aria-labelledby="filter-h">
        <h2 id="filter-h" className="label mb-2">
          出題する問題
        </h2>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${cfg.filter === f ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, filter: f })} aria-pressed={cfg.filter === f}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="field-h">
        <h2 id="field-h" className="label mb-2">
          分野（未選択はすべて）
        </h2>
        <div className="flex flex-wrap gap-2">
          {FIELD_IDS.map((f: FieldId) => (
            <button key={f} className={`chip ${cfg.fields?.includes(f) ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, fields: toggle(cfg.fields, f), themes: [] })} aria-pressed={!!cfg.fields?.includes(f)}>
              {FIELDS[f].short}
            </button>
          ))}
        </div>
      </section>

      <details className="card">
        <summary className="min-h-10 cursor-pointer font-semibold">テーマ・年度・出題順</summary>
        <div className="mt-3 space-y-4">
          <div>
            <h3 className="label mb-2">テーマ</h3>
            <div className="flex flex-wrap gap-2">
              {themes.map((t) => (
                <button key={t} className={`chip ${cfg.themes?.includes(t) ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, themes: toggle(cfg.themes, t) })} aria-pressed={!!cfg.themes?.includes(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h3 className="label mb-2">出題年度（公表回）</h3>
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <button key={y} className={`chip ${cfg.yearMonths?.includes(y) ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, yearMonths: toggle(cfg.yearMonths, y) })} aria-pressed={!!cfg.yearMonths?.includes(y)}>
                  {y.replace('-', '年')}月
                </button>
              ))}
            </div>
          </div>
          {pool.some((q) => q.level !== undefined) && (
            <div>
              <h3 className="label mb-2">難易度（オリジナル問題のみ。未選択はすべて）</h3>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((lv) => (
                  <button key={lv} className={`chip ${cfg.levels?.includes(lv) ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, levels: toggle(cfg.levels, lv) })} aria-pressed={!!cfg.levels?.includes(lv)}>
                    Lv{lv} {['基礎', '標準', '応用', '高難度', '最難関'][lv - 1]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {pool.some((q) => q.source.kind === 'original') && (
            <div>
              <h3 className="label mb-2">出典</h3>
              <div className="flex flex-wrap gap-2">
                {([undefined, 'official', 'original'] as const).map((k) => (
                  <button key={k ?? 'all'} className={`chip ${cfg.sourceKind === k ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, sourceKind: k })} aria-pressed={cfg.sourceKind === k}>
                    {k === 'official' ? '公式過去問のみ' : k === 'original' ? 'オリジナル問題のみ' : 'すべて'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="label mb-2">出題順</h3>
            <div className="flex gap-2">
              <button className={`chip ${cfg.order === 'random' ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, order: 'random' })}>
                ランダム
              </button>
              <button className={`chip ${cfg.order === 'ordered' ? 'chip-on' : ''}`} onClick={() => setCfg({ ...cfg, order: 'ordered' })}>
                問題番号順
              </button>
            </div>
          </div>
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span>
              この演習に計算問題も含める
              <span className="block text-xs text-slate-600 dark:text-slate-400">初期設定は「含めない」。計算問題は「計算トレーニング」で練習できます。</span>
            </span>
            <input type="checkbox" className="h-6 w-6 accent-brand-700" checked={cfg.includeCalc} onChange={(e) => setCfg({ ...cfg, includeCalc: e.target.checked })} />
          </label>
        </div>
      </details>

      {/* 条件を選んだあと、スクロールせずに開始できるよう、開始ボタンは下部ナビの上に固定する（sticky はページ全体を親にする） */}
      <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-10 -mx-1 rounded-2xl bg-slate-50/95 p-1 backdrop-blur dark:bg-slate-950/95">
        <button className="btn-primary w-full" onClick={() => start(cfg)} disabled={pool.length === 0}>
          この条件で開始（{cfg.count}問）
        </button>
      </div>
      <div className="grid gap-2">
        <button
          className="btn-ghost"
          onClick={async () => {
            const name = window.prompt('お気に入りの名前', `${FILTER_LABELS[cfg.filter]} ${cfg.count}問`);
            if (name) await setSetting('presets', [...settings.presets.filter((p) => p.name !== name), { name, config: cfg }]);
          }}
        >
          この条件をお気に入りに保存
        </button>
      </div>

      {settings.presets.length > 0 && (
        <section className="card">
          <h2 className="mb-2 font-bold">お気に入りの出題設定</h2>
          <ul className="space-y-2">
            {settings.presets.map((p) => (
              <li key={p.name} className="flex items-center gap-2">
                <button className="btn-secondary flex-1 justify-start" onClick={() => start({ ...cfg, ...p.config, exams: [exam] })}>
                  {p.name}
                </button>
                <button className="min-h-12 px-3 text-sm text-slate-600 dark:text-slate-400" aria-label={`${p.name}を削除`} onClick={() => setSetting('presets', settings.presets.filter((x) => x.name !== p.name))}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
