'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, plain } = require('./helpers/load');
const { createChrome } = require('./helpers/fake-chrome');

const CACHE_KEY = 'ac_insights_cache';
const DEADLINE_KEY = 'ac_insights_deadline';
const REGISTRY_KEY = 'ac_insights_courses';
const ACTIVE_KEY = 'ac_insights_active_course';

const DSA = 'https://www.apnacollege.in/path-player?courseid=sigma-plus-dsa&unit=7';
const WEB = 'https://www.apnacollege.in/path-player?courseid=web-dev-101';

/**
 * Simulates one page load: fresh module scope (module-level caches reset, as they
 * would on a real navigation) over a persistent storage object.
 */
function openCourse(store, url, opts = {}) {
  const { chrome } = createChrome(store);
  return loadModules(['utils/course.js', 'content/storage.js'], { url, chrome, ...opts });
}

// ============================================================
// Course identity
// ============================================================

test('course id comes from the URL', () => {
  assert.equal(openCourse({}, DSA).ACCourse.id(), 'sigma-plus-dsa');
});

test('course id accepts the known param aliases and is case-insensitive', () => {
  const base = 'https://www.apnacollege.in/path-player?';
  for (const param of ['courseid', 'course_id', 'course', 'productid', 'product_id', 'pathid', 'path_id']) {
    assert.equal(openCourse({}, `${base}${param}=abc-1`).ACCourse.id(), 'abc-1', param);
  }
  assert.equal(openCourse({}, `${base}CourseID=Abc-1`).ACCourse.id(), 'abc-1', 'mixed case');
});

test('course id also reads params out of the hash (SPA routers)', () => {
  const ctx = openCourse({}, 'https://www.apnacollege.in/player#/unit?courseid=hash-course');
  assert.equal(ctx.ACCourse.id(), 'hash-course');
});

test('course id falls back to the page title, then to "default"', () => {
  const titled = openCourse({}, 'https://www.apnacollege.in/player', {
    selectors: { '.lrn-path-title': 'Sigma Plus 6.0 (DSA + Dev)' },
  });
  assert.equal(titled.ACCourse.id(), 'sigma-plus-6-0-dsa-dev');
  assert.equal(titled.ACCourse.name(), 'Sigma Plus 6.0 (DSA + Dev)');

  const bare = openCourse({}, 'https://www.apnacollege.in/player');
  assert.equal(bare.ACCourse.id(), 'default', 'worst case behaves like the old single bucket');
  assert.equal(bare.ACCourse.name(), 'Course');
});

test('slugify', () => {
  const { ACCourse } = openCourse({}, DSA);
  assert.equal(ACCourse.slugify('  Web Dev 101!  '), 'web-dev-101');
  assert.equal(ACCourse.slugify('---'), '');
  assert.equal(ACCourse.slugify(null), '');
  assert.equal(ACCourse.slugify('x'.repeat(200)).length, 60, 'capped');
});

test('register records the course and marks it active', async () => {
  const store = {};
  const ctx = openCourse(store, DSA, { selectors: { 'h1': 'Sigma Plus DSA' } });
  await ctx.ACCourse.register();

  assert.equal(store[ACTIVE_KEY], 'sigma-plus-dsa');
  assert.equal(store[REGISTRY_KEY]['sigma-plus-dsa'].name, 'Sigma Plus DSA');
  assert.equal(typeof store[REGISTRY_KEY]['sigma-plus-dsa'].lastSeenAt, 'number');
});

test('register keeps a known name when the title has not rendered yet', async () => {
  const store = {};
  await openCourse(store, DSA, { selectors: { 'h1': 'Sigma Plus DSA' } }).ACCourse.register();
  await openCourse(store, DSA).ACCourse.register();   // no title in the DOM this time

  assert.equal(store[REGISTRY_KEY]['sigma-plus-dsa'].name, 'Sigma Plus DSA',
    'must not be overwritten with the "Course" placeholder');
});

test('register accumulates courses rather than replacing them', async () => {
  const store = {};
  await openCourse(store, DSA).ACCourse.register();
  await openCourse(store, WEB).ACCourse.register();

  assert.deepEqual(Object.keys(store[REGISTRY_KEY]).sort(), ['sigma-plus-dsa', 'web-dev-101']);
  assert.equal(store[ACTIVE_KEY], 'web-dev-101', 'most recent wins');
});

// ============================================================
// Cached course stats
// ============================================================

test('save scopes stats under the current course', async () => {
  const store = {};
  const ctx = openCourse(store, DSA, { selectors: { 'h1': 'Sigma Plus DSA' } });
  await ctx.ACStorage.save({ summary: { totalVideos: 412, completedVideos: 137 }, timestamp: 111 });

  assert.equal(store[CACHE_KEY].v, 2);
  assert.deepEqual(plain(store[CACHE_KEY].courses['sigma-plus-dsa']), {
    summary: { totalVideos: 412, completedVideos: 137 },
    timestamp: 111,
    name: 'Sigma Plus DSA',
  });
});

test('two courses do not overwrite each other (the original bug)', async () => {
  const store = {};
  await openCourse(store, DSA).ACStorage.save({ summary: { totalVideos: 412 }, timestamp: 1 });
  await openCourse(store, WEB).ACStorage.save({ summary: { totalVideos: 96 }, timestamp: 2 });

  assert.equal(store[CACHE_KEY].courses['sigma-plus-dsa'].summary.totalVideos, 412);
  assert.equal(store[CACHE_KEY].courses['web-dev-101'].summary.totalVideos, 96);
});

test('legacy single-course cache is adopted, not crashed on', async () => {
  // Pre-v2 shape: one flat { summary, timestamp } for whatever loaded last
  const store = { [CACHE_KEY]: { summary: { totalVideos: 300 }, timestamp: 999 } };
  await openCourse(store, DSA).ACStorage.save({ summary: { totalVideos: 412 }, timestamp: 1000 });

  assert.equal(store[CACHE_KEY].v, 2);
  assert.equal(store[CACHE_KEY].summary, undefined, 'flat key is gone');
  assert.equal(store[CACHE_KEY].courses['sigma-plus-dsa'].summary.totalVideos, 412);
});

test('a corrupt cache payload is replaced, not fatal', async () => {
  for (const bad of ['nonsense', 42, [], null]) {
    const store = { [CACHE_KEY]: bad };
    await openCourse(store, DSA).ACStorage.save({ summary: { totalVideos: 5 }, timestamp: 1 });
    assert.equal(store[CACHE_KEY].courses['sigma-plus-dsa'].summary.totalVideos, 5,
      `payload: ${JSON.stringify(bad)}`);
  }
});

// ============================================================
// Deadlines
// ============================================================

test('deadline round-trips for one course', async () => {
  const store = {};
  const ctx = openCourse(store, DSA);
  assert.equal(await ctx.ACStorage.loadDeadline(), null, 'nothing saved yet');

  await ctx.ACStorage.saveDeadline('2026-12-31');
  assert.equal(await ctx.ACStorage.loadDeadline(), '2026-12-31');
  assert.deepEqual(plain(store[DEADLINE_KEY]), { 'sigma-plus-dsa': '2026-12-31' });
});

test('each course keeps its own deadline', async () => {
  const store = {};
  await openCourse(store, DSA).ACStorage.saveDeadline('2026-12-31');

  const web = openCourse(store, WEB);
  assert.equal(await web.ACStorage.loadDeadline(), null, 'no bleed from the other course');
  await web.ACStorage.saveDeadline('2026-09-15');

  assert.equal(await openCourse(store, DSA).ACStorage.loadDeadline(), '2026-12-31');
  assert.equal(await openCourse(store, WEB).ACStorage.loadDeadline(), '2026-09-15');
});

test('clearing a deadline leaves other courses alone', async () => {
  const store = {};
  await openCourse(store, DSA).ACStorage.saveDeadline('2026-12-31');
  await openCourse(store, WEB).ACStorage.saveDeadline('2026-09-15');

  await openCourse(store, DSA).ACStorage.saveDeadline(null);
  assert.equal(await openCourse(store, DSA).ACStorage.loadDeadline(), null);
  assert.equal(await openCourse(store, WEB).ACStorage.loadDeadline(), '2026-09-15');

  await openCourse(store, WEB).ACStorage.saveDeadline('');   // empty string clears too
  assert.equal(await openCourse(store, WEB).ACStorage.loadDeadline(), null);
});

test('a corrupt deadline payload reads as null and is overwritten', async () => {
  const store = { [DEADLINE_KEY]: 'not-an-object' };
  const ctx = openCourse(store, DSA);
  assert.equal(await ctx.ACStorage.loadDeadline(), null);

  await ctx.ACStorage.saveDeadline('2026-10-01');
  assert.equal(await ctx.ACStorage.loadDeadline(), '2026-10-01');
});
