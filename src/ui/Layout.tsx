import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, type ReactNode } from 'react';
import { setSetting, useSettings } from '../state/settings';
import { EXAM_SPECS, examKeyOf } from '../domain/exam';
import { UpdatePrompt } from './UpdatePrompt';

const NAV = [
  { to: '/', label: 'ホーム', icon: '⌂' },
  { to: '/practice', label: '演習', icon: '✎' },
  { to: '/cards', label: '単語帳', icon: '単' },
  { to: '/calc', label: '計算', icon: '∑' },
  { to: '/glossary', label: '用語', icon: '辞' },
  { to: '/menu', label: 'メニュー', icon: '≡' },
];

/** 演習中など、ナビゲーションを隠して集中させる画面 */
const FOCUS_PREFIXES = ['/session/', '/mock/run/', '/calc/run/', '/cards/run'];

export function Layout() {
  const settings = useSettings();
  const loc = useLocation();
  const focus = FOCUS_PREFIXES.some((p) => loc.pathname.startsWith(p));

  useEffect(() => {
    if (!settings) return;
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {!focus && settings && (
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex h-12 items-center justify-between gap-2">
            <NavLink to="/" className="text-lg font-bold text-brand-700 dark:text-brand-200">
              FP Master
            </NavLink>
            <div className="flex items-center gap-1" role="group" aria-label="級と科目の切り替え">
              <Segmented
                label="級"
                value={String(settings.grade)}
                options={[
                  { value: '3', label: '3級' },
                  { value: '2', label: '2級' },
                ]}
                onChange={(v) => setSetting('grade', Number(v) as 2 | 3)}
              />
              <Segmented
                label="科目"
                value={settings.subject}
                options={[
                  { value: 'gakka', label: '学科' },
                  { value: 'jitsugi', label: '実技' },
                ]}
                onChange={(v) => setSetting('subject', v as 'gakka' | 'jitsugi')}
              />
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {EXAM_SPECS[examKeyOf(settings.grade, settings.subject)].label}を選択中
          </p>
        </header>
      )}
      <main className={`flex-1 px-4 ${focus ? 'pt-[env(safe-area-inset-top)]' : 'pb-24 pt-4'}`}>
        <Outlet />
      </main>
      {!focus && (
        <nav
          aria-label="メインメニュー"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        >
          <ul className="mx-auto grid max-w-2xl grid-cols-6">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    `flex min-h-14 flex-col items-center justify-center text-xs ${isActive ? 'font-bold text-brand-700 dark:text-brand-200' : 'text-slate-600 dark:text-slate-400'}`
                  }
                >
                  <span aria-hidden className="text-lg leading-none">
                    {n.icon}
                  </span>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <UpdatePrompt bottom={!focus} />
    </div>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 min-w-11 rounded-md px-2 text-sm font-semibold ${value === o.value ? 'bg-white text-brand-700 shadow-sm dark:bg-slate-950 dark:text-brand-200' : 'text-slate-600 dark:text-slate-400'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 画面の見出し。sub には件数・対象など「いま見ている内容」を表す短い情報だけを置く。
 * 機能の説明や注意書きは本題の操作を押し下げないよう、画面の下の PageNote に置く（UIルール3）。
 */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="text-xl font-bold">{children}</h1>
      {sub && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

/** 画面下部に置く説明・注意書き・出典（UIルール3：説明文は上部に置かない） */
export function PageNote({ children }: { children: ReactNode }) {
  return <div className="space-y-1 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">{children}</div>;
}
