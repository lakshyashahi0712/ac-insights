# Tests

Zero dependencies. Node's built-in test runner, nothing installed, no build step —
the same as the extension itself.

```bash
npm test
```

or directly:

```bash
node --test "tests/**/*.test.js"
```

Quote the glob. `node --test tests/` treats the directory as a single file and fails
with `MODULE_NOT_FOUND`. Requires Node 20+.

## What's covered

| File | Guards |
| --- | --- |
| `duration.test.js` | `utils/duration.js` — duration parsing, the forward study planner, and deadline mode's reverse math (days-until, required pace, heavy/impossible thresholds). |
| `course-scope.test.js` | `utils/course.js` + `content/storage.js` — course identification from the URL, the v2 per-course cache schema, legacy-shape migration, and per-course deadline isolation. |
| `notes-finalize.test.js` | `content/caption.js` — the Stop / video-ended control flow: the final complete-notes pass must actually run, and must not hang the panel if generation wedges. |

Each of these exists because a real bug got through:

- **Local-timezone dates.** `new Date("2026-08-21")` parses as UTC midnight, which is
  the 20th for anyone west of Greenwich, so a deadline silently lost a day. Dates are
  built from regex-captured parts instead, and `duration.test.js` pins that behaviour
  including month, year and DST boundaries.
- **One shared cache bucket.** Stats, bookmarks and notes were stored under a single
  key, so opening a second course overwrote the first one's progress.
  `course-scope.test.js` has a test named after that bug.
- **A duplicate `handleStopClick`.** Two declarations in one scope means the later one
  wins; the winner skipped the final notes generation, so notes saved from the Stop
  button kept their "video is still playing" disclaimer. `notes-finalize.test.js`
  reproduces the `if (isGeneratingNotes) return;` guard that made it unreachable, and
  also asserts that no handler is declared twice in the source.

## How it works

The extension is plain browser JS: every module is a `const ACThing = (() => { ... })()`
IIFE that a `<script>` tag drops into one shared page scope. There are no
`module.exports`, so the tests load the real source files into a `node:vm` context that
imitates that page.

`helpers/load.js`
- `loadModules(files, opts)` — runs source files into one shared vm context in manifest
  order and returns the context. Read globals off it: `ctx.ACStorage`, `ctx.ACCourse`.
  `opts` takes `url` (drives `location`), `chrome`, `selectors` (a CSS-selector → text
  map for the fake `document`), and `title`.
- `extractFunction(relPath, name)` — pulls one function's verbatim source out of a file,
  for behaviour that lives in an internal function the IIFE never exports. The test then
  runs the shipped text, not a paraphrase of it. It throws loudly if the function moves
  or is renamed, which is deliberate: fix the test, don't delete the check.
- `plain(value)` — JSON round-trip. Objects built inside the vm carry that realm's
  `Object.prototype`, so `assert.deepStrictEqual` reports a mismatch between two
  structurally identical objects. Wrap either side in `plain()`.

`helpers/fake-chrome.js`
- `createChrome(store)` — in-memory `chrome.storage.local` with the callback signatures
  MV3 content scripts actually use, plus `onChanged`. The object you pass in *is* the
  backing store, so you can assert against it directly and drive several simulated page
  loads over one persistent profile.

Two things the vm setup will bite you on:

- Top-level `const` inside a vm context lands in the declarative scope, not on the
  context object, so nothing else can see it. `loadModules` rewrites the modules'
  leading `const ACThing = (() =>` to `var` — the only edit it makes. Top-level
  `function` declarations already become context properties, so they need no rewrite.
- `Date.now()` moves. Tests that involve dates pass an explicit `now` (`duration.test.js`
  pins 21 Aug 2026) rather than reading the clock.

## Adding a test

Name the file `tests/<area>.test.js` — the glob only picks up `*.test.js`, so anything
in `helpers/` is never run as a test.

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, plain } = require('./helpers/load');
const { createChrome } = require('./helpers/fake-chrome');

test('what should be true', async () => {
  const store = {};
  const { chrome } = createChrome(store);
  const ctx = loadModules(['utils/course.js', 'content/storage.js'], {
    url: 'https://www.apnacollege.in/path-player?courseid=demo',
    chrome,
  });
  await ctx.ACStorage.save({ summary: { totalVideos: 10 }, timestamp: 1 });
  assert.equal(store.ac_insights_cache.courses.demo.summary.totalVideos, 10);
});
```

Before trusting a new test, break the code it covers and check that it actually fails.
A test that passes against a deliberately broken build is testing nothing.

## Not covered

- **Bookmarks storage.** `content/bookmarks.js` carries its own v2 per-course schema and
  legacy migration (`readRaw`, `normalize`, `getStore`, `add`, `remove`) but exports only
  `{ injectBookmarkButtons, showPanel }`, so there is nothing to call directly. This is
  the most worthwhile test to add next — it's the same schema-migration code path that
  `course-scope.test.js` covers for stats, and it's the one place a bad migration would
  lose user data. `extractFunction` can reach those helpers with a stubbed `ACCourse`.
- **Notes storage.** There is no `content/notes.js`; notes live inside `content/caption.js`,
  which exposes `{ injectNotesButtons, showSettingsPrompt }`. Everything else there is
  DOM- or network-driven, which is why `notes-finalize.test.js` tests the control flow
  and not the storage.
- **`content/parser.js`.** It depends on five hardcoded Apna College selectors. A test
  can only assert against a saved HTML fixture, which would pass happily on the day the
  site's markup changes and the parser stops finding anything.
- **Gemini API calls and PDF export.** Network and binary output; not unit-testable
  without a fixture layer that doesn't exist yet.
- **Anything visual.** Panel layout, dragging, CSS.

## Packaging note

`tests/` and `package.json` are dev-only. Exclude them when zipping for the Chrome Web
Store — they're harmless but they pad the upload and appear in the store's source
listing.
