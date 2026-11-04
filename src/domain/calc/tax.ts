import { Frac } from '../decimal';
import { createRng, pick, randInt } from '../random';
import type { CalcGenerator, CalcProblem } from './types';

const fmt = (n: number) => n.toLocaleString('ja-JP');

/** 所得税の速算表（平成27年分以後）。国税庁タックスアンサー No.2260 */
export const INCOME_TAX_TABLE: { upTo: number; rate: string; deduction: number }[] = [
  { upTo: 1_949_000, rate: '5', deduction: 0 },
  { upTo: 3_299_000, rate: '10', deduction: 97_500 },
  { upTo: 6_949_000, rate: '20', deduction: 427_500 },
  { upTo: 8_999_000, rate: '23', deduction: 636_000 },
  { upTo: 17_999_000, rate: '33', deduction: 1_536_000 },
  { upTo: 39_999_000, rate: '40', deduction: 2_796_000 },
  { upTo: Infinity, rate: '45', deduction: 4_796_000 },
];

/** 課税される所得金額（1,000円未満切捨て後）に対する所得税額（復興特別所得税を除く） */
export function incomeTax(taxable: number): number {
  const t = Math.floor(taxable / 1000) * 1000;
  const row = INCOME_TAX_TABLE.find((r) => t <= r.upTo)!;
  return Frac.of(t).mul(Frac.of(row.rate).div(100)).sub(row.deduction).max(0).round(0, 'floor').toNumber();
}

export const incomeTaxGenerator: CalcGenerator = {
  id: 'income-tax',
  title: '所得税額（速算表）',
  field: 'D',
  grades: [2, 3],
  sources: [{ title: '国税庁 タックスアンサー No.2260 所得税の税率', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm' }],
  basis: '所得税の速算表（平成27年分以後）。復興特別所得税は考慮しない',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const max = difficulty === 1 ? 6_949_000 : difficulty === 2 ? 17_999_000 : 50_000_000;
    const taxable = randInt(rng, 100, Math.floor(max / 1000)) * 1000;
    const row = INCOME_TAX_TABLE.find((r) => taxable <= r.upTo)!;
    const ans = incomeTax(taxable);
    return {
      id: `income-tax:${difficulty}:${seed}`,
      generatorId: 'income-tax',
      pattern: '速算表による所得税額',
      prompt: `課税総所得金額が${fmt(taxable)}円である場合の所得税額はいくらか。復興特別所得税・税額控除は考慮しない。`,
      given: [
        { label: '課税総所得金額', value: `${fmt(taxable)}円` },
        ...INCOME_TAX_TABLE.map((r, i) => ({
          label: `速算表 ${i === 0 ? '' : `${fmt(INCOME_TAX_TABLE[i - 1]!.upTo + 1000)}円以上`}${r.upTo === Infinity ? '' : `${fmt(r.upTo)}円以下`}`,
          value: `税率${r.rate}％ 控除額${fmt(r.deduction)}円`,
        })),
      ],
      answer: ans,
      unit: '円',
      steps: [
        { text: `${fmt(taxable)}円が該当する区分は「税率${row.rate}％・控除額${fmt(row.deduction)}円」。` },
        { text: '速算表で計算する。', tex: `${fmt(taxable)} \\times ${row.rate}\\% - ${fmt(row.deduction)} = ${fmt(ans)}` },
      ],
      formulas: [{ name: '所得税額（速算表）', tex: '\\text{課税所得金額} \\times \\text{税率} - \\text{控除額}', explain: '超過累進税率を簡便に計算するための表。' }],
      relatedTerms: ['chouka-ruishin-zeiritsu'],
    };
  },
};

/** 退職所得控除額。国税庁タックスアンサー No.1420 */
export function retirementDeduction(serviceYears: number, disability = false): number {
  const y = Math.max(1, Math.ceil(serviceYears));
  const base = y <= 20 ? Math.max(800_000, 400_000 * y) : 8_000_000 + 700_000 * (y - 20);
  return base + (disability ? 1_000_000 : 0);
}

/** 退職手当等の区分。国税庁タックスアンサー No.1420 */
export type RetirementKind = 'general' | 'executive' | 'short';

/**
 * 退職所得の金額（円未満切捨て）。
 * - general：一般退職手当等。(収入金額 − 退職所得控除額) × 1/2
 * - executive：特定役員退職手当等（役員等勤続年数5年以下）。2分の1計算の適用なし
 * - short：短期退職手当等（役員等以外の勤続年数5年以下）。控除後300万円以下の部分は1/2、300万円超の部分は全額
 */
export function retirementIncome(pay: number, deduction: number, kind: RetirementKind): number {
  const base = Math.max(0, pay - deduction);
  if (kind === 'executive') return base;
  if (kind === 'short' && base > 3_000_000) return 1_500_000 + (base - 3_000_000);
  return Frac.of(base).div(2).round(0, 'floor').toNumber();
}

export const retirementIncomeGenerator: CalcGenerator = {
  id: 'retirement-income',
  title: '退職所得',
  field: 'D',
  grades: [2, 3],
  sources: [{ title: '国税庁 タックスアンサー No.1420 退職金を受け取ったとき（退職所得）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm' }],
  basis: '退職所得控除・2分の1課税（特定役員退職手当等・短期退職手当等の特例を含む）',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const years = randInt(rng, difficulty === 1 ? 10 : 3, 40);
    const months = difficulty === 1 ? 0 : randInt(rng, 0, 11);
    const servedYears = months > 0 ? years + 1 : years;
    const ded = retirementDeduction(servedYears);
    const executive = difficulty === 3 && servedYears <= 5 && rng() < 0.5;
    const pay = Math.max(ded + 1_000_000, randInt(rng, 5, 60) * 1_000_000);
    // 役員等以外で勤続5年以下は短期退職手当等（控除後300万円超の部分は2分の1計算の適用なし）
    const kind: RetirementKind = executive ? 'executive' : servedYears <= 5 ? 'short' : 'general';
    const ans = retirementIncome(pay, ded, kind);
    const base = pay - ded;
    const steps = [
      { text: months > 0 ? `勤続${years}年${months}カ月 → 1年未満の端数は切り上げて${servedYears}年。` : `勤続年数は${servedYears}年。` },
      servedYears <= 20
        ? { text: '勤続20年以下の退職所得控除額', tex: `40\\text{万円} \\times ${servedYears} = ${fmt(400_000 * servedYears)}${400_000 * servedYears < 800_000 ? '\\;(80万円未満のため80万円)' : ''}` }
        : { text: '勤続20年超の退職所得控除額', tex: `800\\text{万円} + 70\\text{万円} \\times (${servedYears} - 20) = ${fmt(ded)}` },
      kind === 'executive'
        ? { text: '役員等勤続年数5年以下の特定役員退職手当等は2分の1を適用しない。', tex: `${fmt(pay)} - ${fmt(ded)} = ${fmt(ans)}` }
        : kind === 'short' && base > 3_000_000
          ? {
              text: '役員等以外で勤続5年以下の短期退職手当等は、控除後の額のうち300万円以下の部分だけ2分の1にし、300万円を超える部分は全額を退職所得とする。',
              tex: `300\\text{万円} \\times \\frac{1}{2} + (${fmt(base)} - 3{,}000{,}000) = ${fmt(ans)}`,
            }
          : {
              text: kind === 'short' ? '短期退職手当等（勤続5年以下）でも、控除後の額が300万円以下なら全額に2分の1を適用する。' : '退職所得の金額',
              tex: `(${fmt(pay)} - ${fmt(ded)}) \\times \\frac{1}{2} = ${fmt(ans)}`,
            },
    ];
    return {
      id: `retirement-income:${difficulty}:${seed}`,
      generatorId: 'retirement-income',
      pattern: kind === 'executive' ? '特定役員退職手当等' : kind === 'short' ? '短期退職手当等' : '退職所得の金額',
      prompt: `${executive ? '役員として' : kind === 'short' ? '従業員（役員等以外）として' : ''}勤続${years}年${months ? `${months}カ月` : ''}で退職し、退職一時金${fmt(pay)}円を受け取った場合の退職所得の金額はいくらか。${executive ? '全勤続期間が役員等としての期間である。' : ''}障害者になったことによる退職ではなく、過去に退職金の受取りはない。`,
      given: [
        { label: '勤続年数', value: `${years}年${months ? `${months}カ月` : ''}` },
        { label: '退職一時金', value: `${fmt(pay)}円` },
        ...(executive ? [{ label: '区分', value: '役員（役員等勤続年数5年以下）' }] : kind === 'short' ? [{ label: '区分', value: '従業員（役員等以外）' }] : []),
      ],
      answer: ans,
      unit: '円',
      roundingNote: '円未満切捨て',
      steps,
      formulas: [
        { name: '退職所得', tex: '(\\text{収入金額} - \\text{退職所得控除額}) \\times \\frac{1}{2}', explain: '特定役員退職手当等は2分の1を適用しない。短期退職手当等は控除後300万円超の部分に2分の1を適用しない。' },
        { name: '退職所得控除額（20年以下）', tex: '40\\text{万円} \\times \\text{勤続年数}\\;(\\text{最低}80\\text{万円})', explain: '' },
        { name: '退職所得控除額（20年超）', tex: '800\\text{万円} + 70\\text{万円} \\times (\\text{勤続年数} - 20)', explain: '' },
      ],
      relatedTerms: ['taishoku-shotoku', 'taishoku-shotoku-kojo'],
    };
  },
};

/** 贈与税の速算表。国税庁タックスアンサー No.4408 */
export const GIFT_TABLE_GENERAL = [
  { upTo: 2_000_000, rate: '10', deduction: 0 },
  { upTo: 3_000_000, rate: '15', deduction: 100_000 },
  { upTo: 4_000_000, rate: '20', deduction: 250_000 },
  { upTo: 6_000_000, rate: '30', deduction: 650_000 },
  { upTo: 10_000_000, rate: '40', deduction: 1_250_000 },
  { upTo: 15_000_000, rate: '45', deduction: 1_750_000 },
  { upTo: 30_000_000, rate: '50', deduction: 2_500_000 },
  { upTo: Infinity, rate: '55', deduction: 4_000_000 },
];
export const GIFT_TABLE_SPECIAL = [
  { upTo: 2_000_000, rate: '10', deduction: 0 },
  { upTo: 4_000_000, rate: '15', deduction: 100_000 },
  { upTo: 6_000_000, rate: '20', deduction: 300_000 },
  { upTo: 10_000_000, rate: '30', deduction: 900_000 },
  { upTo: 15_000_000, rate: '40', deduction: 1_900_000 },
  { upTo: 30_000_000, rate: '45', deduction: 2_650_000 },
  { upTo: 45_000_000, rate: '50', deduction: 4_150_000 },
  { upTo: Infinity, rate: '55', deduction: 6_400_000 },
];
export const GIFT_BASIC_DEDUCTION = 1_100_000;

export function giftTax(amount: number, special: boolean): number {
  const base = amount - GIFT_BASIC_DEDUCTION;
  if (base <= 0) return 0;
  const table = special ? GIFT_TABLE_SPECIAL : GIFT_TABLE_GENERAL;
  const row = table.find((r) => base <= r.upTo)!;
  return Frac.of(base).mul(Frac.of(row.rate).div(100)).sub(row.deduction).round(0, 'floor').toNumber();
}

export const giftTaxGenerator: CalcGenerator = {
  id: 'gift-tax',
  title: '贈与税（暦年課税）',
  field: 'F',
  grades: [2, 3],
  sources: [{ title: '国税庁 タックスアンサー No.4408 贈与税の計算と税率（暦年課税）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/zoyo/4408.htm' }],
  basis: '暦年課税の基礎控除110万円・一般税率／特例税率の速算表',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const amount = randInt(rng, 2, difficulty === 1 ? 10 : 60) * 500_000 + 1_100_000;
    const special = difficulty === 1 ? true : rng() < 0.5;
    const who = special
      ? pick(rng, ['父から贈与を受けた子（贈与を受けた年の1月1日時点で30歳）', '祖母から贈与を受けた孫（贈与を受けた年の1月1日時点で25歳）'])
      : pick(rng, ['夫から贈与を受けた妻', '兄から贈与を受けた弟（30歳）', '父から贈与を受けた子（贈与を受けた年の1月1日時点で16歳）']);
    const base = amount - GIFT_BASIC_DEDUCTION;
    const table = special ? GIFT_TABLE_SPECIAL : GIFT_TABLE_GENERAL;
    const row = table.find((r) => base <= r.upTo)!;
    const ans = giftTax(amount, special);
    return {
      id: `gift-tax:${difficulty}:${seed}`,
      generatorId: 'gift-tax',
      pattern: special ? '特例税率' : '一般税率',
      prompt: `${who}が、その年中に現金${fmt(amount)}円の贈与を受けた（他に贈与はなく、暦年課税を選択、配偶者控除等の特例は適用しない）。納付すべき贈与税額はいくらか。`,
      given: [
        { label: '受贈者', value: who },
        { label: '贈与額（年間合計）', value: `${fmt(amount)}円` },
        { label: '基礎控除', value: '110万円' },
        ...table.map((r, i) => ({
          label: `${special ? '特例' : '一般'}税率 ${i === 0 ? '' : `${fmt(table[i - 1]!.upTo / 10000)}万円超`}${r.upTo === Infinity ? '' : `${fmt(r.upTo / 10000)}万円以下`}`,
          value: `${r.rate}％ 控除額${fmt(r.deduction / 10000)}万円`,
        })),
      ],
      answer: ans,
      unit: '円',
      steps: [
        { text: special ? '直系尊属から18歳以上（1月1日時点）の者への贈与なので特例税率を使う。' : '直系尊属から18歳以上の者への贈与ではないので一般税率を使う。' },
        { text: '基礎控除後の課税価格', tex: `${fmt(amount)} - 1{,}100{,}000 = ${fmt(base)}` },
        { text: '速算表で計算', tex: `${fmt(base)} \\times ${row.rate}\\% - ${fmt(row.deduction)} = ${fmt(ans)}` },
      ],
      formulas: [{ name: '贈与税額（暦年課税）', tex: '(\\text{贈与額} - 110\\text{万円}) \\times \\text{税率} - \\text{控除額}', explain: '特例税率は直系尊属から贈与年1月1日に18歳以上の子・孫等への贈与に適用。' }],
      relatedTerms: ['zoyozei-kiso-kojo', 'tokurei-zeiritsu'],
    };
  },
};

export const medicalDeductionGenerator: CalcGenerator = {
  id: 'medical-deduction',
  title: '医療費控除',
  field: 'D',
  grades: [2, 3],
  sources: [{ title: '国税庁 タックスアンサー No.1120 医療費を支払ったとき（医療費控除）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1120.htm' }],
  basis: '医療費控除（通常の医療費控除。セルフメディケーション税制は選択しない）',
  generate(seed, difficulty): CalcProblem {
    const rng = createRng(seed);
    const paid = randInt(rng, 15, 150) * 10_000;
    const reimb = difficulty === 1 ? 0 : randInt(rng, 0, Math.floor(paid / 20_000)) * 10_000;
    const income = difficulty === 3 ? randInt(rng, 50, 190) * 10_000 : randInt(rng, 250, 900) * 10_000;
    const floorAmt = Math.min(100_000, Frac.of(income).mul(Frac.of('0.05')).round(0, 'floor').toNumber());
    const ans = Math.min(2_000_000, Math.max(0, paid - reimb - floorAmt));
    return {
      id: `medical-deduction:${difficulty}:${seed}`,
      generatorId: 'medical-deduction',
      pattern: difficulty === 3 ? '総所得金額等200万円未満の医療費控除' : '医療費控除額',
      prompt: `総所得金額等が${fmt(income)}円の人が、その年に医療費${fmt(paid)}円を支払い、保険金等で${fmt(reimb)}円が補てんされた。医療費控除の額はいくらか（セルフメディケーション税制は選択しない）。`,
      given: [
        { label: '支払った医療費', value: `${fmt(paid)}円` },
        { label: '保険金などで補てんされる金額', value: `${fmt(reimb)}円` },
        { label: '総所得金額等', value: `${fmt(income)}円` },
      ],
      answer: ans,
      unit: '円',
      steps: [
        { text: '差し引く金額は「10万円」と「総所得金額等×5％」のいずれか少ない方。', tex: `\\min(100{,}000,\\ ${fmt(income)} \\times 5\\%) = ${fmt(floorAmt)}` },
        { text: '医療費控除額（上限200万円）', tex: `${fmt(paid)} - ${fmt(reimb)} - ${fmt(floorAmt)} = ${fmt(ans)}` },
      ],
      formulas: [{ name: '医療費控除', tex: '\\text{支払医療費} - \\text{補てん額} - \\min(10\\text{万円},\\ \\text{総所得金額等} \\times 5\\%)', explain: '控除額の上限は200万円。' }],
      relatedTerms: ['iryohi-kojo'],
    };
  },
};
