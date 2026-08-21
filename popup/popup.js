// popup/popup.js

const AUTONEXT_KEY = 'ac_prevent_autonext';
const AUTONEXT_DEFAULT = true;

document.addEventListener('DOMContentLoaded', async () => {
  wireAutoNextToggle();
  wireActionButtons();
  await renderStats();
});

/** Auto-next block ka on/off switch — choice chrome.storage.local me save hoti hai */
function wireAutoNextToggle() {
  const toggle = document.getElementById('autonext-toggle');
  if (!toggle) return;

  chrome.storage.local.get([AUTONEXT_KEY], (result) => {
    const saved = result?.[AUTONEXT_KEY];
    toggle.checked = typeof saved === 'boolean' ? saved : AUTONEXT_DEFAULT;
  });

  // Content script storage.onChanged sun raha hai, so open tabs turant apply kar lenge
  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ [AUTONEXT_KEY]: toggle.checked });
  });
}

function wireActionButtons() {
  document.getElementById('show-summary-btn')?.addEventListener('click', () => {
    sendToActiveTab({ type: 'SHOW_SUMMARY' });
  });

  document.getElementById('show-bookmarks-btn')?.addEventListener('click', () => {
    sendToActiveTab({ type: 'SHOW_BOOKMARKS' });
  });
}

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, message, () => void chrome.runtime.lastError);
  window.close();
}

async function renderStats() {
  const content = document.getElementById('popup-content');
  const data = await chrome.storage.local.get(['ac_insights_cache']);
  const cached = data['ac_insights_cache'];

  if (!cached) {
    content.innerHTML = '<p class="hint">No data yet. Open a course page.</p>';
    return;
  }

  const s = cached.summary;
  const pct = Math.round((s.completedVideos / s.totalVideos) * 100) || 0;

  content.innerHTML = `
    <div class="stat">Topics: <strong>${s.totalTopics}</strong></div>
    <div class="stat">Videos: <strong>${s.completedVideos}/${s.totalVideos}</strong></div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="pct">${pct}% Complete</div>
  `;
}
