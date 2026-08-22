'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * The extension has no build step: every module is a `const ACThing = (() => {...})()`
 * IIFE loaded by a browser <script> tag, sharing one global scope.
 *
 * In a vm context a top-level `const` goes into the declarative scope rather than
 * onto the context object, so neither the test nor the modules loaded afterwards
 * could see it. Rewriting to `var` puts the binding where a real page's globals
 * live — the only change made to the source, and it doesn't affect behaviour.
 */
function toContextGlobal(src) {
  return src.replace(/^const (\w+) = \(\(\) =>/gm, 'var $1 = (() =>');
}

function readModule(relPath) {
  return toContextGlobal(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

/**
 * Minimal `document`: the modules under test only ever read `querySelector`
 * (for course titles) and `document.title`.
 *
 * @param selectors  map of CSS selector -> text content that selector should return
 */
function createDocument({ selectors = {}, title = '' } = {}) {
  return {
    title,
    querySelector: (sel) => (sel in selectors ? { textContent: selectors[sel] } : null),
    querySelectorAll: () => [],
  };
}

function createLocation(url) {
  const u = new URL(url);
  return {
    href: u.href,
    search: u.search,
    hash: u.hash,
    pathname: u.pathname,
    origin: u.origin,
    hostname: u.hostname,
  };
}

/**
 * Loads extension source files into one shared vm context, the way manifest.json
 * loads them into a page. Pass them in manifest order — later modules may depend
 * on globals defined by earlier ones.
 *
 * @returns the context object; read globals off it (e.g. ctx.ACStorage)
 */
function loadModules(files, options = {}) {
  const {
    url = 'https://www.apnacollege.in/path-player',
    chrome,
    document: doc,
    title,
    selectors,
  } = options;

  const ctx = {
    console, Math, Date, JSON, Promise, URL, URLSearchParams,
    Object, Array, String, Number, Boolean, RegExp, Error, Map, Set,
    isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    chrome,
    location: createLocation(url),
    document: doc || createDocument({ selectors, title }),
  };
  ctx.window = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(readModule(file), ctx, { filename: file });
  }
  return ctx;
}

/**
 * Pulls one function's verbatim source text out of a module, for the cases where
 * the behaviour under test lives in an internal function the IIFE doesn't export.
 * Matches a function declared at the IIFE's own indent level (two spaces).
 *
 * Throws loudly rather than silently testing nothing if the source moves.
 */
function extractFunction(relPath, name) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const re = new RegExp(`\\n  (?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`, 'm');
  const match = re.exec(src);
  if (!match) {
    throw new Error(
      `extractFunction: could not find "${name}" in ${relPath} at the expected indent. ` +
      `If it was renamed, moved or re-indented, update the test — do not delete this check.`
    );
  }
  return match[0];
}

/**
 * Values built inside the vm carry the vm realm's Object.prototype, so
 * assert.deepStrictEqual reports a mismatch between two structurally identical
 * objects. Round-tripping through JSON hands back a plain host-realm value.
 */
function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

module.exports = { loadModules, readModule, createDocument, extractFunction, plain, ROOT };
