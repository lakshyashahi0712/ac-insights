// utils/course.js
// Ek hi Chrome profile me student ke multiple courses ho sakte hain (DSA + Web Dev).
// Har course ka data alag rakhne ke liye ek stable course ID chahiye.

const ACCourse = (() => {

  const REGISTRY_KEY = 'ac_insights_courses';
  const ACTIVE_KEY = 'ac_insights_active_course';
  const FALLBACK_ID = 'default';

  // Player URL is shape ka hota hai: /path-player?courseid=<id>&unit=<id>
  // Naam badal bhi jaye toh yeh list fallback de deti hai.
  const ID_PARAMS = [
    'courseid', 'course_id', 'course',
    'productid', 'product_id',
    'pathid', 'path_id'
  ];

  const TITLE_SELECTORS = [
    '.lrn-path-title',
    '.lrn-path-name',
    '.lrn-course-title',
    '[class*="path-title"]',
    '[class*="course-title"]',
    'header h1',
    'h1'
  ];

  let cachedFallbackId = null; // sirf DOM-derived ID cache hota hai, URL wala nahi
  let cachedName = null;

  function slugify(raw, maxLen = 60) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLen);
  }

  /** URL ke query aur hash — dono me params ho sakte hain */
  function queryStrings() {
    const out = [window.location.search || ''];
    const hash = window.location.hash || '';
    const q = hash.indexOf('?');
    if (q !== -1) out.push(hash.slice(q));
    return out;
  }

  /**
   * URL sabse bharosemand source hai — SPA me course switch hote hi
   * naya ID mil jata hai, isliye ise har baar dobara padhte hain.
   */
  function idFromUrl() {
    for (const qs of queryStrings()) {
      let params;
      try {
        params = new URLSearchParams(qs);
      } catch (e) {
        continue;
      }

      const lower = {};
      for (const [k, v] of params.entries()) lower[k.toLowerCase()] = v;

      for (const name of ID_PARAMS) {
        const val = lower[name];
        if (val && val.trim()) return slugify(val);
      }
    }
    return null;
  }

  /** Course ka display naam — popup ke switcher me dikhta hai */
  function nameFromDom() {
    for (const sel of TITLE_SELECTORS) {
      let el;
      try {
        el = document.querySelector(sel);
      } catch (e) {
        continue;
      }
      const text = el?.textContent?.trim();
      if (text && text.length > 2 && text.length <= 120) return text;
    }

    const docTitle = (document.title || '').split(/[|–—]/)[0].trim();
    if (docTitle && docTitle.length > 2) return docTitle;

    return null;
  }

  /**
   * Course ID. URL se mila toh wahi (authoritative), warna DOM ke naam se banaya
   * hua stable slug, warna 'default' — jisme behaviour purane single-bucket
   * jaisa hi rehta hai, toh worst case me koi regression nahi.
   */
  function id() {
    const fromUrl = idFromUrl();
    if (fromUrl) return fromUrl;

    if (cachedFallbackId) return cachedFallbackId;

    const domName = nameFromDom();
    cachedFallbackId = domName ? slugify(domName) || FALLBACK_ID : FALLBACK_ID;
    return cachedFallbackId;
  }

  function name() {
    if (cachedName) return cachedName;
    const found = nameFromDom(); // page render hone se pehle null aa sakta hai — cache na karo
    if (found) cachedName = found;
    return found || 'Course';
  }

  /**
   * Course ko registry me daalo aur active mark karo, taaki popup ko pata ho
   * ki kaun kaun se courses hain aur user abhi kis me hai.
   */
  async function register() {
    const courseId = id();
    if (!chrome.runtime?.id) return courseId;

    const courseName = name();

    return new Promise(resolve => {
      try {
        chrome.storage.local.get([REGISTRY_KEY], res => {
          const existing = res?.[REGISTRY_KEY];
          const registry = existing && typeof existing === 'object' ? existing : {};
          const prev = registry[courseId] || {};

          registry[courseId] = {
            // Naam abhi na mila ho toh purana rakho — 'Course' se overwrite na karo
            name: courseName !== 'Course' ? courseName : (prev.name || courseName),
            lastSeenAt: Date.now()
          };

          chrome.storage.local.set(
            { [REGISTRY_KEY]: registry, [ACTIVE_KEY]: courseId },
            () => resolve(courseId)
          );
        });
      } catch (e) {
        resolve(courseId);
      }
    });
  }

  return { id, name, register, slugify, REGISTRY_KEY, ACTIVE_KEY };
})();
