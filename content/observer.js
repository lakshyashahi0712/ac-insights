// content/observer.js

const ACObserver = (() => {
  let observer = null;
  let debounceTimer = null;

  /**
   * Debounced re-run — prevents firing 100 times during 
   * a single React re-render burst
   */
  function debouncedRun(callback, delay = 600) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(callback, delay);
  }

  function start(onChangeCallback) {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some(m =>
        // Only care about structural changes, not attribute flickers
        m.type === 'childList' && m.addedNodes.length > 0
      );
      if (relevant) {
        debouncedRun(onChangeCallback);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log('[AC Insights] Observer started.');
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    clearTimeout(debounceTimer);
  }

  return { start, stop };
})();