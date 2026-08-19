export type FreshnessLevel = 'fresh' | 'stale' | 'old' | 'expired';

export interface QualityScore {
  score: number;
  missingFields: number;
  nullValues: number;
  inconsistencies: number;
  outliers: number;
  issues: string[];
}

export interface DataManifestItem {
  id: string;
  label: string;
  source: string;
  sourceUrl: string;
  dataDate: string;
  file: string;
  dataset: unknown;
}

export interface DataManifest {
  datasets: DataManifestItem[];
  lastSuccessfulScrape?: string;
}

export interface DataReport {
  generatedAt: string;
  overallFreshness: FreshnessLevel;
  overallScore: number;
  datasets: Array<{
    id: string;
    label: string;
    freshness: FreshnessLevel;
    quality: QualityScore;
    recordCount: number;
    source: string;
    sourceUrl: string;
    file: string;
    dataDate: string;
  }>;
}

export function computeFreshness(dataDate: string, now: Date): FreshnessLevel {
  const d = new Date(dataDate);
  if (Number.isNaN(d.getTime())) return 'expired';
  const hours = (now.getTime() - d.getTime()) / 3_600_000;
  if (hours < 6) return 'fresh';
  if (hours < 24) return 'stale';
  if (hours < 72) return 'old';
  return 'expired';
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeDataQuality(dataset: unknown): QualityScore {
  const rows = Array.isArray(dataset) ? dataset as Record<string, unknown>[] : [];
  if (!rows.length) {
    return {
      score: 0,
      missingFields: 1,
      nullValues: 0,
      inconsistencies: 0,
      outliers: 0,
      issues: ['Dataset is empty'],
    };
  }

  const allKeys = new Set<string>();
  rows.forEach((r) => Object.keys(r || {}).forEach((k) => allKeys.add(k)));
  const requiredKeys = [...allKeys];

  let missingFields = 0;
  let nullValues = 0;
  let inconsistencies = 0;
  let outliers = 0;
  const issues: string[] = [];

  const numericValues: number[] = [];

  for (const row of rows) {
    for (const key of requiredKeys) {
      if (!(key in row)) missingFields += 1;
      const val = row[key];
      if (val == null) nullValues += 1;
      if (typeof val === 'number' && Number.isFinite(val)) numericValues.push(val);
    }

    if (typeof row.issueDate === 'string' && typeof row.maturityDate === 'string') {
      if (new Date(row.maturityDate).getTime() <= new Date(row.issueDate).getTime()) {
        inconsistencies += 1;
      }
    }
  }

  if (numericValues.length >= 5) {
    const q1 = percentile(numericValues, 0.25);
    const q3 = percentile(numericValues, 0.75);
    const iqr = q3 - q1;
    const low = q1 - 3 * iqr;
    const high = q3 + 3 * iqr;
    outliers = numericValues.filter((n) => n < low || n > high).length;
  }

  if (missingFields) issues.push(`${missingFields} missing field entries`);
  if (nullValues) issues.push(`${nullValues} null values`);
  if (inconsistencies) issues.push(`${inconsistencies} logical inconsistencies`);
  if (outliers) issues.push(`${outliers} numeric outliers`);

  const penalties = missingFields * 0.4 + nullValues * 0.2 + inconsistencies * 1.5 + outliers * 0.3;
  const raw = 100 - penalties / Math.max(1, rows.length);

  return {
    score: Math.max(0, Math.min(100, Number(raw.toFixed(1)))),
    missingFields,
    nullValues,
    inconsistencies,
    outliers,
    issues,
  };
}

const freshnessRank: Record<FreshnessLevel, number> = {
  fresh: 0,
  stale: 1,
  old: 2,
  expired: 3,
};

export function generateDataReport(datasets: DataManifest): DataReport {
  const now = new Date();
  const rows = datasets.datasets.map((d) => {
    const freshness = computeFreshness(d.dataDate, now);
    const quality = computeDataQuality(d.dataset);
    return {
      id: d.id,
      label: d.label,
      freshness,
      quality,
      recordCount: Array.isArray(d.dataset) ? d.dataset.length : 0,
      source: d.source,
      sourceUrl: d.sourceUrl,
      file: d.file,
      dataDate: d.dataDate,
    };
  });

  const overallFreshness = rows
    .map((r) => r.freshness)
    .sort((a, b) => freshnessRank[b] - freshnessRank[a])[0] ?? 'expired';
  const overallScore = rows.length
    ? Number((rows.reduce((sum, r) => sum + r.quality.score, 0) / rows.length).toFixed(1))
    : 0;

  return {
    generatedAt: now.toISOString(),
    overallFreshness,
    overallScore,
    datasets: rows,
  };
}
