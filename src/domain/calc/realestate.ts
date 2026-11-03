import { Frac } from '../decimal';
import { createRng, pick, randInt } from '../random';
import type { CalcGenerator, CalcProblem } from './types';

const fmt = (n: number) => n.toLocaleString('ja-JP');

export const buildingCoverageGenerator: CalcGenerator = {
  id: 'building-coverage',
  title: '建ぺい率（建築面積の上限）',
  field: 'E',
  grades: [2, 3],
  sources: [{ title: 'e-Gov法令検索 建築基準法 第53条', url: 'https://laws.e-gov.go.jp/law/325AC0000000201' }],
  basis: '建築基準法53条（角地・防火地域内の耐火建築物等の緩和）',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const area = randInt(rng, 10, 50) * 10;
    const ratio = pick(rng, [40, 50, 60]);
    const corner = difficulty >= 2 && rng() < 0.6;
    const fireproof = difficulty === 3 && rng() < 0.6;
    const effective = ratio + (corner ? 10 : 0) + (fireproof ? 10 : 0);
    const ans = Frac.of(area).mul(effective).div(100).round(2).toNumber();
    const notes = [corner ? '特定行政庁が指定する角地にある' : '', fireproof ? '防火地域内にあり、耐火建築物を建築する' : ''].filter(Boolean);
    return {
      id: `building-coverage:${difficulty}:${seed}`,
      generatorId: 'building-coverage',
      pattern: corner || fireproof ? '建ぺい率の緩和' : '建築面積の上限',
      prompt: `敷地面積${area}㎡、指定建ぺい率${ratio}％の土地${notes.length ? `（${notes.join('。')}）` : ''}に建築できる建築物の建築面積の最高限度は何㎡か。その他の緩和・制限は考慮しない。`,
      given: [
        { label: '敷地面積', value: `${area}㎡` },
        { label: '指定建ぺい率', value: `${ratio}％` },
        ...(corner ? [{ label: '角地', value: '特定行政庁指定の角地' }] : []),
        ...(fireproof ? [{ label: '防火規制', value: '防火地域内・耐火建築物' }] : []),
      ],
      answer: ans,
      unit: '㎡',
      steps: [
        ...(corner ? [{ text: '特定行政庁が指定する角地は建ぺい率に10％加算。' }] : []),
        ...(fireproof ? [{ text: '建ぺい率80％以外の防火地域内の耐火建築物等は建ぺい率に10％加算。' }] : []),
        { text: '建築面積の最高限度', tex: `${area} \\times ${effective}\\% = ${ans}` },
      ],
      formulas: [{ name: '建築面積の上限', tex: '\\text{敷地面積} \\times \\text{建ぺい率}', explain: '指定建ぺい率80％の地域内で防火地域内の耐火建築物等は建ぺい率の制限がない（本問では対象外）。' }],
      relatedTerms: ['kenpeiritsu'],
    };
  },
};

export const floorAreaRatioGenerator: CalcGenerator = {
  id: 'floor-area-ratio',
  title: '容積率（延べ面積の上限）',
  field: 'E',
  grades: [2, 3],
  sources: [{ title: 'e-Gov法令検索 建築基準法 第52条', url: 'https://laws.e-gov.go.jp/law/325AC0000000201' }],
  basis: '建築基準法52条（前面道路幅員12m未満の場合の容積率制限）',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const area = randInt(rng, 10, 50) * 10;
    const residential = rng() < 0.6;
    // 指定容積率は用途地域ごとに都市計画で定められる値（建築基準法52条1項）から選ぶ。
    // 第一種住居地域・近隣商業地域はいずれも 10/10〜50/10（600％は商業地域などの値で、近隣商業地域にはない）
    const designated = pick(rng, residential ? [100, 150, 200, 300] : [200, 300, 400, 500]);
    const roads = difficulty === 1 ? [randInt(rng, 4, 12)] : [randInt(rng, 4, 8), randInt(rng, 4, 8)];
    const road = Math.max(...roads);
    const mult = residential ? 4 : 6;
    const roadRatio = road < 12 ? road * mult * 10 : Infinity;
    const effective = Math.min(designated, roadRatio);
    const ans = Frac.of(area).mul(effective).div(100).round(2).toNumber();
    const zone = residential ? '第一種住居地域' : '近隣商業地域';
    return {
      id: `floor-area-ratio:${difficulty}:${seed}`,
      generatorId: 'floor-area-ratio',
      pattern: roads.length > 1 ? '2つの道路に接する土地の容積率' : '前面道路による容積率制限',
      prompt: `${zone}内の敷地面積${area}㎡の土地（指定容積率${designated}％）が、幅員${roads.map((r) => `${r}m`).join('と幅員')}の道路に接している。建築物の延べ面積の最高限度は何㎡か。特定行政庁の指定はなく、その他の制限は考慮しない。`,
      given: [
        { label: '用途地域', value: zone },
        { label: '敷地面積', value: `${area}㎡` },
        { label: '指定容積率', value: `${designated}％` },
        { label: '前面道路', value: roads.map((r) => `${r}m`).join('、') },
        { label: '法定乗数', value: `${residential ? '住居系 4/10' : '住居系以外 6/10'}` },
      ],
      answer: ans,
      unit: '㎡',
      steps: [
        ...(roads.length > 1 ? [{ text: `前面道路が2つ以上ある場合は、幅員の最も広い道路（${road}m）を基準にする。` }] : []),
        road < 12
          ? { text: '前面道路の幅員が12m未満なので、幅員×法定乗数と指定容積率の小さい方を使う。', tex: `${road} \\times \\frac{${mult}}{10} = ${road * mult * 10}\\%\\;\\text{と}\\;${designated}\\%\\;\\to\\;${effective}\\%` }
          : { text: '前面道路の幅員が12m以上なので指定容積率を使う。' },
        { text: '延べ面積の最高限度', tex: `${area} \\times ${effective}\\% = ${ans}` },
      ],
      formulas: [{ name: '延べ面積の上限', tex: '\\text{敷地面積} \\times \\min(\\text{指定容積率},\\ \\text{前面道路幅員} \\times \\text{法定乗数})', explain: '前面道路幅員が12m未満の場合。法定乗数は原則、住居系4/10、その他6/10。' }],
      relatedTerms: ['yosekiritsu'],
    };
  },
};

export const capitalGainGenerator: CalcGenerator = {
  id: 'real-estate-gain',
  title: '不動産の譲渡所得',
  field: 'E',
  grades: [2, 3],
  sources: [
    { title: '国税庁 タックスアンサー No.3302 マイホームを売ったときの特例', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3302.htm' },
    { title: '国税庁 タックスアンサー No.3258 取得費が分からないとき', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/joto/3258.htm' },
  ],
  basis: '譲渡所得＝譲渡価額−（取得費＋譲渡費用）−特別控除。概算取得費は譲渡価額の5％',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const price = randInt(rng, 30, 150) * 1_000_000;
    const unknownCost = difficulty >= 2 && rng() < 0.5;
    // 実際の取得費は概算取得費（5％）を上回る値にして、どちらを使うかの曖昧さをなくす
    const minCost = Math.floor((price * 0.05) / 1_000_000) + 1;
    const actualCost = unknownCost ? 0 : randInt(rng, minCost, Math.floor(price / 2_000_000)) * 1_000_000;
    const cost = unknownCost ? Frac.of(price).mul(Frac.of('0.05')).round(0, 'floor').toNumber() : actualCost;
    const expense = randInt(rng, 1, 30) * 100_000;
    const home = difficulty >= 2 ? rng() < 0.6 : false;
    const gross = price - cost - expense;
    const ans = Math.max(0, gross - (home ? 30_000_000 : 0));
    return {
      id: `real-estate-gain:${difficulty}:${seed}`,
      generatorId: 'real-estate-gain',
      pattern: home ? '居住用財産の3,000万円特別控除' : unknownCost ? '概算取得費' : '譲渡所得の金額',
      prompt: `土地建物を${fmt(price)}円で譲渡した。取得費は${unknownCost ? '不明' : `${fmt(actualCost)}円（減価償却考慮後）`}、譲渡費用は${fmt(expense)}円である。${home ? '居住用財産を譲渡した場合の3,000万円の特別控除の適用を受ける。' : '特別控除の適用はない。'}課税譲渡所得金額はいくらか。`,
      given: [
        { label: '譲渡価額', value: `${fmt(price)}円` },
        { label: '取得費', value: unknownCost ? '不明（概算取得費を用いる）' : `${fmt(actualCost)}円` },
        { label: '譲渡費用', value: `${fmt(expense)}円` },
        { label: '特別控除', value: home ? '3,000万円' : 'なし' },
      ],
      answer: ans,
      unit: '円',
      steps: [
        ...(unknownCost ? [{ text: '取得費が不明な場合は概算取得費（譲渡価額の5％）を用いる。', tex: `${fmt(price)} \\times 5\\% = ${fmt(cost)}` }] : []),
        { text: '譲渡所得（特別控除前）', tex: `${fmt(price)} - (${fmt(cost)} + ${fmt(expense)}) = ${fmt(gross)}` },
        ...(home ? [{ text: '3,000万円を控除（控除後がマイナスなら0）', tex: `${fmt(gross)} - 30{,}000{,}000 = ${fmt(ans)}` }] : []),
      ],
      formulas: [{ name: '課税譲渡所得金額', tex: '\\text{譲渡価額} - (\\text{取得費} + \\text{譲渡費用}) - \\text{特別控除}', explain: '取得費が不明な場合や実際の取得費が譲渡価額の5％未満の場合は概算取得費（5％）を使える。' }],
      relatedTerms: ['gaisan-shutokuhi', 'kyojuyo-3000man'],
    };
  },
};
