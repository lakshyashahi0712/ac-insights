// content/bookmarks.js

const ACBookmarks = (() => {
  const STORAGE_KEY = 'ac_insights_bookmarks';

  // --- Storage ---

  async function getAll() {
    return new Promise(resolve => {
      chrome.storage.local.get([STORAGE_KEY], result => {
        resolve(result[STORAGE_KEY] || []);
      });
    });
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
    await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
  }

  async function remove(title) {
    const bookmarks = await getAll();
    const updated = bookmarks.filter(b => b.title !== title);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  }

  async function isBookmarked(title) {
    const bookmarks = await getAll();
    return bookmarks.some(b => b.title === title);
  }

  // --- UI ---

  // Har video row ke paas bookmark button inject karo
  async function injectBookmarkButtons() {
    const items = document.querySelectorAll('li.lrn-path-cont');

    for (const item of items) {
      // Already injected check
      if (item.querySelector('.ac-bookmark-btn')) continue;

      const titleEl = item.querySelector('.lrn-path-cont-name');
      const durationEl = item.querySelector('.lrn-path-cont-info.video-duration');
      const topicEl = item.closest('.lrn-path-chapter.drip-section')
                          ?.querySelector('.lrn-path-chapter-name-txt');

      if (!titleEl) continue;

      const title = titleEl.textContent.trim();
      const topicTitle = topicEl ? topicEl.textContent.trim() : '';
      const duration = durationEl ? durationEl.textContent.trim() : '';

      const bookmarked = await isBookmarked(title);

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

      // Extras div ke andar add karo
      const extrasEl = item.querySelector('.lrn-path-cont-extras');
      if (extrasEl) extrasEl.appendChild(btn);
    }
  }

  // Bookmarks panel — popup se trigger hoga
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
          <p>No bookmarks yet!</p>
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

        // Page pe bookmark button bhi update karo
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

        // Agar list empty ho gayi
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
    for (const item of items) {
      const t = item.querySelector('.lrn-path-cont-name')?.textContent.trim();
      if (t === title) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.click();
        return;
      }
    }
    alert(`Video "${title}" is not visible. Please expand its topic first.`);
  }

  return { injectBookmarkButtons, showPanel, getAll };
})();