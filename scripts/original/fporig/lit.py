"""金融リテラシー検定オリジナル問題の作成フレームワーク。

- 問題は Python の原稿（バッチ）として書く。正誤問題は TF()、三答択一は MC()。
- 全問題に「正答の根拠となる一次情報の逐語引用」を必ず付ける。build_content.py が出典ページ本文と照合し、
  一つでも見つからない問題は解説が「要確認」になり、データ検証テストが失敗する（＝検証済みとして公開されない）。
- 三択の正答位置はバッチごとに均等になるよう決定的に割り当てる（公開後は動かさない）。
- 出題範囲は scripts/original/syllabus_lit.json（公式5分野に基づく独自シラバス）。
"""
from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass, field as dc_field
from pathlib import Path

from .core import C, Choice, ev, register_sources, source  # noqa: F401

HERE = Path(__file__).resolve().parent
ORIG = HERE.parent
SYLLABUS = json.loads((ORIG / 'syllabus_lit.json').read_text(encoding='utf-8'))
TOPICS = {i['key']: i for i in SYLLABUS['items']}
BASE_DATE = '2026-04-01'
CHECKED = '2026-11-25'
AUTHOR = 'FP Master（金融リテラシー検定の出題範囲に基づくオリジナル問題）'


@dataclass
class LQ:
    id: str
    kind: str  # 'tf' | 'mc'
    topic: str
    theme: str
    level: int
    stem: str  # tf では判定対象の文、mc では問題文
    summary: str
    truth: bool = True
    note: str = ''
    ev: list = dc_field(default_factory=list)
    ask: str = 'right'
    choices: list = dc_field(default_factory=list)
    background: str = ''
    terms: list = dc_field(default_factory=list)
    calc: bool = False
    calc_reason: str = ''

    @property
    def field_(self) -> str:
        return self.topic[0]


def _validate_common(q: LQ) -> None:
    def bad(msg: str) -> None:
        raise ValueError(f'{q.id}: {msg}')

    if not re.match(r'^lit-[a-e]\d{2}-\d{2}$', q.id):
        bad('IDは lit-<バッチ>-<番号> 形式')
    if q.topic not in TOPICS:
        bad(f'未知の論点キー {q.topic}')
    if q.level not in (1, 2, 3, 4, 5):
        bad('levelは1〜5')
    if len(q.summary) < 15:
        bad('解答の要点が短い')
    for k, qt in (q.ev if q.kind == 'tf' else []):
        source(k)
        if len(qt) < 8:
            bad('引用が短すぎる')


def TF(id: str, topic: str, theme: str, level: int, statement: str, truth: bool, note: str,
       ev: list, summary: str, terms=(), calc: bool = False, calc_reason: str = '') -> LQ:
    q = LQ(id=id, kind='tf', topic=topic, theme=theme, level=level, stem=statement, summary=summary,
           truth=truth, note=note, ev=list(ev), terms=list(terms), calc=calc, calc_reason=calc_reason)
    _validate_common(q)
    if statement.endswith('か。') or not statement.endswith('。'):
        raise ValueError(f'{id}: 正誤問題の文は「。」で終わる宣言文にする')
    if not note or len(note) < 20:
        raise ValueError(f'{id}: 解説が短すぎる')
    if not ev:
        raise ValueError(f'{id}: 根拠の引用がない')
    return q


def MC(id: str, topic: str, theme: str, level: int, stem: str, ask: str, choices: list, summary: str,
       background: str = '', terms=(), calc: bool = False, calc_reason: str = '') -> LQ:
    q = LQ(id=id, kind='mc', topic=topic, theme=theme, level=level, stem=stem, summary=summary,
           ask=ask, choices=list(choices), background=background, terms=list(terms),
           calc=calc, calc_reason=calc_reason)
    _validate_common(q)

    def bad(msg: str) -> None:
        raise ValueError(f'{id}: {msg}')

    if ask not in ('right', 'wrong'):
        bad("askは 'right' か 'wrong'")
    if len(choices) != 3:
        bad('選択肢は3つ')
    want = ask == 'right'
    if sum(1 for c in choices if c.truth == want) != 1:
        bad('正答（askに合致する選択肢）がちょうど1つになっていない')
    if len({c.text for c in choices}) != 3:
        bad('選択肢の重複')
    if not stem.endswith('か。'):
        bad('問題文は「か。」で終える')
    if ask == 'right' and '適切' not in stem and '正しい' not in stem:
        bad('askがrightなのに問題文に「適切」「正しい」がない')
    if ask == 'wrong' and '不適切' not in stem and '誤っている' not in stem:
        bad('askがwrongなのに問題文に「不適切」「誤っている」がない')
    for c in choices:
        if not c.note or len(c.note) < 20:
            bad(f'選択肢解説が短すぎる: {c.text[:20]}')
        if not c.ev:
            bad(f'選択肢に根拠の引用がない: {c.text[:20]}')
        if re.search(r'[1-3１-３]\)|選択肢[1-3]|肢[1-3]', c.text):
            bad('選択肢文に他の選択肢番号への言及がある')
        for k, qt in c.ev:
            source(k)
            if len(qt) < 8:
                bad('引用が短すぎる')
    return q


def _pos_schedule3(batch_id: str, n: int) -> list[int]:
    """三択の正答位置（1〜3）を均等に割り当てる決定的スケジュール。"""
    base = [1, 2, 3]
    sched = [base[i % 3] for i in range(n)]
    random.Random('litpos:' + batch_id).shuffle(sched)
    return sched


@dataclass
class LitBatch:
    id: str
    title: str
    questions: list

    def __post_init__(self) -> None:
        ids = [q.id for q in self.questions]
        if len(set(ids)) != len(ids):
            raise ValueError(f'{self.id}: ID重複')
        for q in self.questions:
            if not q.id.startswith(f'lit-{self.id}-'):
                raise ValueError(f'{q.id}: バッチID {self.id} と不一致')

    @property
    def set_id(self) -> str:
        return f'lit_{self.id}'

    def evidence_items(self):
        for q in self.questions:
            if q.kind == 'tf':
                for k, qt in q.ev:
                    yield q.id, k, qt
            else:
                for c in q.choices:
                    for k, qt in c.ev:
                        yield q.id, k, qt

    def placed(self):
        """(問題, 並べ替え後の選択肢, 正答番号)。tf は (問題, None, None)。"""
        mcs = [q for q in self.questions if q.kind == 'mc']
        sched = _pos_schedule3(self.id, len(mcs))
        pos_of = {q.id: p for q, p in zip(mcs, sched)}
        out = []
        for q in self.questions:
            if q.kind == 'tf':
                out.append((q, None, None))
                continue
            pos = pos_of[q.id]
            want = q.ask == 'right'
            ans = next(c for c in q.choices if c.truth == want)
            others = [c for c in q.choices if c is not ans]
            rng = random.Random('litord:' + q.id)
            rng.shuffle(others)
            ordered = others[:pos - 1] + [ans] + others[pos - 1:]
            out.append((q, ordered, pos))
        return out

    def _basis(self, q) -> list:
        urls = {}
        evs = q.ev if q.kind == 'tf' else [e for c in q.choices for e in c.ev]
        for k, _ in evs:
            s = source(k)
            urls[s['url']] = s
        return [{'title': s['title'], 'url': s['url']} for s in urls.values()]

    def question_set(self) -> dict:
        qs = []
        for q, ch, pos in self.placed():
            if q.kind == 'tf':
                parts = [{'kind': 'truefalse', 'id': 'p1', 'answer': q.truth}]
            else:
                parts = [{'kind': 'choice', 'id': 'p1',
                          'choices': [{'id': str(i + 1), 'text': c.text} for i, c in enumerate(ch)],
                          'answer': str(pos)}]
            qs.append({
                'id': q.id, 'exam': 'lit', 'field': q.field_, 'theme': q.theme,
                'source': {'kind': 'original', 'author': AUTHOR, 'basis': self._basis(q)},
                'lawBaseDate': BASE_DATE, 'stem': q.stem, 'parts': parts,
                'requiresCalculation': q.calc, 'status': 'verified', 'level': q.level, 'topic': q.topic,
                **({'calcReason': q.calc_reason} if q.calc else {}),
            })
        return {'id': self.set_id, 'exam': 'lit', 'title': self.title, 'officialSet': False,
                'lawBaseDate': BASE_DATE, 'questions': qs}

    def explanations(self) -> list:
        out = []
        for q, ch, pos in self.placed():
            evs, srcs, seen = [], {}, set()
            all_ev = q.ev if q.kind == 'tf' else [e for c in q.choices for e in c.ev]
            for k, qt in all_ev:
                s = source(k)
                if (s['url'], qt) not in seen:
                    seen.add((s['url'], qt))
                    evs.append(ev(s['url'], qt))
                srcs[s['url']] = s
            if q.kind == 'tf':
                e = {
                    'status': 'draft',
                    'short': f"正解は{'○' if q.truth else '×'}。{q.summary}",
                    'whyCorrect': f"{'正しい' if q.truth else '誤り'}。{q.note}",
                    'sources': list(srcs.values()), 'evidence': evs,
                    'lawBaseDate': BASE_DATE, 'checkedAt': CHECKED,
                }
            else:
                notes = {str(i + 1): f"{'適切' if c.truth else '不適切'}。{c.note}" for i, c in enumerate(ch)}
                e = {
                    'status': 'draft', 'short': f'正解は{pos})。{q.summary}',
                    'whyCorrect': notes[str(pos)], 'choiceExplanations': notes,
                    'sources': list(srcs.values()), 'evidence': evs,
                    'lawBaseDate': BASE_DATE, 'checkedAt': CHECKED,
                }
                if q.background:
                    e['detail'] = q.background
            out.append({'id': q.id, 'terms': q.terms, 'explanation': e})
        return out


def all_lit_batches() -> list:
    import importlib
    import pkgutil

    from . import litbatches

    res = []
    for m in sorted(pkgutil.iter_modules(litbatches.__path__), key=lambda x: x.name):
        mod = importlib.import_module(f'{litbatches.__name__}.{m.name}')
        res.append(mod.BATCH)
    return res


def write_lit_question_sets(out_dir: Path) -> list:
    written = []
    for b in all_lit_batches():
        p = out_dir / f'{b.set_id}.json'
        p.write_text(json.dumps(b.question_set(), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        written.append(p.name)
    return written
