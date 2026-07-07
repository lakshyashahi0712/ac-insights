// content/ui.js

const ACUI = (() => {

  const BADGE_CLASS = 'ac-insights-badge';
  const SUMMARY_ID = 'ac-insights-summary';

  /**
   * Injects a stats badge next to a topic title
   * Uses data-attribute to avoid double-injecting
   */
  function injectTopicBadge(topicEl, topicData) {
    // Idempotency check — don't inject twice
    if (topicEl.dataset.acInsights === 'true') return;
    topicEl.dataset.acInsights = 'true';

    const titleEl = topicEl.querySelector(ACParser.SELECTORS.topicTitle);
    if (!titleEl) return;

    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;

    const duration = DurationUtils.formatDuration(topicData.totalSeconds);
    const completed = topicData.completedCount;
    const total = topicData.videoCount;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    badge.innerHTML = `
      <span class="ac-badge-videos">📹 ${total} videos</span>
      <span class="ac-badge-duration">⏱️ ${duration}</span>
      ${completed > 0 ? `<span class="ac-badge-progress">${pct}% done</span>` : ''}
    `;

    // Insert AFTER title, not inside it (avoid breaking click handlers)
    titleEl.insertAdjacentElement('afterend', badge);
  }

  /**
   * Injects or updates the floating course summary panel
   */
  function injectCourseSummary(summary) {
    // Remove old panel if exists
    document.getElementById(SUMMARY_ID)?.remove();

    const panel = document.createElement('div');
    panel.id = SUMMARY_ID;

    const plan = DurationUtils.studyPlan(summary.remainingSeconds);
    const planHTML = plan.map(p => 
      `<li>${p.pace} → <strong>${p.days} days</strong></li>`
    ).join('');

    panel.innerHTML = `
      <div class="ac-summary-header">
        <span>📊 AC Insights</span>
        <button id="ac-summary-close">✕</button>
      </div>
      <div class="ac-summary-body">
        <div class="ac-stat-row">
          <span>Total Topics</span><strong>${summary.totalTopics}</strong>
        </div>
        <div class="ac-stat-row">
          <span>Total Videos</span><strong>${summary.totalVideos}</strong>
        </div>
        <div class="ac-stat-row">
          <span>Total Duration</span>
          <strong>${DurationUtils.formatDuration(summary.totalSeconds)}</strong>
        </div>
        <div class="ac-stat-row accent">
          <span>Completed</span>
          <strong>${summary.completedVideos} / ${summary.totalVideos}</strong>
        </div>
        <div class="ac-stat-row">
          <span>Remaining</span>
          <strong>${DurationUtils.formatDuration(summary.remainingSeconds)}</strong>
        </div>
        <div class="ac-planner">
          <p>📅 Study Planner</p>
          <ul>${planHTML}</ul>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    
makeDraggable(panel, '.ac-summary-header');

    document.getElementById('ac-summary-close')?.addEventListener('click', () => {
      panel.remove();
    });
  }

  function clearAllBadges() {
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach(el => el.remove());
    document.querySelectorAll('[data-ac-insights]').forEach(el => {
      delete el.dataset.acInsights;
    });
  }

  function injectSearchButton() {
  // Already exists toh skip
  if (document.getElementById('ac-search-trigger')) return;

  const btn = document.createElement('div');
  btn.id = 'ac-search-trigger';
  btn.innerHTML = `
    <span id="ac-search-trigger-icon">🔍</span>
    <span id="ac-search-trigger-text">Search Lectures</span>
    <kbd>Ctrl+K</kbd>
  `;

  btn.addEventListener('click', () => ACSearch.open());
  document.body.appendChild(btn);
}

  return { injectTopicBadge, injectCourseSummary, clearAllBadges, injectSearchButton };
})();