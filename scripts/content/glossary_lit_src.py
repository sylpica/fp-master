# -*- coding: utf-8 -*-
"""金融リテラシー検定モードの用語集原稿（分野別ファイルの集約）。

- glossary_lit_a.py 〜 glossary_lit_e.py が X_TERMS（新規用語）・LIT_SHARED（既存FP用語の
  lit 共有指定： {用語ID: lit分野の分野記号}）・LIT_CARDS（数字カード原稿）を公開する。
- 新規用語は grades=('lit',) で登録し、field は lit の分野記号（A〜E）で付ける。
- 既存FP用語と概念が重なる場合は重複登録せず、LIT_SHARED に ID と lit 分野を書く。
  apply_lit_shared が grades に 'lit' を加え、litField を設定する（元の field はFP用に不変）。
"""
import importlib

LIT_TERMS = []
LIT_SHARED = {}
LIT_CARDS = []

for _f in ('a', 'b', 'c', 'd', 'e'):
    _mod = importlib.import_module(f'glossary_lit_{_f}')
    LIT_TERMS.extend(_mod.X_TERMS)
    LIT_SHARED.update(_mod.LIT_SHARED)
    LIT_CARDS.extend(_mod.LIT_CARDS)


def apply_lit_shared(terms):
    """既存FP用語のうち lit でも使うものに grades='lit' と litField を付ける。"""
    by_id = {t['id']: t for t in terms}
    missing = []
    for tid, lfield in LIT_SHARED.items():
        t = by_id.get(tid)
        if t is None:
            missing.append(tid)
            continue
        if 'lit' not in t['grades']:
            t['grades'] = list(t['grades']) + ['lit']
        t['litField'] = lfield
    if missing:
        raise ValueError(f'LIT_SHARED に存在しない用語IDがあります: {missing}')
