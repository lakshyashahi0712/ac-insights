'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extractFunction } = require('./helpers/load');

/**
 * Guards the Stop-button bug: two copies of `handleStopClick` existed, the live one
 * skipped the final complete generation, so stopping a lecture saved notes that still
 * carried the "video is still playing" disclaimer. `handleVideoEnded` had the same
 * race — neither waited for `isGeneratingNotes`, and `updateLiveNotes` returns
 * immediately while that flag is set.
 *
 * These functions are internal to the caption.js IIFE, so their source is pulled
 * verbatim out of the file rather than imported.
 */
// Function declarations at the top level of a (non-strict) vm script become
// properties of the context, so the test can call them and read the flags they set.
const CODE = ['waitForPendingWork', 'finishNotesSession', 'handleVideoEnded', 'handleStopClick']
  .map((name) => extractFunction('content/caption.js', name))
  .join('\n');

/**
 * @param clearAfterPolls  polls before the busy flags clear (Infinity = never,
 *                         i.e. the timeout path)
 */
function harness({ transcript = 'kuch transcript hai', generating = false, transcribing = false, clearAfterPolls = 0 } = {}) {
  const log = [];
  let polls = 0;

  const ctx = {
    console, Math, JSON, Promise,
    isRecording: true,
    isGeneratingNotes: generating,
    isTranscribingChunk: transcribing,
    accumulatedTranscript: transcript,
    currentVideoTitle: 'Lecture 42',

    // Simulated time: no real delay, the loop's own `waited` counter is the clock
    setTimeout: (fn) => {
      polls++;
      if (polls >= clearAfterPolls) {
        ctx.isGeneratingNotes = false;
        ctx.isTranscribingChunk = false;
      }
      setImmediate(fn);
    },

    stopLiveTranscription: () => log.push('stopLiveTranscription'),
    stopStabilityWatcher: () => log.push('stopStabilityWatcher'),
    updateNotesStatusMessage: () => log.push('status'),
    finalizeAndShowNotes: async (title) => { log.push('finalize:' + title); },

    // Mirrors the real guard at the top of updateLiveNotes — the whole reason the
    // final pass has to wait for isGeneratingNotes rather than fire blindly.
    updateLiveNotes: async (isFinal) => {
      if (ctx.isGeneratingNotes) { log.push('SKIPPED-BY-GUARD'); return; }
      log.push('finalGeneration(isFinal=' + isFinal + ')');
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);

  return { ctx, log, polls: () => polls, call: (fn) => vm.runInContext(`${fn}()`, ctx) };
}

test('Stop: idle -> one final complete generation, then finalize', async () => {
  const h = harness();
  await h.call('handleStopClick');
  assert.deepEqual(h.log, ['stopLiveTranscription', 'finalGeneration(isFinal=true)', 'finalize:Lecture 42']);
});

test('Stop: mid-generation -> waits for the guard to clear, then generates', async () => {
  const h = harness({ generating: true, clearAfterPolls: 3 });
  await h.call('handleStopClick');
  assert.deepEqual(h.log, ['stopLiveTranscription', 'finalGeneration(isFinal=true)', 'finalize:Lecture 42']);
  assert.ok(h.polls() >= 3, 'should actually have waited');
  assert.ok(!h.log.includes('SKIPPED-BY-GUARD'), 'this is the regression: the final pass must not be skipped');
});

test('Stop: mid-transcription -> waits for the chunk, then generates', async () => {
  const h = harness({ transcribing: true, clearAfterPolls: 2 });
  await h.call('handleStopClick');
  assert.deepEqual(h.log, ['stopLiveTranscription', 'finalGeneration(isFinal=true)', 'finalize:Lecture 42']);
});

test('Stop: nothing transcribed -> no generation, still finalizes the panel', async () => {
  const h = harness({ transcript: '   ' });
  await h.call('handleStopClick');
  assert.deepEqual(h.log, ['stopLiveTranscription', 'finalize:Lecture 42']);
});

test('Stop: a wedged generation cannot hang the panel', async () => {
  const h = harness({ generating: true, clearAfterPolls: Infinity });
  await h.call('handleStopClick');
  assert.equal(h.polls(), 20, '8000ms budget / 400ms poll');
  assert.deepEqual(h.log, ['stopLiveTranscription', 'SKIPPED-BY-GUARD', 'finalize:Lecture 42'],
    'gives up on the final pass but still shows the notes');
});

test('Video end: mid-generation -> final pass no longer skipped', async () => {
  const h = harness({ generating: true, clearAfterPolls: 3 });
  await h.call('handleVideoEnded');
  assert.deepEqual(h.log,
    ['stopStabilityWatcher', 'status', 'finalGeneration(isFinal=true)', 'finalize:Lecture 42']);
});

test('Video end: keeps its longer 15s budget', async () => {
  const h = harness({ generating: true, clearAfterPolls: Infinity });
  await h.call('handleVideoEnded');
  assert.equal(h.polls(), 38, '15000ms budget / 400ms poll');
});

test('Video end: does nothing when not recording', async () => {
  const h = harness();
  h.ctx.isRecording = false;
  await h.call('handleVideoEnded');
  assert.deepEqual(h.log, []);
});

test('neither handler is declared twice in the source', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'content', 'caption.js'), 'utf8');

  for (const name of ['handleStopClick', 'handleVideoEnded', 'renderScreenshotsStrip', 'finishNotesSession']) {
    const hits = [...src.matchAll(new RegExp(`(?:^|})\\s*(?:async\\s+)?function ${name}\\s*\\(`, 'gm'))];
    assert.equal(hits.length, 1, `${name} should be declared exactly once, found ${hits.length}`);
  }
});
