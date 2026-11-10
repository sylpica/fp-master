import { setSetting, useSettings, type ExplanationMode, type Settings } from '../state/settings';
import { PageTitle, Segmented } from '../ui/Layout';

export function SettingsPage() {
  const s = useSettings();
  if (!s) return <p role="status">読み込み中…</p>;
  const Row = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <div>
        <div className="font-medium">{title}</div>
        {desc && <div className="text-xs text-slate-600 dark:text-slate-400">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <PageTitle>設定</PageTitle>
      <section className="card">
        <Row title="級">
          <Segmented label="級" value={String(s.grade)} options={[{ value: '3', label: '3級' }, { value: '2', label: '2級' }]} onChange={(v) => setSetting('grade', Number(v) as 2 | 3)} />
        </Row>
        <Row title="科目">
          <Segmented label="科目" value={s.subject} options={[{ value: 'gakka', label: '学科' }, { value: 'jitsugi', label: '実技' }]} onChange={(v) => setSetting('subject', v as Settings['subject'])} />
        </Row>
        <Row title="通常演習にも計算問題を含める" desc="初期設定はOFF。模擬試験はこの設定に関係なく本試験どおり計算問題を含みます。">
          <input
            type="checkbox"
            className="h-6 w-6 accent-brand-700"
            checked={s.includeCalcInPractice}
            aria-label="通常演習にも計算問題を含める"
            onChange={async (e) => {
              await setSetting('includeCalcInPractice', e.target.checked);
              if (s.lastPractice) await setSetting('lastPractice', { ...s.lastPractice, includeCalc: e.target.checked });
            }}
          />
        </Row>
        <Row title="単語帳の表裏を逆にする" desc="暗記カードを、答え（裏）から表示して用語・問いを思い出す出し方にします。単語帳の画面からも切り替えられます。">
          <input
            type="checkbox"
            className="h-6 w-6 accent-brand-700"
            checked={s.cardsReversed}
            aria-label="単語帳の表裏を逆にする"
            onChange={(e) => void setSetting('cardsReversed', e.target.checked)}
          />
        </Row>
        <Row title="解説の表示" desc="解答後に最初に表示する詳しさ">
          <Segmented
            label="解説の表示"
            value={s.explanationMode}
            options={[{ value: 'short', label: '簡潔' }, { value: 'standard', label: '標準' }, { value: 'detail', label: '詳細' }]}
            onChange={(v) => setSetting('explanationMode', v as ExplanationMode)}
          />
        </Row>
        <Row title="画面の明るさ">
          <Segmented
            label="画面の明るさ"
            value={s.theme}
            options={[{ value: 'system', label: '自動' }, { value: 'light', label: 'ライト' }, { value: 'dark', label: 'ダーク' }]}
            onChange={(v) => setSetting('theme', v as Settings['theme'])}
          />
        </Row>
        <Row title="1日の目標問題数">
          <input
            className="input w-24 text-right"
            inputMode="numeric"
            aria-label="1日の目標問題数"
            defaultValue={s.dailyGoal}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n > 0 && n <= 500) void setSetting('dailyGoal', n);
            }}
          />
        </Row>
        <Row title="受験予定日" desc="ホームの残り日数と法令基準日の判定に使います">
          <input type="date" className="input" value={s.examDate ?? ''} aria-label="受験予定日" onChange={(e) => setSetting('examDate', e.target.value || null)} />
        </Row>
      </section>
    </div>
  );
}
