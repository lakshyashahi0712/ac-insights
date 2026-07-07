// content/main.js

(async function init() {
  if (!window.location.href.includes('path-player')) {
    console.log('[AC Insights] Not a course page, skipping.');
    return;
  }

  console.log('[AC Insights] Initializing...');

  async function runAnalysis() {
    const data = ACParser.parseCourse();
    if (!data) return;

    const { topics, summary } = data;
    ACUI.clearAllBadges();

    const topicEls = [...document.querySelectorAll(ACParser.SELECTORS.topicContainer)];
    topicEls.forEach((el, i) => {
      if (topics[i]) ACUI.injectTopicBadge(el, topics[i]);
    });

    await ACStorage.save({ summary, timestamp: Date.now() });
    chrome.runtime.sendMessage({ type: 'DATA_UPDATED', payload: summary })
      .catch(() => {});

    ACUI.injectSearchButton();
    await ACBookmarks.injectBookmarkButtons();
    ACCaptions.injectNotesButtons();
  }

  async function waitForChapters(maxWait = 15000) {
    const interval = 500;
    let elapsed = 0;

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const els = document.querySelectorAll('.lrn-path-chapter.drip-section');

        if (els.length > 0) {
          clearInterval(timer);
          console.log(`[AC Insights] ${els.length} chapters found after ${elapsed}ms`);
          resolve(true);
        }

        elapsed += interval;

        if (elapsed >= maxWait) {
          clearInterval(timer);
          resolve(false);
        }
      }, interval);
    });
  }

  const found = await waitForChapters();
  if (found) await runAnalysis();

  ACObserver.start(runAnalysis);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SHOW_SUMMARY') {
      const data = ACParser.parseCourse();
      if (data) ACUI.injectCourseSummary(data.summary);
    }
    if (msg.type === 'SHOW_BOOKMARKS') {
      ACBookmarks.showPanel();
    }
  });

})();