import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent, type StudyCard } from '../content/store';
import { db } from '../db/db';
import { recordAttempt } from '../db/repo';
import { FIELD_IDS, FIELDS } from '../domain/exam';
import { createRng, newSeed, shuffle } from '../domain/random';
import { localDate, type Rating } from '../domain/srs';
import type { FieldId } from '../domain/types';
import { setSetting, useSettings } from '../state/settings';
import { PageTitle } from '../ui/Layout';
import { Empty, ReviewBadge } from '../ui/common';

type Mode = 'due' | 'weak' | 'new' | 'all';

/** カードの出題面（最初に見せる側）と解答面を返す。reversed のときは表裏を入れ替える */
export function cardSides(card: StudyCard, reversed: boolean): { prompt: string; answer: string } {
  return reversed ? { prompt: card.back, answer: card.front } : { prompt: card.front, answer: card.back };
}

export function CardsHomePage() {
  const { cards } = useContent();
  const settings = useSettings();
  const srs = useLiveQuery(() => db.srs.where('key').startsWith('c:').toArray(), []);
  const favStates = useLiveQuery(() => db.termState.toArray(), []);
  const favCount = useMemo(() => {
    const favs = new Set((favStates ?? []).filter((s) => s.favorite).map((s) => s.termId));
    return cards.filter((c) => c.termId && favs.has(c.termId) && c.grades.includes(settings?.grade ?? 3)).length;
  }, [cards, favStates, settings]);
  const [fields, setFields] = useState<FieldId[]>([]);
  const [kind, setKind] = useState<'' | 'term' | 'fact'>('');
  const nav = useNavigate();
  const grade = settings?.grade ?? 3;
  const reversed = settings?.cardsReversed ?? false;
  const mine = cards.filter((c) => c.grades.includes(grade));
  const today = localDate();
  const due = srs?.filter((s) => s.due <= today && mine.some((c) => `c:${c.id}` === s.key)).length ?? 0;
  const seen = new Set(srs?.map((s) => s.key.slice(2)));
  const start = (mode: Mode) => {
    const p = new URLSearchParams({ mode });
    if (fields.length) p.set('fields', fields.join(','));
    if (kind) p.set('kind', kind);
    nav(`/cards/run?${p}`);
  };
  return (
    <div className="space-y-4">
      <PageTitle sub={`${grade}級：${mine.length}枚（用語${mine.filter((c) => c.kind === 'term').length}・数字/公式${mine.filter((c) => c.kind === 'fact').length}）`}>単語帳</PageTitle>
      <div className="grid gap-2">
        <button className="btn-primary" onClick={() => start('due')} disabled={!due}>
          今日の復習カード（{due}枚）
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button className="btn-secondary" onClick={() => start('weak')}>
            苦手優先
          </button>
          <button className="btn-secondary" onClick={() => start('new')}>
            新しいカード（{mine.filter((c) => !seen.has(c.id)).length}）
          </button>
          <button className="btn-secondary" onClick={() => start('all')}>
            すべて
          </button>
        </div>
        <button className="btn-secondary" onClick={() => nav('/cards/run?mode=all&fav=1')} disabled={!favCount}>
          ★ お気に入り用語のカード（{favCount}枚）
        </button>
      </div>
      <section className="card space-y-3">
        <h2 className="label">分野（未選択はすべて）</h2>
        <div className="flex flex-wrap gap-2">
          {FIELD_IDS.map((f) => (
            <button key={f} className={`chip ${fields.includes(f) ? 'chip-on' : ''}`} onClick={() => setFields(fields.includes(f) ? fields.filter((x) => x !== f) : [...fields, f])} aria-pressed={fields.includes(f)}>
              {FIELDS[f].short}
            </button>
          ))}
        </div>
        <h2 className="label">種類</h2>
        <div className="flex gap-2">
          {(['', 'term', 'fact'] as const).map((k) => (
            <button key={k} className={`chip ${kind === k ? 'chip-on' : ''}`} onClick={() => setKind(k)}>
              {{ '': 'すべて', term: '用語', fact: '数字・期限・公式' }[k]}
            </button>
          ))}
        </div>
        <h2 className="label">見せ方（表裏）</h2>
        <div className="flex flex-wrap gap-2">
          <button className={`chip ${!reversed ? 'chip-on' : ''}`} onClick={() => void setSetting('cardsReversed', false)} aria-pressed={!reversed}>
            表から（用語・問い→答え）
          </button>
          <button className={`chip ${reversed ? 'chip-on' : ''}`} onClick={() => void setSetting('cardsReversed', true)} aria-pressed={reversed}>
            裏から（答え→用語・問い）
          </button>
        </div>
      </section>
      <p className="text-sm text-slate-600 dark:text-slate-400">カードをタップすると裏返ります。右にスワイプ＝覚えた、左にスワイプ＝覚えていない。</p>
    </div>
  );
}

export function CardsRunPage() {
  const { cards } = useContent();
  const settings = useSettings();
  const [params] = useSearchParams();
  const [deck, setDeck] = useState<StudyCard[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ good: 0, hard: 0, again: 0 });
  const start = useRef(Date.now());
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const [dx, setDx] = useState(0);

  useEffect(() => {
    if (!settings || deck) return;
    (async () => {
      const grade = settings.grade;
      const mode = (params.get('mode') ?? 'all') as Mode;
      const fields = params.get('fields')?.split(',') ?? [];
      const kind = params.get('kind');
      const termIds = params.get('term')?.split(',');
      let pool = cards.filter((c) => c.grades.includes(grade) && (!fields.length || fields.includes(c.field)) && (!kind || c.kind === kind));
      if (termIds) pool = cards.filter((c) => c.termId && termIds.includes(c.termId));
      if (params.get('fav')) {
        // お気に入り登録した用語のカード（用語カード＋その用語に紐づく数字・公式カード）
        const favs = new Set((await db.termState.toArray()).filter((s) => s.favorite).map((s) => s.termId));
        pool = pool.filter((c) => c.termId && favs.has(c.termId));
      }
      const srs = new Map((await db.srs.where('key').startsWith('c:').toArray()).map((s) => [s.key.slice(2), s]));
      const today = localDate();
      const rng = createRng(newSeed());
      if (mode === 'due') pool = pool.filter((c) => (srs.get(c.id)?.due ?? '9999') <= today);
      if (mode === 'new') pool = pool.filter((c) => !srs.has(c.id));
      pool = shuffle(pool, rng);
      if (mode === 'weak') pool = [...pool].sort((a, b) => (srs.get(a.id)?.ease ?? 2.5) - (srs.get(b.id)?.ease ?? 2.5) || (srs.get(b.id)?.lapses ?? 0) - (srs.get(a.id)?.lapses ?? 0));
      setDeck(pool.slice(0, 30));
    })();
  }, [settings, cards, params, deck]);

  const card = deck?.[i];
  const reversed = settings?.cardsReversed ?? false;
  const sides = card ? cardSides(card, reversed) : null;
  const rate = async (r: Rating) => {
    if (!card) return;
    await recordAttempt(
      { itemId: card.id, itemKind: 'card', field: card.field, correct: r !== 'again', unsure: r === 'hard', timeMs: Date.now() - start.current, mode: 'cards' },
      r,
    );
    setTally((t) => ({ ...t, [r === 'easy' ? 'good' : r]: t[r === 'easy' ? 'good' : r] + 1 }));
    setFlipped(false);
    setDx(0);
    setI(i + 1);
    start.current = Date.now();
  };

  // PC向けキー操作：←＝覚えていない／↓＝曖昧／→＝覚えた（ボタンと同じ評価を記録する）
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        void rate('again');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        void rate('hard');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void rate('good');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const summary = useMemo(() => tally, [tally]);
  if (!deck) return <p role="status">読み込み中…</p>;
  if (deck.length === 0)
    return (
      <div className="space-y-3 pt-4">
        <Empty>対象のカードがありません。</Empty>
        <Link to="/cards" className="btn-secondary w-full">
          戻る
        </Link>
      </div>
    );
  if (!card)
    return (
      <div className="space-y-4 pt-6 text-center">
        <h1 className="text-xl font-bold">おつかれさまでした</h1>
        <p>
          覚えた {summary.good}／曖昧 {summary.hard}／覚えていない {summary.again}
        </p>
        <Link to="/cards" className="btn-primary w-full">
          単語帳に戻る
        </Link>
        <Link to="/" className="btn-ghost w-full">
          ホームへ
        </Link>
      </div>
    );

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col gap-4 pt-3">
      <div className="flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-400">
        <Link to="/cards" className="min-h-10 px-1">
          ← 終了
        </Link>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            {i + 1} / {deck.length}
          </span>
          <button
            type="button"
            className={`chip ${reversed ? 'chip-on' : ''}`}
            aria-pressed={reversed}
            onClick={() => {
              void setSetting('cardsReversed', !reversed);
              setFlipped(false);
            }}
          >
            表裏入替
          </button>
        </div>
      </div>
      <div className="-mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden>
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(i / deck.length) * 100}%` }} />
      </div>
      <button
        type="button"
        aria-label={flipped ? `裏面：${sides?.answer}。タップで表に戻す` : `表面：${sides?.prompt}。タップで裏返す`}
        onClick={() => Math.abs(dx) < 8 && setFlipped(!flipped)}
        onPointerDown={(e) => (drag.current = { x: e.clientX, dx: 0 })}
        onPointerMove={(e) => drag.current && setDx(e.clientX - drag.current.x)}
        onPointerUp={() => {
          const d = dx;
          drag.current = null;
          if (d > 90) void rate('good');
          else if (d < -90) void rate('again');
          else setDx(0);
        }}
        style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
        className="card flex min-h-72 flex-1 touch-pan-y flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {FIELDS[card.field].short}・{card.kind === 'term' ? '用語' : '数字・公式'}
        </span>
        {!flipped ? (
          <span className={reversed ? 'text-xl font-bold leading-relaxed' : 'text-2xl font-bold leading-relaxed'}>{sides?.prompt}</span>
        ) : (
          <span className="text-lg leading-relaxed">{sides?.answer}</span>
        )}
        <span className="text-xs text-slate-400">{flipped ? '' : 'タップで答えを表示'}</span>
        {flipped && <ReviewBadge status={card.reviewStatus} />}
      </button>
      <div className="grid grid-cols-3 gap-2 pb-[env(safe-area-inset-bottom)]">
        <button className="btn border-2 border-rose-300 text-rose-700 dark:text-rose-300" onClick={() => rate('again')}>
          覚えていない
        </button>
        <button className="btn border-2 border-amber-300 text-amber-700 dark:text-amber-300" onClick={() => rate('hard')}>
          曖昧
        </button>
        <button className="btn border-2 border-emerald-300 text-emerald-700 dark:text-emerald-300" onClick={() => rate('good')}>
          覚えた
        </button>
      </div>
      <p className="-mt-2 text-center text-xs text-slate-400">キー操作：← 覚えていない／↓ 曖昧／→ 覚えた</p>
    </div>
  );
}
