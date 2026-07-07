// popup/popup.js
document.addEventListener('DOMContentLoaded', async () => {
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

  document.getElementById('show-summary-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SUMMARY' });
    window.close();
  });

  document.getElementById('show-bookmarks-btn')
  ?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_BOOKMARKS' });
    window.close();
  });
});