import React from 'react';
// The component relies on Next's automatic JSX runtime; vitest here uses the classic one.
(globalThis as { React?: typeof React }).React = React;
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MiniLineChart from '../../src/components/dashboard/MiniLineChart';

type D = { x: number; v: number | null };
const base = {
  x: (d: D) => d.x,
  series: [{ key: 'v', name: 'V', color: '#000' }],
  value: (d: D) => d.v,
  xLabel: (x: number) => `L${x}`,
  tooltipLabel: (d: D) => String(d.x),
};

describe('MiniLineChart', () => {
  it('renders nothing rather than NaN geometry when no value is plottable', () => {
    const html = renderToStaticMarkup(<MiniLineChart {...base} data={[{ x: 1, v: null }, { x: 2, v: null }]} />);
    expect(html).not.toContain('NaN');
    expect(html).toBe('');
  });

  it('draws finite coordinates and labels the last point exactly once', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ x: i, v: 8 + i / 10 }));
    const html = renderToStaticMarkup(<MiniLineChart {...base} data={data} />);
    expect(html).not.toContain('NaN');
    expect(html.match(/>L9</g)?.length).toBe(1);
    expect(html).not.toContain('>L8<'); // the neighbour that would collide with it
  });
});
