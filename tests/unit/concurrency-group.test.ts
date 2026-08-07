import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The concurrency rule, tested because the first version of it did the exact
 * opposite of what its own comment claimed.
 *
 * `cancel-in-progress` is evaluated on the INCOMING run and decides whether
 * that run cancels others in its group. It does not protect the run it is set
 * on. So `cancel-in-progress: ${{ github.event_name != 'schedule' }}` reads
 * like an exemption for scheduled runs and is not one — it only stops a
 * scheduled run from cancelling other things.
 *
 * The exemption has to be in the GROUP. A scheduled run's `github.ref` is
 * `refs/heads/main`, the same ref as every push to main, so a group keyed on
 * ref alone puts them together and a routine merge cancels the data refresh.
 * The refresh commits to main itself, so this is the normal path.
 *
 * This is a text check rather than a behavioural one, which is a real limit:
 * only GitHub can evaluate the expression. What it can do is fail if the
 * exemption ever moves back out of the group, which is the specific regression
 * that already happened once.
 */

const ci = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url).pathname,
  'utf8'
);

const block = (() => {
  const m = ci.match(/^concurrency:\n((?:[ \t].*\n|\n)*)/m);
  return m ? m[1] : '';
})();

const group = (() => {
  const m = block.match(/group:\s*([\s\S]*?)\n\s*cancel-in-progress:/);
  return m ? m[1] : '';
})();

describe('the CI concurrency rule', () => {
  it('declares a concurrency block at all', () => {
    // Guards against the regex above silently matching nothing, which would
    // make every assertion below pass against an empty string.
    expect(block.length, 'no concurrency block found in ci.yml').toBeGreaterThan(40);
    expect(group.length, 'no group expression found').toBeGreaterThan(20);
  });

  /**
   * THE DEFECT, NAMED.
   *
   * If the group is only workflow + ref, scheduled and push runs collide and
   * the refresh is cancellable — regardless of what cancel-in-progress says.
   */
  it('does not key the group on workflow and ref alone', () => {
    const keys = group.replace(/\s+/g, ' ').trim();
    expect(
      keys,
      'the group is workflow+ref only, so scheduled runs share a group with ' +
        'pushes to main and a merge will cancel the data refresh. The ' +
        'exemption belongs in the GROUP — cancel-in-progress cannot protect ' +
        'the run it is set on.'
    ).not.toBe('${{ github.workflow }}-${{ github.ref }}');
  });

  it('gives schedule and workflow_dispatch a group of their own', () => {
    // run_id is unique per run, so those events land in a group of one that
    // nothing else can join and therefore nothing can cancel.
    expect(group).toContain('github.run_id');
    for (const event of ['schedule', 'workflow_dispatch']) {
      expect(
        group,
        `${event} is not exempted in the group expression`
      ).toContain(event);
    }
  });

  it('still supersedes push and pull_request runs', () => {
    // The whole point of the rule. If cancel-in-progress were simply false,
    // nothing would ever be cancelled and stacked runs would return.
    const flag = block.match(/cancel-in-progress:\s*(.*)/)?.[1] ?? '';
    expect(flag).toContain('github.event_name');
    expect(flag.trim()).not.toBe('false');
  });

  /**
   * The events named in the group and in the flag must be the SAME set.
   *
   * Exempting an event from cancellation while leaving it in the shared group
   * (or the reverse) is a half-applied rule, and half-applied is how the
   * original read as correct.
   */
  it('exempts the same events in the group as in the flag', () => {
    const flag = block.match(/cancel-in-progress:\s*(.*)/)?.[1] ?? '';
    const named = (text: string) =>
      new Set(
        [...text.matchAll(/'(schedule|workflow_dispatch|push|pull_request)'/g)].map((m) => m[1])
      );
    expect([...named(group)].sort()).toEqual([...named(flag)].sort());
  });
});
