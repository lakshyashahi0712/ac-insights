// content/search.js

const ACSearch = (() => {
  let allVideos = [];
  let searchModal = null;
  let isOpen = false;
  let attachedIframeDoc = null;

  function buildIndex() {
    const data = ACParser.parseCourse();
    if (!data) return;

    allVideos = [];
    data.topics.forEach(topic => {
      topic.videos.forEach((video, i) => {
        allVideos.push({
          topicTitle: topic.title,
          videoTitle: video.title || `Video ${i + 1}`,
          duration: DurationUtils.formatDuration(video.seconds),
          isCompleted: video.isCompleted,
          element: video.element,
        });
      });
    });

    console.log(`[AC Insights] Search index built: ${allVideos.length} videos`);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    buildIndex();
    selectedIndex = -1;
    render();
  }

  function close() {
    isOpen = false;
    searchModal?.remove();
    searchModal = null;
  }

  function render() {
    searchModal?.remove();
    searchModal = document.createElement('div');
    searchModal.id = 'ac-search-modal';
    searchModal.innerHTML = `
      <div id="ac-search-backdrop"></div>
      <div id="ac-search-box">
        <div id="ac-search-header">
          <span>🔍</span>
          <input id="ac-search-input" placeholder="Search lectures..." autofocus />
          <kbd>ESC</kbd>
        </div>
        <div id="ac-search-results"></div>
        <div id="ac-search-footer">
          <span>${allVideos.length} lectures</span>
          <span>↑↓ navigate · Enter to open</span>
        </div>
      </div>
    `;

    document.body.appendChild(searchModal);

    document.getElementById('ac-search-input').addEventListener('input', (e) => {
      performSearch(e.target.value.trim());
    });

    document.getElementById('ac-search-backdrop').addEventListener('click', close);

    performSearch('');
  }

  function performSearch(query) {
    const resultsEl = document.getElementById('ac-search-results');
    if (!resultsEl) return;

    const filtered = query.length === 0
      ? allVideos.slice(0, 20)
      : allVideos.filter(v =>
          v.videoTitle.toLowerCase().includes(query.toLowerCase()) ||
          v.topicTitle.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 20);

    if (filtered.length === 0) {
      resultsEl.innerHTML = `<div class="ac-search-empty">No results for "${query}"</div>`;
      return;
    }

    resultsEl.innerHTML = filtered.map((v, i) => `
      <div class="ac-search-item ${v.isCompleted ? 'completed' : ''}" data-index="${i}">
        <div class="ac-search-item-left">
          <span class="ac-search-check">${v.isCompleted ? '✅' : '⬜'}</span>
          <div>
            <p class="ac-search-video-title">${highlight(v.videoTitle, query)}</p>
            <p class="ac-search-topic-title">${v.topicTitle}</p>
          </div>
        </div>
        <span class="ac-search-duration">${v.duration}</span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.ac-search-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        jumpToVideo(filtered[i]);
        close();
      });
    });
  }

  function highlight(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function jumpToVideo(video) {
    if (!video.element) {
      alert('Video element not found. Try expanding the topic manually.');
      return;
    }

    const chapter = video.element.closest('.lrn-path-chapter');
    const isChapterOpen = chapter?.classList.contains('lrn-path-chapter-open');  // renamed

    if (chapter && !isChapterOpen) {
      const chapterTitleTxt = chapter.querySelector('.lrn-path-chapter-name-txt');
      const chapterTitleWrap = chapter.querySelector('.lrn-path-chapter-name');
      (chapterTitleTxt || chapterTitleWrap)?.click();
    }

    setTimeout(() => {
      video.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      setTimeout(() => {
        const link = video.element.querySelector('.lrn-path-cont-link') || video.element;
        link.click();
      }, 500);
    }, 500);
  }

  let selectedIndex = -1;
  function handleKeydown(e) {
    if (e.key === 'Escape') { close(); return; }

    const items = document.querySelectorAll('.ac-search-item');
    if (e.key === 'ArrowDown') {
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      items[selectedIndex]?.click();
    }

    items.forEach((el, i) => el.classList.toggle('selected', i === selectedIndex));
  }

  document.addEventListener('keydown', handleKeydown);

  // --- Ctrl+K shortcut — attached to main document AND the video iframe's document ---
  function handleShortcut(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      e.stopPropagation();
      open();
    }
  }

  document.addEventListener('keydown', handleShortcut);

  // The video player lives inside a same-origin iframe. When focus is inside it,
  // keydown events never reach the main document, so Chrome's own Ctrl+K
  // (search-in-omnibox) fires instead. Attach the same shortcut listener
  // directly onto the iframe's document too.
  function attachIframeListener() {
    const iframe = document.getElementById('playerFrame') || document.querySelector('iframe');
    if (!iframe) return;

    let iframeDoc;
    try {
      iframeDoc = iframe.contentDocument;
    } catch (e) {
      return; // cross-origin, nothing we can do
    }

    if (!iframeDoc || iframeDoc === attachedIframeDoc) return;

    iframeDoc.addEventListener('keydown', handleShortcut);
    attachedIframeDoc = iframeDoc;
    console.log('[AC Insights] Search shortcut attached inside video iframe');
  }

  // --- Floating search button behavior ---
  let lastScroll = 0;
  let idleTimer = null;

  function setIdle() {
    document.getElementById('ac-search-trigger')?.classList.add('idle');
  }

  function setActive() {
    const btn = document.getElementById('ac-search-trigger');
    if (!btn) return;
    btn.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(setIdle, 3000);
  }

  window.addEventListener('scroll', () => {
    const btn = document.getElementById('ac-search-trigger');
    if (!btn) return;

    const currentScroll = window.scrollY;
    if (currentScroll > lastScroll && currentScroll > 100) {
      btn.classList.add('collapsed');
    } else {
      btn.classList.remove('collapsed');
    }
    lastScroll = currentScroll;
    setActive();
  }, { passive: true });

  document.addEventListener('mousemove', (e) => {
    const btn = document.getElementById('ac-search-trigger');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const near = e.clientX > rect.left - 60 && e.clientY > rect.top - 60;
    if (near) setActive();
  });

  setTimeout(setIdle, 3000);

  return { open, close, buildIndex, attachIframeListener };
})();