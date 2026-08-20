import { defineConfig, configDefaults } from 'vitest/config';

/**
 * WHY THIS FILE EXISTS
 *
 * Only to keep the test run out of `.claude/worktrees/`.
 *
 * Claude Code creates a full checkout there for each subagent it runs with
 * worktree isolation. Those checkouts contain this repository's entire test
 * suite, at whatever commit the agent was pointed at — including deliberately
 * broken historical states. Vitest's default discovery walks into them.
 *
 * The result is not a small annoyance. A run that should report 114 files and
 * 1,317 tests instead reported 568 files and 6,509 tests, with 8 failures,
 * every one of them inside a worktree and none in the tree being tested. That
 * reads exactly like a regression, and the natural response — start
 * bisecting — wastes the time it takes to notice the paths.
 *
 * `configDefaults.exclude` is spread rather than replaced, because it already
 * covers node_modules and dist, and dropping those would trade this problem
 * for a slower and stranger one.
 */
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
