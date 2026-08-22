'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadModules, plain } = require('./helpers/load');

const { DurationUtils: D } = loadModules(['utils/duration.js']);

// Fixed "today" so these never break when the calendar moves: 21 Aug 2026, local.
const NOW = new Date(2026, 7, 21);

test('parseToSeconds handles the platform\'s duration formats', () => {
  assert.equal(D.parseToSeconds('12:34'), 754);
  assert.equal(D.parseToSeconds('1:02:45'), 3765);
  assert.equal(D.parseToSeconds('9:05'), 545);
  assert.equal(D.parseToSeconds('1h 20m'), 4800);
  assert.equal(D.parseToSeconds('45 min'), 2700);
  assert.equal(D.parseToSeconds('2h'), 7200);
  assert.equal(D.parseToSeconds(''), 0);
  assert.equal(D.parseToSeconds(null), 0);
});

test('formatDuration', () => {
  assert.equal(D.formatDuration(0), '—');
  assert.equal(D.formatDuration(-5), '—');
  assert.equal(D.formatDuration(1805), '30m');
  assert.equal(D.formatDuration(3600), '1h 0m');
  assert.equal(D.formatDuration(240000), '66h 40m');
});

test('studyPlan: forward planner (pace -> days)', () => {
  assert.deepEqual(plain(D.studyPlan(7200)), [
    { pace: '30m/day', days: 4 },
    { pace: '1h/day', days: 2 },
    { pace: '2h/day', days: 1 },
  ]);
});

test('todayISO pads month and day', () => {
  assert.equal(D.todayISO(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(D.todayISO(NOW), '2026-08-21');
});

test('daysUntil counts today as a day', () => {
  assert.equal(D.daysUntil('2026-08-21', NOW), 1, 'a deadline of today = 1 day to do it in');
  assert.equal(D.daysUntil('2026-08-22', NOW), 2);
  assert.equal(D.daysUntil('2026-08-20', NOW), 0, 'yesterday');
  assert.equal(D.daysUntil('2026-08-28', NOW), 8);
});

test('daysUntil crosses month, year and DST boundaries', () => {
  assert.equal(D.daysUntil('2026-09-01', NOW), 12);
  assert.equal(D.daysUntil('2027-01-02', new Date(2026, 11, 30)), 4);
  // US spring-forward is 8 Mar 2026 — a 23-hour day must not eat a day
  assert.equal(D.daysUntil('2026-03-09', new Date(2026, 2, 7)), 3);
});

test('daysUntil rejects anything that is not YYYY-MM-DD', () => {
  // Guards the reason dates are parsed from parts: new Date("2026-08-21") is
  // UTC midnight, which lands on the 20th for anyone west of Greenwich.
  assert.equal(D.daysUntil('next friday', NOW), null);
  assert.equal(D.daysUntil('21-08-2026', NOW), null);
  assert.equal(D.daysUntil('', NOW), null);
  assert.equal(D.daysUntil(null, NOW), null);
  assert.equal(D.daysUntil(undefined, NOW), null);
});

test('requiredPace: comfortable deadline', () => {
  const p = D.requiredPace(240000, '2026-12-31', 100, NOW);
  assert.equal(p.days, 133);
  assert.equal(p.perDay, '30m');
  assert.equal(p.videosPerDay, 1);
  assert.equal(p.heavy, false);
  assert.equal(p.impossible, false);
});

test('requiredPace: tight deadline is flagged heavy', () => {
  const p = D.requiredPace(240000, '2026-09-04', 100, NOW);
  assert.equal(p.days, 15);
  assert.equal(p.perDay, '4h 26m');
  assert.equal(p.videosPerDay, 7);
  assert.equal(p.heavy, true, 'over 4h/day');
  assert.equal(p.impossible, false, 'still fits in a day');
});

test('requiredPace: a deadline that cannot physically be met', () => {
  const p = D.requiredPace(240000, '2026-08-21', 100, NOW);
  assert.equal(p.days, 1);
  assert.equal(p.perDay, '66h 40m');
  assert.equal(p.impossible, true, '66h of video in one day');
});

test('requiredPace: past date, finished course, bad input', () => {
  assert.deepEqual(plain(D.requiredPace(240000, '2026-08-20', 100, NOW)), { past: true, days: 0 });
  assert.equal(D.requiredPace(0, '2026-12-31', 0, NOW).done, true);
  assert.equal(D.requiredPace(-10, '2026-12-31', 0, NOW).done, true);
  assert.equal(D.requiredPace(240000, 'soon', 100, NOW), null);
});

test('requiredPace: omits the videos/day hint when the count is unknown', () => {
  const p = D.requiredPace(3600, '2026-08-28', 0, NOW);
  assert.equal(p.videosPerDay, 0);
  assert.equal(p.perDay, '7m');
});
