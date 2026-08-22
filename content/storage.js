// content/storage.js

const ACStorage = (() => {
  const KEY = 'ac_insights_cache';
  const SCHEMA_VERSION = 2;

  function emptyStore() {
    return { v: SCHEMA_VERSION, courses: {} };
  }

  async function readRaw() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([KEY], result => resolve(result?.[KEY] ?? null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Purana format single-course tha: { summary, timestamp } — jo dusra course
   * khulne pe overwrite ho jata tha. Naya format:
   *   { v: 2, courses: { <courseId>: { summary, timestamp, name } } }
   * Purana data delete nahi karte — jo course abhi khula hai uske andar adopt kar lete hain.
   */
  function normalize(value, adoptCourseId, adoptName) {
    if (!value || typeof value !== 'object') return emptyStore();

    if (value.v === SCHEMA_VERSION && value.courses && typeof value.courses === 'object') {
      return value;
    }

    const store = emptyStore();
    if (value.summary && adoptCourseId) {
      store.courses[adoptCourseId] = {
        summary: value.summary,
        timestamp: value.timestamp || Date.now(),
        name: adoptName || null
      };
    }
    return store;
  }

  async function save(data) {
    if (!chrome.runtime?.id) return; // extension context check, synchronous

    const courseId = ACCourse.id();
    const courseName = ACCourse.name();
    const store = normalize(await readRaw(), courseId, courseName);

    store.courses[courseId] = { ...data, name: courseName };

    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [KEY]: store }, () => {
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

  // ============================================================
  // DEADLINE (per course — "mujhe X tareekh tak khatam karna hai")
  // ============================================================

  const DEADLINE_KEY = 'ac_insights_deadline';

  async function loadDeadline() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([DEADLINE_KEY], result => {
          const map = result?.[DEADLINE_KEY];
          resolve(map && typeof map === 'object' ? (map[ACCourse.id()] || null) : null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  /** dateStr null/'' bhejo toh deadline hat jati hai */
  async function saveDeadline(dateStr) {
    if (!chrome.runtime?.id) return;

    return new Promise(resolve => {
      try {
        chrome.storage.local.get([DEADLINE_KEY], result => {
          const existing = result?.[DEADLINE_KEY];
          const map = existing && typeof existing === 'object' ? existing : {};

          if (dateStr) map[ACCourse.id()] = dateStr;
          else delete map[ACCourse.id()];

          chrome.storage.local.set({ [DEADLINE_KEY]: map }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  return { save, loadDeadline, saveDeadline, KEY };
})();