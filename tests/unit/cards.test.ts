import { describe, expect, it } from 'vitest';
import { cardSides, swipeRating, SWIPE_THRESHOLD_PX } from '../../src/pages/Cards';
import type { StudyCard } from '../../src/content/store';
import { normalizeSettings } from '../../src/state/settings';

const termCard: StudyCard = {
  id: 't-fukuri',
  front: '複利',
  back: '元金と利息の合計に利息が付く計算方法',
  field: 'A',
  grades: [2, 3],
  kind: 'term',
  termId: 'fukuri',
  reviewStatus: 'verified',
};

const factCard: StudyCard = {
  id: 'f-kurisage-rate',
  front: '老齢年金の繰下げ増額率は？',
  back: '1カ月あたり0.7％（最大120月で84％）',
  field: 'A',
  grades: [2, 3],
  kind: 'fact',
  reviewStatus: 'verified',
};

describe('cardSides（単語帳の表裏）', () => {
  it('通常は表が出題面・裏が解答面', () => {
    expect(cardSides(termCard, false)).toEqual({ prompt: '複利', answer: '元金と利息の合計に利息が付く計算方法' });
    expect(cardSides(factCard, false)).toEqual({ prompt: '老齢年金の繰下げ増額率は？', answer: '1カ月あたり0.7％（最大120月で84％）' });
  });

  it('反転すると用語カード・数字カードとも表裏が入れ替わる', () => {
    expect(cardSides(termCard, true)).toEqual({ prompt: '元金と利息の合計に利息が付く計算方法', answer: '複利' });
    expect(cardSides(factCard, true)).toEqual({ prompt: '1カ月あたり0.7％（最大120月で84％）', answer: '老齢年金の繰下げ増額率は？' });
  });
});

describe('設定 cardsReversed', () => {
  it('保存された true が読み込まれ、未保存なら初期値 false', () => {
    expect(normalizeSettings([{ key: 'cardsReversed', value: true }]).cardsReversed).toBe(true);
    expect(normalizeSettings([]).cardsReversed).toBe(false);
  });

  it('不正な値は初期値 false に補正される（画面が壊れない）', () => {
    expect(normalizeSettings([{ key: 'cardsReversed', value: 'yes' }]).cardsReversed).toBe(false);
  });
});

describe('swipeRating（単語帳のスワイプ判定）', () => {
  it('右へしきい値以上で「覚えた」、左へしきい値以上で「覚えていない」', () => {
    expect(swipeRating(SWIPE_THRESHOLD_PX)).toBe('good');
    expect(swipeRating(200)).toBe('good');
    expect(swipeRating(-SWIPE_THRESHOLD_PX)).toBe('again');
    expect(swipeRating(-200)).toBe('again');
  });

  it('しきい値未満の移動では評価しない（タップや短いドラッグを誤判定しない）', () => {
    expect(swipeRating(0)).toBeNull();
    expect(swipeRating(SWIPE_THRESHOLD_PX - 1)).toBeNull();
    expect(swipeRating(-(SWIPE_THRESHOLD_PX - 1))).toBeNull();
  });
});
