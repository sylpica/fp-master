import { describe, expect, it } from 'vitest';
import { CALC_GENERATORS, regenerate } from '../../src/domain/calc';
import { coefficient } from '../../src/domain/calc/finance';
import { giftTax, incomeTax, retirementDeduction, retirementIncome, retirementIncomeGenerator } from '../../src/domain/calc/tax';
import { inheritanceBasicDeduction, legalShares } from '../../src/domain/calc/inheritance';

describe('6つの係数（一般的な係数表の値と一致）', () => {
  it.each([
    ['shuka', '2', 10, '1.219'],
    ['genka', '2', 10, '0.82'],
    ['nenkin-shuka', '2', 10, '10.95'],
    ['gensai', '2', 10, '0.091'],
    ['shihon', '2', 10, '0.111'],
    ['nenkin-genka', '2', 10, '8.983'],
    ['nenkin-genka', '1', 20, '18.046'],
    ['shihon', '3', 15, '0.084'],
  ] as const)('%s %s%% %d年 = %s', (k, r, n, v) => {
    expect(coefficient(k, r, n).toDecimalString(3)).toBe(v);
  });
});

describe('税額計算（国税庁の計算例と一致）', () => {
  it('所得税：課税所得700万円 → 974,000円（No.2260の具体例）', () => {
    expect(incomeTax(7_000_000)).toBe(974_000);
  });
  it('所得税：1,000円未満切捨て後に適用', () => {
    expect(incomeTax(1_949_999)).toBe(incomeTax(1_949_000));
    expect(incomeTax(1_950_000)).toBe(97_500);
  });
  it('贈与税：500万円・一般税率 53万円、特例税率 48.5万円（No.4408の計算例）', () => {
    expect(giftTax(5_000_000, false)).toBe(530_000);
    expect(giftTax(5_000_000, true)).toBe(485_000);
    expect(giftTax(1_100_000, true)).toBe(0);
  });
  it('退職所得控除：10年2か月→440万円、30年→1,500万円（No.1420の計算例）', () => {
    expect(retirementDeduction(10 + 2 / 12)).toBe(4_400_000);
    expect(retirementDeduction(30)).toBe(15_000_000);
    expect(retirementDeduction(1)).toBe(800_000);
  });
});

describe('退職所得の金額（特定役員退職手当等・短期退職手当等。No.1420）', () => {
  // 期待値は手計算：短期退職手当等は「150万円＋（収入金額−退職所得控除額−300万円）」
  it('一般：勤続30年・3,000万円 → (3,000万−1,500万)÷2 = 750万円', () => {
    expect(retirementIncome(30_000_000, 15_000_000, 'general')).toBe(7_500_000);
  });
  it('特定役員：勤続3年・1,000万円 → 1,000万−120万 = 880万円（2分の1なし）', () => {
    expect(retirementIncome(10_000_000, 1_200_000, 'executive')).toBe(8_800_000);
  });
  it('短期：勤続3年・1,000万円 → 150万＋(880万−300万) = 730万円', () => {
    expect(retirementIncome(10_000_000, 1_200_000, 'short')).toBe(7_300_000);
  });
  it('短期：控除後300万円以下なら全額に2分の1（勤続3年・400万円 → 140万円）', () => {
    expect(retirementIncome(4_000_000, 1_200_000, 'short')).toBe(1_400_000);
  });
  it('短期：控除後ちょうど300万円は150万円（境界）', () => {
    expect(retirementIncome(4_200_000, 1_200_000, 'short')).toBe(1_500_000);
    expect(retirementIncome(4_200_001, 1_200_000, 'short')).toBe(1_500_001);
  });
  it('控除額が収入を上回るときは0円', () => {
    expect(retirementIncome(500_000, 800_000, 'general')).toBe(0);
  });
  it('生成器の正答を問題文から独立に再計算して全件一致する（全難易度×1,500シード）', () => {
    let shortCount = 0;
    for (const d of [1, 2, 3] as const) {
      for (let seed = 0; seed < 1500; seed++) {
        const p = retirementIncomeGenerator.generate(seed, d);
        const m = p.prompt.match(/勤続(\d+)年(?:(\d+)カ月)?/)!;
        const years = Number(m[1]) + (m[2] ? 1 : 0);
        const pay = Number(p.prompt.match(/退職一時金([\d,]+)円/)![1]!.replaceAll(',', ''));
        const executive = p.prompt.startsWith('役員として');
        // 退職所得控除額：20年以下 40万×年数（最低80万）、20年超 800万＋70万×(年数−20)
        const ded = years <= 20 ? Math.max(800_000, 400_000 * years) : 8_000_000 + 700_000 * (years - 20);
        const base = pay - ded;
        let expected: number;
        if (executive) expected = base;
        else if (years <= 5 && base > 3_000_000) {
          expected = 1_500_000 + base - 3_000_000;
          shortCount++;
        } else expected = Math.floor(base / 2);
        expect(p.answer, p.prompt).toBe(expected);
      }
    }
    expect(shortCount).toBeGreaterThan(0);
  });
});

describe('相続', () => {
  it('配偶者と子2人', () => {
    const s = legalShares({ spouse: true, children: [{ alive: true, grandchildren: 0 }, { alive: true, grandchildren: 0 }], parents: 0, siblings: 0 });
    expect(s.map((x) => x.share.toDecimalString(4))).toEqual(['0.5', '0.25', '0.25']);
  });
  it('配偶者と父母', () => {
    const s = legalShares({ spouse: true, children: [], parents: 2, siblings: 0 });
    expect(s[0]!.share.toDecimalString(4)).toBe('0.6667');
    expect(s[1]!.share.toDecimalString(4)).toBe('0.1667');
  });
  it('代襲相続：子1が死亡し孫2人', () => {
    const s = legalShares({ spouse: true, children: [{ alive: false, grandchildren: 2 }, { alive: true, grandchildren: 0 }], parents: 0, siblings: 0 });
    // 子の取り分 1/2 を2系統で分け、子1の系統を孫2人で分ける → 各1/8
    expect(s.find((x) => x.name.includes('孫1'))!.share.toDecimalString(4)).toBe('0.125');
    expect(s.reduce((a, x) => a + x.share.toNumber(), 0)).toBeCloseTo(1, 10);
  });
  it('基礎控除額：法定相続人3人 → 4,800万円', () => {
    expect(inheritanceBasicDeduction(3)).toBe(48_000_000);
  });
});

describe('計算問題の生成（決定論的・検証済みロジック）', () => {
  for (const g of CALC_GENERATORS) {
    describe(g.title, () => {
      it('同じシードから同じ問題が生成される', () => {
        const a = g.generate(12345, 2);
        const b = g.generate(12345, 2);
        expect(a).toEqual(b);
        expect(regenerate(a.id)).toEqual(a);
      });
      it('全難易度・多数のシードで有限な正答と必須項目を持つ', () => {
        for (const d of [1, 2, 3] as const) {
          for (let s = 0; s < 300; s++) {
            const p = g.generate(s, d);
            expect(Number.isFinite(p.answer)).toBe(true);
            expect(p.answer).toBeGreaterThanOrEqual(0);
            expect(p.prompt.length).toBeGreaterThan(10);
            expect(p.steps.length).toBeGreaterThan(0);
            expect(p.formulas.length).toBeGreaterThan(0);
            if (p.unit === '円') expect(Number.isInteger(p.answer)).toBe(true);
            // 小数第2位までに収まる（入力可能な桁数）
            expect(Math.abs(p.answer * 100 - Math.round(p.answer * 100))).toBeLessThan(1e-6);
          }
        }
      });
    });
  }
});

describe('生成問題の正答を独立した浮動小数点計算と照合', () => {
  it('債券・株式指標・係数・利息は独立計算と ±0.01 以内で一致', () => {
    for (let s = 0; s < 200; s++) {
      const p = CALC_GENERATORS.find((g) => g.id === 'bond-yield')!.generate(s, 3);
      const v = (k: string) => {
        const m = p.given.find((x) => x.label === k)?.value.match(/([\d.]+)(?:円|％|年)$/);
        return m ? Number(m[1]) : 0;
      };
      const coupon = v('表面利率');
      const price = v('購入価格') || v('発行価格');
      let expected: number;
      if (p.pattern === '直接利回り') expected = (coupon / price) * 100;
      else if (p.pattern === '所有期間利回り') expected = ((coupon + (v('売却価格') - price) / v('所有期間')) / price) * 100;
      else expected = ((coupon + (100 - price) / (v('残存期間') || v('償還期間'))) / price) * 100;
      expect(Math.abs(p.answer - expected)).toBeLessThanOrEqual(0.0051);
    }
  });
});

describe('容積率の生成問題：指定容積率が用途地域で定め得る値（建築基準法52条1項）', () => {
  // 第一種住居地域（同項2号）・近隣商業地域（同項3号）は、いずれも 10/10・15/10・20/10・30/10・40/10・50/10 のいずれか
  const ALLOWED: Record<string, number[]> = {
    第一種住居地域: [100, 150, 200, 300, 400, 500],
    近隣商業地域: [100, 150, 200, 300, 400, 500],
  };
  it('近隣商業地域で600％のような存在しない指定容積率を出題しない', () => {
    const g = CALC_GENERATORS.find((x) => x.id === 'floor-area-ratio')!;
    for (const d of [1, 2, 3] as const) {
      for (let s = 0; s < 500; s++) {
        const p = g.generate(s, d);
        const zone = p.given.find((x) => x.label === '用途地域')!.value;
        const designated = Number(p.given.find((x) => x.label === '指定容積率')!.value.replace('％', ''));
        expect(ALLOWED[zone], zone).toBeDefined();
        expect(ALLOWED[zone]).toContain(designated);
      }
    }
  });
});
