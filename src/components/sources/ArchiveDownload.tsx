'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { archiveToCSV } from '@/lib/archive-quality';
import type { AuctionPrint } from '@/types/bond';

/**
 * The auction archive as a CSV, built in the browser from the file the app
 * already ships.
 *
 * `archiveToCSV` was written, documented and covered by nine tests, and nothing
 * in the app ever called it — its own docstring describes CSV as "the form a
 * licensee or a researcher would actually want", and the only form on offer was
 * JSON. Tested dead code is a particular kind of gap, because the tests make it
 * look finished.
 *
 * The archive is FETCHED rather than imported. Importing it would inline 220 KB
 * of auction results into the client bundle for every visitor to /sources/,
 * including the overwhelming majority who never press this. Fetching costs one
 * request from someone who has asked for the file, and it is the same URL the
 * JSON link points at, so a service worker that has cached one has cached the
 * other.
 *
 * No disclaimer row is prepended. This is CBK's published data rather than our
 * analytics — no yield, no recommendation, nothing derived — and a comment line
 * above the header is exactly what breaks the spreadsheet and pandas import this
 * exists to serve. The attribution request sits in the prose beside the button,
 * where a person reads it and a parser does not have to.
 */
export default function ArchiveDownload() {
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');

  async function download() {
    setState('working');
    try {
      const res = await fetch('/data/auction-results.json');
      if (!res.ok) throw new Error(`${res.status}`);
      const csv = archiveToCSV((await res.json()) as AuctionPrint[]);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mwangaza-auction-archive.csv';
      a.click();
      URL.revokeObjectURL(url);
      setState('idle');
    } catch {
      // Offline with nothing cached is the likely cause, and the honest thing is
      // to say the download did not happen rather than leave a button that
      // looked pressed. The JSON link beside it still works from cache.
      setState('failed');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={download}
        disabled={state === 'working'}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sand-400 px-2.5 py-1 text-sm text-ink-soft transition hover:border-ink-muted hover:text-ink disabled:opacity-60"
      >
        <Download size={13} aria-hidden="true" />
        {state === 'working' ? 'Preparing…' : 'CSV'}
      </button>
      {state === 'failed' && (
        <span role="status" className="ml-2 text-sm text-gold-700">
          The download failed — you may be offline. The JSON link still works.
        </span>
      )}
    </>
  );
}
