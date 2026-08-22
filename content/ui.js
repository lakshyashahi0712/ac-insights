// content/ui.js

const ACUI = (() => {

  const BADGE_CLASS = 'ac-insights-badge';
  const SUMMARY_ID = 'ac-insights-summary';

  /**
   * Injects a stats badge next to a topic title
   * Uses data-attribute to avoid double-injecting
   */
  function injectTopicBadge(topicEl, topicData) {
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

  // Unwatched duration calculate karo
  const unwatchedSeconds = topicData.videos
    .filter(v => !v.isCompleted)
    .reduce((sum, v) => sum + v.seconds, 0);
  const unwatchedDuration = DurationUtils.formatDuration(unwatchedSeconds);

  badge.innerHTML = `
    <span class="ac-badge-videos">📹 ${total} videos</span>
    <span class="ac-badge-duration">⏱️ ${duration}</span>
    ${completed > 0 ? `<span class="ac-badge-progress">${pct}% done</span>` : ''}
    ${unwatchedSeconds > 0 ? `<span class="ac-badge-unwatched">⏳ ${unwatchedDuration} left</span>` : ''}
  `;

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
          <div class="ac-deadline">
            <label class="ac-deadline-label" for="ac-deadline-date">🎯 Finish by</label>
            <div class="ac-deadline-row">
              <input type="date" id="ac-deadline-date" min="${DurationUtils.todayISO()}">
              <button id="ac-deadline-clear" title="Clear deadline" hidden>✕</button>
            </div>
            <p class="ac-deadline-result" id="ac-deadline-result">
              Pick a date to see how much you need per day.
            </p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

makeDraggable(panel, '.ac-summary-header');

    document.getElementById('ac-summary-close')?.addEventListener('click', () => {
      panel.remove();
    });

    wireDeadline(summary);
  }

  /**
   * Deadline mode — planner ka ulta: date do, roz ka target milega.
   * Chuni hui date per-course save hoti hai.
   */
  function wireDeadline(summary) {
    const input = document.getElementById('ac-deadline-date');
    const clearBtn = document.getElementById('ac-deadline-clear');
    const result = document.getElementById('ac-deadline-result');
    if (!input || !result) return;

    function render(dateStr) {
      const pace = DurationUtils.requiredPace(
        summary.remainingSeconds,
        dateStr,
        summary.remainingVideos
      );

      clearBtn.hidden = !dateStr;
      result.classList.remove('heavy', 'invalid');

      if (!pace) {
        result.textContent = 'Pick a date to see how much you need per day.';
        return;
      }
      if (pace.done) {
        result.textContent = 'Course already complete — nothing left to schedule! 🎉';
        return;
      }
      if (pace.past) {
        result.textContent = 'That date has already passed — pick a future date.';
        result.classList.add('invalid');
        return;
      }

      const dayWord = pace.days === 1 ? 'day' : 'days';
      const videoBit = pace.videosPerDay
        ? ` · about ${pace.videosPerDay} ${pace.videosPerDay === 1 ? 'video' : 'videos'}/day`
        : '';
      const warning = pace.impossible
        ? '⚠️ more than a day fits — pick a later date'
        : pace.heavy ? '⚠️ that\'s a heavy pace' : '';

      result.innerHTML = `
        <strong>${pace.perDay}/day</strong> for ${pace.days} ${dayWord}${videoBit}
        ${warning ? `<span class="ac-deadline-warn">${warning}</span>` : ''}
      `;
      if (pace.heavy) result.classList.add('heavy');
    }

    input.addEventListener('change', () => {
      render(input.value);
      ACStorage.saveDeadline(input.value);
    });

    clearBtn?.addEventListener('click', () => {
      input.value = '';
      render('');
      ACStorage.saveDeadline(null);
    });

    // Pehle se saved deadline ho toh wapas dikhao
    ACStorage.loadDeadline().then(saved => {
      if (!saved) return;
      input.value = saved;
      render(saved);
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