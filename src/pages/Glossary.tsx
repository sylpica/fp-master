import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useContent } from '../content/store';
import { db } from '../db/db';
import { FIELD_IDS, FIELDS } from '../domain/exam';
import type { FieldId, Term } from '../domain/types';
import { useSettings } from '../state/settings';
import { PageTitle } from '../ui/Layout';
import { Empty, FieldBadge, ReviewBadge, Tex, questionLabel } from '../ui/common';
import { TermPopupProvider, TermText, toFullWidth } from '../ui/TermText';

const KANA_ROWS = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'];
const ROW_RANGES: [string, string][] = [
  ['ぁ', 'お'],
  ['か', 'ご'],
  ['さ', 'ぞ'],
  ['た', 'ど'],
  ['な', 'の'],
  ['は', 'ぽ'],
  ['ま', 'も'],
  ['ゃ', 'よ'],
  ['ら', 'ろ'],
  ['ゎ', 'ん'],
];
function kanaRow(reading: string): string {
  const c = reading[0] ?? '';
  const i = ROW_RANGES.findIndex(([a, b]) => c >= a && c <= b);
  return i >= 0 ? KANA_ROWS[i]! : '英数';
}

type Sort = 'kana' | 'field' | 'importance';

/** カタカナをひらがなにそろえる（読み検索の表記ゆれ吸収） */
function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export async function setTermState(termId: string, patch: { favorite?: boolean; learned?: boolean }) {
  const cur = await db.termState.get(termId);
  await db.termState.put({ termId, favorite: false, learned: false, ...cur, ...patch, updatedAt: new Date().toISOString() });
}

export function GlossaryPage() {
  const { terms } = useContent();
  const settings = useSettings();
  const states = useLiveQuery(() => db.termState.toArray(), []);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('kana');
  const [field, setField] = useState<FieldId | ''>('');
  const [only, setOnly] = useState<'' | 'fav' | 'unlearned'>('');
  const [imp, setImp] = useState<'' | 1 | 2 | 3>('');
  const [gradeFilter, setGradeFilter] = useState<'' | 2 | 3>('');
  const st = useMemo(() => new Map(states?.map((s) => [s.termId, s])), [states]);
  const list = useMemo(() => {
    const grade = gradeFilter || settings?.grade;
    const norm = q.trim();
    const normK = kataToHira(norm);
    return terms
      .filter((t) => !grade || t.grades.includes(grade))
      .filter((t) => !field || t.field === field)
      .filter((t) => !imp || t.importance === imp)
      .filter((t) => (only === 'fav' ? st.get(t.id)?.favorite : only === 'unlearned' ? !st.get(t.id)?.learned : true))
      .filter(
        (t) =>
          !norm ||
          [t.name, t.reading, t.short, ...(t.aliases ?? [])].some(
            (s) => s.includes(norm) || s.includes(toFullWidth(norm)) || s.toLowerCase().includes(norm.toLowerCase()) || kataToHira(s).includes(normK),
          ),
      )
      .sort((a, b) =>
        sort === 'kana'
          ? a.reading.localeCompare(b.reading, 'ja')
          : sort === 'field'
            ? a.field.localeCompare(b.field) || a.reading.localeCompare(b.reading, 'ja')
            : b.importance - a.importance || a.reading.localeCompare(b.reading, 'ja'),
      );
  }, [terms, settings, field, only, q, sort, st, imp, gradeFilter]);

  const groups = useMemo(() => {
    const m = new Map<string, Term[]>();
    for (const t of list) {
      const k = sort === 'kana' ? kanaRow(t.reading) : sort === 'field' ? FIELDS[t.field].name : `重要度 ${'★'.repeat(t.importance)}`;
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [list, sort]);

  return (
    <div className="space-y-4">
      <PageTitle sub={`${list.length}語（${settings?.grade ?? ''}級の範囲）`}>用語集</PageTitle>
      <input className="input" type="search" placeholder="用語・読み・説明で検索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="用語を検索" />
      <div className="flex flex-wrap gap-2">
        {(['kana', 'field', 'importance'] as const).map((s) => (
          <button key={s} className={`chip ${sort === s ? 'chip-on' : ''}`} onClick={() => setSort(s)} aria-pressed={sort === s}>
            {{ kana: '五十音順', field: '分野別', importance: '重要度順' }[s]}
          </button>
        ))}
        <select className="chip bg-transparent" value={field} onChange={(e) => setField(e.target.value as FieldId | '')} aria-label="分野で絞り込み">
          <option value="">全分野</option>
          {FIELD_IDS.map((f) => (
            <option key={f} value={f}>
              {FIELDS[f].short}
            </option>
          ))}
        </select>
        <select className="chip bg-transparent" value={imp} onChange={(e) => setImp(e.target.value === '' ? '' : (Number(e.target.value) as 1 | 2 | 3))} aria-label="重要度で絞り込み">
          <option value="">重要度すべて</option>
          <option value={3}>★★★のみ</option>
          <option value={2}>★★のみ</option>
          <option value={1}>★のみ</option>
        </select>
        <select className="chip bg-transparent" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value === '' ? '' : (Number(e.target.value) as 2 | 3))} aria-label="級で絞り込み">
          <option value="">級：設定に連動</option>
          <option value={2}>2級の範囲</option>
          <option value={3}>3級の範囲</option>
        </select>
        <button className={`chip ${only === 'fav' ? 'chip-on' : ''}`} onClick={() => setOnly(only === 'fav' ? '' : 'fav')}>
          ★お気に入り
        </button>
        <button className={`chip ${only === 'unlearned' ? 'chip-on' : ''}`} onClick={() => setOnly(only === 'unlearned' ? '' : 'unlearned')}>
          未学習
        </button>
      </div>
      {list.length === 0 && <Empty>該当する用語がありません。</Empty>}
      {groups.map(([g, ts]) => (
        <section key={g}>
          <h2 className="label mb-1">{g}</h2>
          {q.trim() ? (
            // 検索中は、見つかった理由が分かるよう簡潔な定義を全文で表示する
            <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {ts.map((t) => (
                <li key={t.id}>
                  <Link to={`/glossary/${t.id}`} className="block min-h-12 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.name}</span>
                      {st.get(t.id)?.favorite && <span aria-label="お気に入り">★</span>}
                      {st.get(t.id)?.learned && <span className="badge bg-emerald-100 text-emerald-800">学習済み</span>}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t.short}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            // 一覧は索引として用語名だけを並べ、スクロール量を抑える（定義は用語の画面で読む）
            <ul className="flex flex-wrap gap-2">
              {ts.map((t) => (
                <li key={t.id}>
                  <Link to={`/glossary/${t.id}`} className="chip bg-white dark:bg-slate-900">
                    {t.name}
                    {st.get(t.id)?.favorite && <span aria-label="お気に入り">★</span>}
                    {st.get(t.id)?.learned && <span aria-label="学習済み" className="text-emerald-700 dark:text-emerald-300">✓</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function TermPage() {
  const { id } = useParams();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const { termById, questions } = useContent();
  const t = termById.get(id ?? '');
  const state = useLiveQuery(() => db.termState.get(id ?? ''), [id]);
  const related = useMemo(() => {
    if (!t) return [];
    const names = [t.name.replace(/（.*?）/g, ''), ...(t.aliases ?? [])].flatMap((n) => [n, toFullWidth(n)]).filter((n) => n.length >= 2);
    return questions
      .filter((q) => q.status === 'verified' && (q.terms?.includes(t.id) || names.some((n) => q.stem.includes(n))))
      .slice(0, 10);
  }, [t, questions]);
  if (!t) return <Empty>用語が見つかりません。</Empty>;
  return (
    <TermPopupProvider>
      <article className="space-y-4">
        {from && (
          <Link to={from} className="btn-secondary w-full">
            ← 元の問題に戻る
          </Link>
        )}
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <FieldBadge field={t.field} />
            <span>{t.grades.map((g) => `${g}級`).join('・')}</span>
            <span>重要度 {'★'.repeat(t.importance)}</span>
            <ReviewBadge status={t.reviewStatus} />
          </div>
          <h1 className="text-2xl font-bold">{t.name}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t.reading}</p>
        </div>
        <p className="card text-lg leading-relaxed">{t.short}</p>
        <section className="space-y-2">
          <h2 className="label">詳しく</h2>
          <p className="leading-relaxed">
            <TermText text={t.detail} />
          </p>
          {t.example && (
            <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
              <b>例：</b>
              {t.example}
            </p>
          )}
          {t.system && <p className="text-sm">関連する制度・法令：{t.system}</p>}
          {t.formula && (
            <div>
              <h3 className="label">{t.formula.name}</h3>
              <Tex tex={t.formula.tex} block />
            </div>
          )}
        </section>
        {t.facts && t.facts.length > 0 && (
          <section>
            <h2 className="label mb-1">重要な数字・適用条件</h2>
            <ul className="card list-disc space-y-1 py-3 pl-9 pr-4 text-sm leading-relaxed">
              {t.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>
        )}
        {t.cautions && t.cautions.length > 0 && (
          <section>
            <h2 className="label mb-1">例外・注意点</h2>
            <ul className="card list-disc space-y-1 py-3 pl-9 pr-4 text-sm leading-relaxed">
              {t.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}
        {t.compare && t.compare.length > 0 && (
          <section>
            <h2 className="label mb-1">類似用語との違い</h2>
            <ul className="card list-disc space-y-1 py-3 pl-9 pr-4 text-sm leading-relaxed">
              {t.compare.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex gap-2">
          <button className={`chip ${state?.favorite ? 'chip-on' : ''}`} onClick={() => setTermState(t.id, { favorite: !state?.favorite })} aria-pressed={!!state?.favorite}>
            ★ お気に入り
          </button>
          <button className={`chip ${state?.learned ? 'chip-on' : ''}`} onClick={() => setTermState(t.id, { learned: !state?.learned })} aria-pressed={!!state?.learned}>
            ✓ 学習済み
          </button>
          <Link className="chip" to={`/cards/run?term=${t.id}`}>
            暗記カード
          </Link>
        </div>
        {t.related.length > 0 && (
          <section>
            <h2 className="label mb-2">関連用語</h2>
            <div className="flex flex-wrap gap-2">
              {t.related.map((r) => (
                <Link key={r} className="chip" to={`/glossary/${r}`}>
                  {termById.get(r)?.name ?? r}
                </Link>
              ))}
            </div>
          </section>
        )}
        {related.length > 0 && (
          <section>
            <h2 className="label mb-2">関連する問題</h2>
            <ul className="card divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {related.map((q) => (
                <li key={q.id}>
                  <Link to={`/q/${q.id}`} className="block px-4 py-3 text-sm">
                    {questionLabel(q)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="text-xs text-slate-600 dark:text-slate-400">
          <h2 className="font-semibold">根拠資料（確認日 {t.checkedAt}{t.lawBaseDate ? `・法令基準日 ${t.lawBaseDate}` : ''}）</h2>
          <ul>
            {t.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          {t.reviewStatus === 'draft' && <p className="mt-1">この用語の説明は、根拠資料の引用照合が完了していません。学習の参考にとどめ、出典で確認してください。</p>}
        </section>
      </article>
    </TermPopupProvider>
  );
}
