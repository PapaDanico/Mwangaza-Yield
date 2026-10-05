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
    ).toEqual([`${b}789_Results%20Switch.pdf`, `${b}456_RESULTS%20FOR%20FXD3-2019-015.pdf`]);
  });

  it('orders by CBK upload id, newest first, whatever the page order', async () => {
    const { resultsPdfs } = await import('../../netlify/functions/cbk-watch.mts');
    const b = 'https://www.centralbank.go.ke/uploads/treasury_bonds/';
    // The bonds page lists oldest first; the 5 Oct run never reached the new notice.
    const old = Array.from({ length: 30 }, (_, i) => `${b}${1000 + i}_RESULTS%20OLD%20${i}.pdf`);
    expect(resultsPdfs([...old, `${b}2069542746_RESULTS%20FXD1-2019-020.pdf`], 1)).toEqual([
      `${b}2069542746_RESULTS%20FXD1-2019-020.pdf`,
    ]);
  });
});
