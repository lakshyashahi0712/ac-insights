// content/storage.js

const ACStorage = (() => {
  const KEY = 'ac_insights_cache';

  async function save(data) {
    if (!chrome.runtime?.id) return; // extension context check, synchronous
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [KEY]: data }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[AC Insights] Storage save failed:', chrome.runtime.lastError.message);
          }
          resolve();
        });
      } catch (e) {
        console.warn('[AC Insights] Storage save failed — extension reloaded?');
        resolve();
      }
    });
}

  async function load() {
    try {
      return new Promise(resolve => {
        chrome.storage.local.get([KEY], result => {
          resolve(result[KEY] || null);
        });
      });
    } catch (e) {
      return null;
    }
  }

  async function clear() {
    try {
      return new Promise(resolve => {
        chrome.storage.local.remove([KEY], resolve);
      });
    } catch (e) {}
  }

  return { save };
})();