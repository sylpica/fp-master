import { Link } from 'react-router';
import { useContent } from '../content/store';
import { FIELDS, LAW_BASE_PERIODS, LAW_BASE_SOURCE } from '../domain/exam';
import { useCurrentLawBaseDate } from '../ui/hooks';
import { PageNote, PageTitle } from '../ui/Layout';
import sourceCheck from '../content/source-check.json';

/** 法改正・制度改正情報と法令基準日 */
export function LawPage() {
  const { lawChanges, questionById } = useContent();
  const current = useCurrentLawBaseDate();
  return (
    <div className="space-y-4">
      <PageTitle>制度改正情報</PageTitle>
      <section className="card text-sm">
        <h2 className="mb-1 font-bold">法令基準日（2級・3級 CBT試験）</h2>
        <p>現在の設定に適用される法令基準日：<b>{current ?? '未公表'}</b></p>
        <ul className="mt-1 list-disc pl-5">
          {LAW_BASE_PERIODS.map((p) => (
            <li key={p.from}>
              {p.from.replace('-', '年')}月〜{p.to.replace('-', '年')}月受検：{p.lawBaseDate}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          出典：
          <a className="underline" href={LAW_BASE_SOURCE.url} target="_blank" rel="noreferrer">
            {LAW_BASE_SOURCE.title}
          </a>
          （{LAW_BASE_SOURCE.checkedAt}確認）
        </p>
      </section>
      {lawChanges.map((c) => (
        <section key={c.id} id={c.id} className="card space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{c.title}</h2>
            <span className={`badge ${c.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{c.status === 'confirmed' ? '確認済み' : '候補（未確認）'}</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            {FIELDS[c.field].name}／適用開始 {c.effective}
          </p>
          <p>{c.summary}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2">
            <dt className="text-slate-600 dark:text-slate-400">改正前</dt>
            <dd>{c.before}</dd>
            <dt className="text-slate-600 dark:text-slate-400">改正後</dt>
            <dd>{c.after}</dd>
          </dl>
          {c.affectedQuestions.length > 0 && (
            <div>
              <h3 className="label">影響を受ける収録問題</h3>
              <ul className="space-y-1">
                {c.affectedQuestions.map((a) => (
                  <li key={a.id}>
                    <Link to={`/q/${a.id}`} className="underline">
                      {questionById.get(a.id)?.source.kind === 'official' ? a.id : a.id}
                    </Link>
                    ：{a.impact === 'unchanged' ? '正答は変わらない' : a.impact === 'changed' ? '正答が変わる（出題停止）' : '影響確認中'} — {a.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-600 dark:text-slate-400">
            根拠：
            {c.sources.map((s) => (
              <a key={s.url} className="underline" href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
            ))}
            （確認日 {c.checkedAt}）
          </p>
        </section>
      ))}
      <PageNote>
        <p>公的資料で確認できた改正のみ掲載します。根拠ページの最終照合日：{(sourceCheck as { checkedAt?: string }).checkedAt ?? '—'}</p>
      </PageNote>
    </div>
  );
}
