// @ts-nocheck -- imports a .mts Netlify function, outside the app's tsconfig module resolution
import { describe, expect, it } from 'vitest';
import { keyRates, tables } from '../../netlify/functions/cbk-watch.mts';

/* Fixtures are the rows CBK served on 4 Oct 2026, as the first run returned them. */
describe('cbk-watch parsing', () => {
  it('reads the Key Rates sidebar and dates the FX row from "Posted On"', () => {
    const r = keyRates([
      [['Daily KES Exchange Rates'], ['US DOLLAR', '129.76'], ['STG POUND', '171.62'], ['Posted On: 02-10-2026']],
      [['Key Rates'], ['Central Bank Rate', '8.75%', '11/08/2026'], ['91-Day T-Bill', '8.778%', '05/10/2026'], ['Inflation Rate', '6.6%', 'August,2026']],
    ]);
    expect(r['US DOLLAR']).toEqual({ value: '129.76', date: '02-10-2026' });
    expect(r['Central Bank Rate']).toEqual({ value: '8.75%', date: '11/08/2026' });
    expect(r['Inflation Rate'].date).toBe('August,2026');
  });

  it('keeps the newest rows of a long oldest-first table, not the oldest', () => {
    const rows = Array.from({ length: 40 }, (_, i) => `<tr><td>row ${i}</td></tr>`).join('');
    const [t] = tables(`<table><tr><th>Date</th></tr>${rows}</table>`);
    expect(t[0]).toEqual(['Date']);
    expect(t.at(-1)).toEqual(['row 39']);
    expect(t.some((r) => r[0] === 'row 5')).toBe(false);
  });
});

describe('cbk-watch results notices', () => {
  it('picks CBK-hosted results PDFs, newest first, and nothing off-site', async () => {
    const { resultsPdfs } = await import('../../netlify/functions/cbk-watch.mts');
    const b = 'https://www.centralbank.go.ke/uploads/treasury_bonds/';
    expect(
      resultsPdfs([
        `${b}123_Prospectus%20FXD1.pdf`,
        `${b}456_RESULTS%20FOR%20FXD3-2019-015.pdf`,
        'https://evil.example/results.pdf',
        `${b}789_Results%20Switch.pdf`,
      ]),
    ).toEqual([`${b}456_RESULTS%20FOR%20FXD3-2019-015.pdf`, `${b}789_Results%20Switch.pdf`]);
  });

  it('orders by the DATED date in the name, not page order or upload id', async () => {
    const { resultsPdfs } = await import('../../netlify/functions/cbk-watch.mts');
    const b = 'https://www.centralbank.go.ke/uploads/treasury_bonds/';
    // Real names from the 5 Oct run: the 2018 notice has the HIGHER prefix.
    const old2018 = `${b}2129006739_AUCTION%20RESULTS%20TREASURY%20BOND%20%20FXD1-2018-15%20DATED%2028-05-2018.pdf`;
    const old2020 = `${b}2115019172_RESULTS%20RE-OPEN%20FXD3-2019-5%20AND%20FXD4-2019-10%20DATED%2022.06.2020.pdf`;
    const current = `${b}250350777_RESULTS%20FOR%20FXD3-2019-015%20AND%20%20FXD1-2019-020%20DATED%2005-10-2026.pdf`;
    expect(resultsPdfs([old2018, old2020, current], 2)).toEqual([current, old2020]);
  });

});

describe('lookup (wanted bonds)', () => {
  it('finds IFB1/2015/012 rows and notices by ISIN or issue code, not its neighbours', async () => {
    const { lookup } = await import('../../netlify/functions/cbk-watch.mts');
    const html = `<table>
      <tr><td>30/03/2015</td><td>IFB1/2015/12</td><td>KE4000001653</td><td>12</td><td>11.000</td><td>11.5</td></tr>
      <tr><td>14/12/2015</td><td>IFB1/2015/9</td><td>KE5000004100</td></tr>
      <tr><td>x</td><td>KE4000001653</td></tr></table>
      <a href="/uploads/a/1_RESULTS IFB 1-2015-12 DATED 30-03-2015.pdf">r</a>
      <a href="/uploads/a/2_RESULTS IFB1-2015-9.pdf">s</a>
      <a href="/uploads/a/3_RESULTS IFB1-2015-120.pdf">t</a>`;
    const r = lookup(html, 'https://www.centralbank.go.ke/bills-bonds/treasury-bonds/', [
      { isin: 'KE4000001653', code: /IFB\s*1\s*[-/ ]\s*2015\s*[-/ ]\s*0?12(?!\d)/i },
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.docs.map((d) => decodeURIComponent(d))).toEqual([
      'https://www.centralbank.go.ke/uploads/a/1_RESULTS IFB 1-2015-12 DATED 30-03-2015.pdf',
    ]);
  });
});

describe('cbk-watch weekly bulletin', () => {
  it('dates bulletins from every file-name form CBK uses', async () => {
    const { bulletinDate } = await import('../../netlify/functions/cbk-watch.mts');
    expect(bulletinDate('1082633218_Weekly_CBK_Bulletin_October_16_2026.pdf')).toBe(20261016);
    expect(bulletinDate('1017471980_Weekly_CBK_Bulletin_23_October_2026.pdf')).toBe(20261023);
    expect(bulletinDate('Weekly%20CBK%20Bulletin%20September%204,%202026.pdf')).toBe(20260904);
    expect(bulletinDate('29-01-2016.pdf')).toBe(20160129);
    expect(bulletinDate('AuctionRulesGuidelines.pdf')).toBe(0);
  });

  it('picks the newest CBK-hosted bulletin, whatever the page order', async () => {
    const { newestBulletin } = await import('../../netlify/functions/cbk-watch.mts');
    const b = 'https://www.centralbank.go.ke/uploads/weekly_bulletin/';
    expect(
      newestBulletin([
        `${b}Weekly_Bulletin_-_January_8_2016.pdf`,
        `${b}1017471980_Weekly_CBK_Bulletin_23_October_2026.pdf`,
        `${b}1082633218_Weekly_CBK_Bulletin_October_16_2026.pdf`,
        'https://example.com/Weekly_Bulletin_December_31_2026.pdf',
        `${b}2025-Remittances-Household-Survey-Report.pdf`,
      ])
    ).toBe(`${b}1017471980_Weekly_CBK_Bulletin_23_October_2026.pdf`);
  });

  it('reads the figures from the 23 Oct 2026 bulletin as unpdf extracts it', async () => {
    const { bulletinFigures } = await import('../../netlify/functions/cbk-watch.mts');
    const fs = await import('node:fs');
    const text = fs.readFileSync(new URL('../fixtures/cbk-bulletin-2026-10-23.txt', import.meta.url), 'utf8');
    expect(bulletinFigures(text)).toEqual({
      reservesUSDm: '14,693',
      importCoverMonths: '5.9',
      reservesAsOf: 'October 22',
      usdKes: '129.91',
      usdKesOn: 'October 22',
      gdpGrowthPct: '5.1',
      gdpQuarter: 'second quarter 2026',
      domesticDebtKSHbn: '7,821.53',
      domesticDebtAsOf: '16-Oct-26',
      publicDebtKSHbn: '13,475.15',
      publicDebtAsOf: 'Aug-2026*',
    });
  });

  it('reports a missing figure as null rather than guessing', async () => {
    const { bulletinFigures } = await import('../../netlify/functions/cbk-watch.mts');
    expect(Object.values(bulletinFigures('nothing useful here')).every((v) => v === null)).toBe(true);
  });
});

describe('cbk-watch T-bill archive', () => {
  // The 22 Oct 2026 notice, as cbk-watch's PDF reader returned it on 23 Oct.
  const notice =
    'A. RESULTS OF 91, 182 & 364 DAYS TREASURY BILLS ISSUES 2705/091, 2679/182 & 2634/364 DATED 26-10-2026 Tenor 91 DAYS ' +
    'Market Weighted Average Interest Rate 8.7479% 8.8608% 9.0341% Weighted Average Interest Rate of accepted bids ' +
    '8.7478% 8.8591% 9.0267% Price per Kshs 100 at average interest rate 97.8656 95.7695 91.7415';

  it('reads accepted-bid rates, not the market rates printed just before them', async () => {
    const { tbillNoticeRates } = await import('../../netlify/functions/cbk-watch.mts');
    expect(tbillNoticeRates(notice)).toEqual({ dated: '2026-10-26', r91: 8.7478, r182: 8.8591, r364: 9.0267 });
  });

  it('returns null for a notice it cannot read, never a partial row', async () => {
    const { tbillNoticeRates } = await import('../../netlify/functions/cbk-watch.mts');
    expect(tbillNoticeRates('RESULTS DATED 26-10-2026 no rates here')).toBeNull();
    expect(tbillNoticeRates('')).toBeNull();
  });
});
