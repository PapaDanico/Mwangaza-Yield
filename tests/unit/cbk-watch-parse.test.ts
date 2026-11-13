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
      // The 23 Oct bulletin carries no inflation sentence: absent, not guessed.
      inflationPct: null,
      inflationMonth: null,
      inflationPrevPct: null,
      corePct: null,
      corePrevPct: null,
      nonCorePct: null,
      nonCorePrevPct: null,
    });
  });

  it('reads the month\'s KNBS inflation from the 30 Oct 2026 bulletin, core and non-core separately', async () => {
    const { bulletinFigures } = await import('../../netlify/functions/cbk-watch.mts');
    const fs = await import('node:fs');
    const text = fs.readFileSync(new URL('../fixtures/cbk-bulletin-2026-10-30.txt', import.meta.url), 'utf8');
    const f = bulletinFigures(text);
    expect(f).toMatchObject({
      inflationPct: '7.3',
      inflationMonth: 'October',
      inflationPrevPct: '6.8',
      corePct: '4.3',
      corePrevPct: '4.0',
      nonCorePct: '15.1',
      nonCorePrevPct: '14.0',
      reservesUSDm: '14,740',
      usdKes: '129.96',
    });
  });

  it('does not read another economy\'s core inflation as Kenya\'s (13 Nov 2026: 2.1 from 2.4 beside a real 4.3)', async () => {
    const { bulletinFigures } = await import('../../netlify/functions/cbk-watch.mts');
    // A global-economy sentence with the same wording, and no Kenyan headline sentence.
    const global = 'In the United States, core inflation eased to 2.1 percent from 2.4 percent in October.';
    expect(bulletinFigures(global).corePct).toBeNull();
    expect(bulletinFigures(`Core inflation eased to 2.1 percent from 2.4 percent. Non-core inflation fell to 9.0 percent from 9.5 percent.`)).toMatchObject({ corePct: null, nonCorePct: null });
    // With Kenya's headline present, a global sentence BEFORE it is ignored and Kenya's own follows it.
    const both = `${global} Inflation increased to 7.3 percent in October from 6.8 percent in September 2026. Core inflation increased to 4.3 percent from 4.0 percent, driven by food. Non-core inflation increased to 15.1 percent from 14.0 percent.`;
    expect(bulletinFigures(both)).toMatchObject({ inflationPct: '7.3', corePct: '4.3', corePrevPct: '4.0', nonCorePct: '15.1' });
    // A core sentence far from the headline (another section) is not Kenya's.
    const far = `Inflation increased to 7.3 percent in October from 6.8 percent in September 2026. ${'Other text. '.repeat(120)} Core inflation eased to 2.1 percent from 2.4 percent.`;
    expect(bulletinFigures(far).corePct).toBeNull();
  });

  it('does not read the non-core sentence as the core one', async () => {
    const { bulletinFigures } = await import('../../netlify/functions/cbk-watch.mts');
    const f = bulletinFigures('Inflation increased to 7.3 percent in October from 6.8 percent in September 2026. Non-core inflation increased to 15.1 percent from 14.0 percent, mainly due to produce.');
    expect(f.corePct).toBeNull();
    expect(f.nonCorePct).toBe('15.1');
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

describe('cbk-watch T-bill archive keys', () => {
  const b = 'https://www.centralbank.go.ke/uploads/treasury_bills/';
  // As served on 26 Oct 2026: the same combined notice, once per tenor tab.
  const urls = [
    `${b}991623375_RESULTS 2705-091 2679-182 2634-364 DATED 26-10-2026.xlsx.pdf`,
    `${b}555111222_RESULTS 2705-091 2679-182 2634-364 DATED 26-10-2026.pdf`,
    `${b}777333444_RESULTS 2705-091 2679-182 2634-364 DATED 26-10-2026 (1).pdf`,
    `${b}1647758237_RESULTS 2704-091 2678-182 2633-364 DATED 19-10-2026.pdf`,
    `${b}71747979_RESULTS 2703-091 2677-182 2632-364 DATED 12-10-2026.pdf`,
  ];

  it('keys a notice by its value date, not its file name', async () => {
    const { archiveKey } = await import('../../netlify/functions/cbk-watch.mts');
    expect(archiveKey(urls[0])).toBe('2026-10-26');
    expect(archiveKey(urls[1])).toBe(archiveKey(urls[2]));
    expect(archiveKey(`${b}Guide.pdf`)).toBe('Guide.pdf');
  });

  it('spends the quota on distinct auctions and skips ones already archived', async () => {
    const { unseenNotices } = await import('../../netlify/functions/cbk-watch.mts');
    expect(unseenNotices(urls, {}, 3).map((u) => u.includes('26-10') ? '26' : u.includes('19-10') ? '19' : '12')).toEqual(['26', '19', '12']);
    expect(unseenNotices(urls, { '2026-10-26': {}, '2026-10-19': {} }, 3)).toEqual([urls[4]]);
  });
});

describe('cbk-watch Monthly Economic Indicators picker', () => {
  const base = 'https://www.centralbank.go.ke/uploads/monthly_economic_indicators/';
  const links = [
    `${base}1113341247_Monthly%20Economic%20Indicators%20for%20May%202022.pdf`,
    `${base}1527525398_Monthly%20Economic%20Indicators%20-%20Aug%202025.pdf`,
    `${base}1672331330_Monthly%20Economic%20Indicators%20June%202025.pdf`,
    `${base}1296032873_Monthly%20Economic%20Indicators%20December%202023.pdf`,
    'https://example.com/Monthly%20Economic%20Indicators%20Sept%202030.pdf',
    `${base}9_Weekly%20Bulletin%20Oct%202026.pdf`,
    // CBK's 2026 issues are named "MEI - <Month> <Year>", not "Monthly Economic Indicators".
    `${base}305206407_MEI%20-%20July%202026.pdf`,
    `${base}1193178686_MEI%20-%20June%202026.pdf`,
    `${base}730714238_Monthly%20Economic%20Indicators%20-%20May%202026.pdf`,
  ];

  it('dates an issue from the month and year in its file name', async () => {
    const { monthlyIssue } = await import('../../netlify/functions/cbk-watch.mts');
    expect(monthlyIssue('Monthly Economic Indicators for May 2022.pdf')).toBe(202205);
    expect(monthlyIssue('Monthly%20Economic%20Indicators%20-%20Aug%202025.pdf')).toBe(202508);
    expect(monthlyIssue('Monthly Economic Indicators Sept 2026.pdf')).toBe(202609);
    expect(monthlyIssue('no date here.pdf')).toBe(0);
  });

  it('picks the newest CBK-hosted issue and never follows a link off-site', async () => {
    const { newestMonthly } = await import('../../netlify/functions/cbk-watch.mts');
    expect(newestMonthly(links)).toBe(links[6]); // MEI - July 2026
    expect(newestMonthly([])).toBeNull();
  });

  it('skips the contents page: sections are read from their second heading', async () => {
    const { monthlyExcerpts } = await import('../../netlify/functions/cbk-watch.mts');
    const text = 'TABLE OF CONTENTS REAL SECTOR INDICATORS ..... 13 BALANCE OF PAYMENTS AND EXTERNAL SECTOR INDICATORS ..... 16 ' +
      'x'.repeat(50) + ' REAL SECTOR INDICATORS real-body ' + 'y'.repeat(50) +
      ' BALANCE OF PAYMENTS AND EXTERNAL SECTOR INDICATORS bop-body';
    const parts = monthlyExcerpts(text, 120);
    expect(parts.real).toContain('real-body');
    expect(parts.external).toContain('bop-body');
    expect(monthlyExcerpts('nothing here').real).toBe('(heading not found)');
  });
});

describe('cbk-watch Monthly Economic Indicators figures', () => {
  it('reads the newest month of each row from the July 2026 issue', async () => {
    const { monthlyFigures } = await import('../../netlify/functions/cbk-watch.mts');
    const fs = await import('node:fs');
    const text = fs.readFileSync(new URL('../fixtures/cbk-mei-2026-07.txt', import.meta.url), 'utf8');
    const [real, external] = text.split('=====EXTERNAL=====');
    expect(monthlyFigures(real, external)).toEqual({
      // Visitor arrivals print "…" for July, so the newest AVAILABLE month is June.
      visitorArrivals: '197,564',
      visitorArrivalsMonth: 'Jun-26',
      goodsExportsUSDm12m: '13,492.0',
      goodsImportsUSDm12m: '26,336.5',
      currentAccountUSDm12m: '-4,638.9',
      balanceOfPaymentsMonth: 'Jul-26',
    });
  });

  it('reports a missing table as null, not a number', async () => {
    const { monthlyFigures } = await import('../../netlify/functions/cbk-watch.mts');
    expect(Object.values(monthlyFigures('nothing', 'nothing')).every((v) => v === null)).toBe(true);
  });
});
