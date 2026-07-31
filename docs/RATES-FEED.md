# The Mwangaza Yield rates feed

**The contract now lives beside the feed it describes:**

- served: <https://mwangazayield.org/data/RATES-FEED.md>
- source: [`public/data/RATES-FEED.md`](../public/data/RATES-FEED.md)

## Why it moved

It used to live here, and JiPange's `lib/rates-feed.ts` linked to it as

```
https://github.com/PapaDanico/Mwangaza-Yield/blob/main/docs/RATES-FEED.md
```

from a **public** repository into a **private** one. Every third party the feed
was published for — the whole reason it carries `Access-Control-Allow-Origin: *`
— got a 404 at the moment they were deciding whether to trust it.

Nobody reported it. It surfaced because a proxy vendor cold-emailed about the
repo, which prompted a look at how an outsider sees this project at all.

A contract document that only its authors can read is not a published contract,
so it is served from the same directory as `rates.json` and `rates.csv`, under
the same headers, and is reachable by anyone who can reach the feed.

This file is a pointer, not a copy. Two copies of a contract is how the
published one quietly stops matching the real one.
