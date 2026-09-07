/** @type {import('next').NextConfig} */
module.exports = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },

  /* A fixed build ID, so that identical source produces identical output.
   *
   * Next generates a random build ID per build and bakes it into the emitted
   * chunks, which means their content hashes move too. Two builds of the same
   * commit therefore differ in every JavaScript file and in the script tags of
   * every page.
   *
   * `scripts/verify-sw-shell.mjs` digests the built routes and compares that
   * against a digest recorded beside the service worker's cache version. Its
   * whole purpose is to catch a precached page changing while VERSION stays
   * put — the failure that served 14 August's pages to every returning visitor
   * for a week. With a random build ID that digest is unrepeatable, so the
   * guard fails on the first rebuild after the digest is recorded, no matter
   * what the source says. It could only ever pass against the exact `out/`
   * that produced its own constant, which on a CI runner or a Netlify build is
   * never the case.
   *
   * A constant makes the digest mean what it is documented to mean. Cache
   * busting is unaffected: the per-chunk hashes are still content-derived, so
   * a file that changes still changes its URL, and only the two manifests
   * under /_next/static/<id>/ keep a stable path. Nothing here sets an
   * immutable Cache-Control on /_next/static, so those revalidate normally.
   */
  generateBuildId: () => 'mwangaza-yield',
};
