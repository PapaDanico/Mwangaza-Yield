# Security

## Reporting a vulnerability

Email **info@mwangazadigital.org** with `SECURITY` in the subject.

Please include what you found, the steps to reproduce it, and what an attacker
gets out of it. A proof of concept helps more than a scanner rating.

Expect an acknowledgement within **3 working days** and an assessment within
**10**. If a fix is warranted you will be told when it ships, and credited by
name unless you would rather not be.

Please do not open a public issue for a vulnerability, and please do not test
against the live site in a way that would affect other people — no automated
scanning, no denial of service, no attempts to reach another person's data.
Everything worth testing runs locally: see [README.md](./README.md).

## The realistic threat here is a wrong number, not a stolen one

There is no account system and no server-side profile. The price book at
`/prices` — what a reader actually paid for a bond — is stored on their own
device and never transmitted. There is no database of user records to breach.

So the harm this project can do is not data theft. It is **a plausible figure
that is wrong**, presented as current, to somebody deciding where to put
Ksh 200,000. A yield computed against the wrong tax rate, a rate carried
forward while looking fresh, a scraper that matches the wrong row.

That is treated as a security issue, not merely a bug. If you find one, report
it the same way.

The most recent example is instructive: on 2026-08-07 a scraper matched a
historical row on a Central Bank page and produced USD/KES = 85.1625 against a
real rate of ~129.5. It was reachable, it parsed, and it sat inside the
plausibility band. Nothing but a comparison against the last trusted value
caught it. Reports of that shape are exactly what we want.

## How the data defends itself

- Each indicator is fetched by **ranked routes** with a plausibility band
  (`backend/scrapers/sources.py`), and the route that produced a figure is
  recorded in the data as `via`.
- A figure too far from the last trusted one is **refused**, not published
  (`implausible_move` in `backend/scrapers/macro_parser.py`). The previous
  value is carried forward and the refusal is recorded.
- A failed fetch is written into the data as `lastAttempt` / `attemptFailed`,
  so "we never tried" and "we keep failing" cannot look identical.
- `healthcheck.py` holds each indicator to its own publisher's cadence and
  fails the run when one is breached.
- `check_archive.py` looks for contradictions rather than gaps — figures that
  are individually plausible and collectively impossible.

If you can get a wrong figure past all of that, please tell us how.

## No exchange data, deliberately

No Nairobi Securities Exchange data appears anywhere in this project. Its terms
make the data proprietary, and that covers what sits publicly on its website as
much as a paid feed. The dependency was removed outright rather than relied on
as a use small enough that nobody minds — see [LICENSE](./LICENSE) and
[README.md](./README.md). `tests/unit/no-exchange-data.test.ts` enforces it,
including against copy that merely *claims* the Exchange as a source.

A regression there is a legal exposure, so report it as you would a
vulnerability.

## Current known gaps

Stated plainly rather than left for you to discover:

- **No Content-Security-Policy.** Next.js emits inline scripts and Tailwind
  emits inline styles, so a correct policy needs nonces threaded through the
  framework. A wrong CSP breaks the site in production only, so this is
  deliberate work rather than a config line, and it has not been done.

## Scope

In scope: this repository and the published site.

Out of scope: the upstream publishers themselves (CBK, National Treasury,
KNBS, World Bank), and findings that depend on an attacker already controlling
the reader's device or browser extensions.
