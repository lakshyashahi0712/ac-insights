// content/storage.js

const ACStorage = (() => {
  const KEY = 'ac_insights_cache';

  async function save(data) {
    try {
      return new Promise(resolve => {
        chrome.storage.local.set({ [KEY]: data }, resolve);
      });
    } catch (e) {
      console.warn('[AC Insights] Storage save failed — extension reloaded?');
    }
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

  return { save, load, clear };
})();