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
    const r = lookup(html, 'https://www.centralbank.go.ke/bills-bonds/treasury-bonds/');
    expect(r.rows).toHaveLength(2);
    expect(r.docs.map((d) => decodeURIComponent(d))).toEqual([
      'https://www.centralbank.go.ke/uploads/a/1_RESULTS IFB 1-2015-12 DATED 30-03-2015.pdf',
    ]);
  });
});
