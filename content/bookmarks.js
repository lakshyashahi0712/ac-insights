// content/bookmarks.js

const ACBookmarks = (() => {
  const STORAGE_KEY = 'ac_insights_bookmarks';
  const SCHEMA_VERSION = 2;

  // --- Storage ---

  function emptyStore() {
    return { v: SCHEMA_VERSION, courses: {} };
  }

  async function readRaw() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([STORAGE_KEY], result => resolve(result?.[STORAGE_KEY] ?? null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Pehle sab bookmarks ek flat array me the — chahe kisi bhi course ke ho.
   * Ab per-course: { v: 2, courses: { <courseId>: [...] } }
   * Purana array current course ka maan kar adopt kar lete hain (kuch khota nahi).
   */
  function normalize(value, adoptCourseId) {
    if (Array.isArray(value)) {
      const store = emptyStore();
      if (adoptCourseId) store.courses[adoptCourseId] = value;
      return store;
    }
    if (value && value.v === SCHEMA_VERSION && value.courses && typeof value.courses === 'object') {
      return value;
    }
    return emptyStore();
  }

  async function getStore() {
    return normalize(await readRaw(), ACCourse.id());
  }

  async function getAll() {
    const store = await getStore();
    return store.courses[ACCourse.id()] || [];
  }

  async function setAll(list) {
    const store = await getStore();
    store.courses[ACCourse.id()] = list;
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  }

  async function add(video) {
    const bookmarks = await getAll();
    const already = bookmarks.find(b => b.title === video.title);
    if (already) return;
    bookmarks.push({
      title: video.title,
      topicTitle: video.topicTitle,
      duration: video.duration,
      savedAt: Date.now(),
    });
    await setAll(bookmarks);
  }

  async function remove(title) {
    const bookmarks = await getAll();
    await setAll(bookmarks.filter(b => b.title !== title));
  }

  async function isBookmarked(title) {
    const bookmarks = await getAll();
    return bookmarks.some(b => b.title === title);
  }

  // --- UI ---

  // Inject a bookmark button next to each video row
  async function injectBookmarkButtons() {
    const items = document.querySelectorAll('li.lrn-path-cont');
    const bookmarks = await getAll();
    const bookmarkedTitles = new Set(bookmarks.map(b => b.title));

    for (const item of items) {
      if (item.querySelector('.ac-bookmark-btn')) continue;

      const titleEl = item.querySelector('.lrn-path-cont-name');
      const durationEl = item.querySelector('.lrn-path-cont-info.video-duration');
      const topicEl = item.closest('.lrn-path-chapter.drip-section')
                          ?.querySelector('.lrn-path-chapter-name-txt');

      if (!titleEl) continue;

      const title = titleEl.textContent.trim();
      const topicTitle = topicEl ? topicEl.textContent.trim() : '';
      const duration = durationEl ? durationEl.textContent.trim() : '';

      const bookmarked = bookmarkedTitles.has(title);  // ← instant, no await

      const btn = document.createElement('button');
      btn.className = `ac-bookmark-btn ${bookmarked ? 'active' : ''}`;
      btn.title = bookmarked ? 'Remove bookmark' : 'Bookmark this video';
      btn.innerHTML = bookmarked ? '🔖' : '🏷️';

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isNowBookmarked = btn.classList.contains('active');

        if (isNowBookmarked) {
          await remove(title);
          btn.classList.remove('active');
          btn.innerHTML = '🏷️';
          btn.title = 'Bookmark this video';
        } else {
          await add({ title, topicTitle, duration });
          btn.classList.add('active');
          btn.innerHTML = '🔖';
          btn.title = 'Remove bookmark';
        }
      });

      const extrasEl = item.querySelector('.lrn-path-cont-extras');
      if (extrasEl) extrasEl.appendChild(btn);
    }
}

  // Bookmarks panel — triggered from popup
  async function showPanel() {
    document.getElementById('ac-bookmarks-panel')?.remove();

    const bookmarks = await getAll();
    const panel = document.createElement('div');
    panel.id = 'ac-bookmarks-panel';

    if (bookmarks.length === 0) {
      panel.innerHTML = `
        <div class="ac-bm-header">
          <span>🔖 Bookmarks</span>
          <button id="ac-bm-close">✕</button>
        </div>
        <div class="ac-bm-empty">
          <p>No bookmarks in this course yet!</p>
          <p>Click 🏷️ on any video to bookmark it.</p>
        </div>
      `;
    } else {
      const items = bookmarks.map(b => `
        <div class="ac-bm-item" data-title="${b.title}">
          <div class="ac-bm-item-info">
            <p class="ac-bm-title">${b.title}</p>
            <p class="ac-bm-topic">${b.topicTitle} · ${b.duration}</p>
          </div>
          <button class="ac-bm-remove" data-title="${b.title}">✕</button>
        </div>
      `).join('');

      panel.innerHTML = `
        <div class="ac-bm-header">
          <span>🔖 Bookmarks (${bookmarks.length})</span>
          <button id="ac-bm-close">✕</button>
        </div>
        <div class="ac-bm-list">${items}</div>
      `;
    }

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-bm-header');

    // Close button
    document.getElementById('ac-bm-close')
      ?.addEventListener('click', () => panel.remove());

    // Click on item → jump to video
    panel.querySelectorAll('.ac-bm-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('ac-bm-remove')) return;
        jumpToVideoByTitle(el.dataset.title);
        panel.remove();
      });
    });

    // Remove button
    panel.querySelectorAll('.ac-bm-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const title = btn.dataset.title;
        await remove(title);

        // Also update the bookmark button on the page
        document.querySelectorAll('.ac-bookmark-btn.active')
          .forEach(b => {
            const row = b.closest('li.lrn-path-cont');
            const t = row?.querySelector('.lrn-path-cont-name')?.textContent.trim();
            if (t === title) {
              b.classList.remove('active');
              b.innerHTML = '🏷️';
            }
          });

        btn.closest('.ac-bm-item').remove();

        // If the list is now empty
        const remaining = panel.querySelectorAll('.ac-bm-item').length;
        if (remaining === 0) {
          panel.querySelector('.ac-bm-list').innerHTML =
            '<div class="ac-bm-empty"><p>No bookmarks left!</p></div>';
        }
      });
    });
  }

  function jumpToVideoByTitle(title) {
    const items = document.querySelectorAll('li.lrn-path-cont');
    let target = null;

    for (const item of items) {
      const t = item.querySelector('.lrn-path-cont-name')?.textContent.trim();
      if (t === title) {
        target = item;
        break;
      }
    }

    if (!target) {
      alert(`Video "${title}" is not visible. Try expanding its topic first.`);
      return;
    }

    const chapter = target.closest('.lrn-path-chapter');
    const isOpen = chapter?.classList.contains('lrn-path-chapter-open');

    if (chapter && !isOpen) {
      const chapterTitleTxt = chapter.querySelector('.lrn-path-chapter-name-txt');
      const chapterTitleWrap = chapter.querySelector('.lrn-path-chapter-name');
      (chapterTitleTxt || chapterTitleWrap)?.click();
    }

    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const link = target.querySelector('.lrn-path-cont-link') || target;
        link.click();
      }, 500);
    }, 500);
}

return { injectBookmarkButtons, showPanel };
})();