#!/usr/bin/env python3
"""オリジナル問題の引用が出典ページ本文に実在するかを、バッチ単位で素早く確認する（ページはディスクにキャッシュ）。
  python3 -I scripts/original/check_batch.py [バッチID ...]   # 省略時は全バッチ
"""
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'content'))
from fporig.core import all_batches, source  # noqa: E402
from build_content import fetch, page_text  # noqa: E402

CACHE = HERE / '.cache'
CACHE.mkdir(exist_ok=True)


def text_of(url: str) -> str | None:
    f = CACHE / (hashlib.sha1(url.encode()).hexdigest() + '.txt')
    if f.exists():
        return f.read_text(encoding='utf-8')
    raw = fetch(url)
    if raw is None:
        return None
    t = page_text(raw)
    f.write_text(t, encoding='utf-8')
    return t


def main() -> int:
    want = set(sys.argv[1:])
    bad = 0
    n = 0
    for b in all_batches():
        if want and b.id not in want:
            continue
        for qid, k, qt in b.evidence_items():
            n += 1
            t = text_of(source(k)['url'])
            if t is None:
                print(f'取得失敗 {qid} {source(k)["url"]}')
                bad += 1
            elif re.sub(r'\s+', '', qt) not in t:
                print(f'引用なし {qid} [{k}] {qt[:50]}…')
                bad += 1
    print(f'引用 {n} 件中 不一致 {bad} 件')
    for b in all_batches():
        if want and b.id not in want:
            continue
        warn_length_cue(b)
    return 1 if bad else 0


def warn_length_cue(b) -> None:
    """選択肢の長さが正答の手掛かりにならないかを確認する（外部監査 EXT-H01）。
    「最も適切」問題で正答肢だけが一番長い、「最も不適切」問題で正答肢だけが一番短い、という偏りがあると、
    知識がなくても長さで正答を選べてしまい、正答率が実力を表さなくなる。引用照合とは別の警告として表示する。"""
    if not hasattr(b, 'placed'):
        return  # 実技ケース・四択以外（cases.py）は対象外
    cue = total = 0
    hits = []
    for q, ch, pos in b.placed():
        lens = [len(c.text) for c in ch]
        a = lens[pos - 1]
        target = max(lens) if q.ask == 'right' else min(lens)
        total += 1
        if a == target and lens.count(target) == 1:
            cue += 1
            hits.append(q.id)
    # 4肢がランダムなら「正答だけが最長（最短）」は約25%。40%を超えたら書き直しを検討する
    if total and cue / total > 0.4:
        print(f'警告 {b.id}: 正答肢だけが最長（適切問題）／最短（不適切問題）の問題が {cue}/{total} 問（{cue / total:.0%}）。'
              f'選択肢の長さをそろえること：{", ".join(hits)}')


if __name__ == '__main__':
    raise SystemExit(main())
