'use strict';

/**
 * In-memory stand-in for the slice of `chrome.*` the extension actually touches.
 *
 * Deliberately callback-style, because that's the API MV3 content scripts use
 * (`chrome.storage.local.get(keys, cb)`) — the promise flavour only exists in
 * some browsers, and the extension never relies on it.
 *
 * The object passed in IS the backing store, not a copy: mutations stay visible
 * to the caller, which is what lets one test drive several "page loads" over a
 * single persistent profile.
 */
function createChrome(store = {}) {
  const listeners = [];

  function pick(keys) {
    if (keys === null || keys === undefined) return { ...store };
    if (typeof keys === 'string') keys = [keys];

    const out = {};
    if (Array.isArray(keys)) {
      for (const k of keys) if (k in store) out[k] = store[k];
      return out;
    }
    // Object form: property names with default values
    for (const [k, fallback] of Object.entries(keys)) {
      out[k] = k in store ? store[k] : fallback;
    }
    return out;
  }

  function notify(changes) {
    if (Object.keys(changes).length === 0) return;
    for (const fn of [...listeners]) fn(changes, 'local');
  }

  const local = {
    get(keys, cb) {
      const result = pick(keys);
      if (cb) cb(result);
    },
    set(obj, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = v;
      }
      if (cb) cb();
      notify(changes);
    },
    remove(keys, cb) {
      const changes = {};
      for (const k of (Array.isArray(keys) ? keys : [keys])) {
        if (k in store) {
          changes[k] = { oldValue: store[k] };
          delete store[k];
        }
      }
      if (cb) cb();
      notify(changes);
    },
    clear(cb) {
      for (const k of Object.keys(store)) delete store[k];
      if (cb) cb();
    },
  };

  const chrome = {
    runtime: { id: 'test-extension-id', lastError: null },
    storage: {
      local,
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i !== -1) listeners.splice(i, 1);
        },
      },
    },
  };

  // `store` is the caller's own object — assert against it to see what really landed.
  return { chrome, store };
}

module.exports = { createChrome };
