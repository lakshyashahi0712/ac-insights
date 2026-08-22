// popup/popup.js

const AUTONEXT_KEY = 'ac_prevent_autonext';
const AUTONEXT_DEFAULT = true;

const CACHE_KEY = 'ac_insights_cache';
const COURSES_KEY = 'ac_insights_courses';
const ACTIVE_KEY = 'ac_insights_active_course';
const CACHE_VERSION = 2;
const ALL_COURSES = '__all__';

document.addEventListener('DOMContentLoaded', async () => {
  wireAutoNextToggle();
  wireActionButtons();
  await renderCourses();
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

/**
 * Purana cache single-course tha ({ summary, timestamp }), naya per-course hai.
 * Popup dono padh leta hai taaki upgrade ke turant baad bhi stats dikhein.
 */
function normalizeCache(value) {
  if (!value || typeof value !== 'object') return {};
  if (value.v === CACHE_VERSION && value.courses && typeof value.courses === 'object') {
    return value.courses;
  }
  if (value.summary) return { legacy: { summary: value.summary, timestamp: value.timestamp } };
  return {};
}

async function renderCourses() {
  const content = document.getElementById('popup-content');
  const select = document.getElementById('course-select');

  const store = await chrome.storage.local.get([CACHE_KEY, COURSES_KEY, ACTIVE_KEY]);
  const courses = normalizeCache(store[CACHE_KEY]);
  const registry = store[COURSES_KEY] || {};
  const activeId = store[ACTIVE_KEY];

  const ids = Object.keys(courses);
  if (ids.length === 0) {
    content.innerHTML = '<p class="hint">No data yet. Open a course page.</p>';
    return;
  }

  const nameFor = (id) =>
    courses[id]?.name || registry[id]?.name || (id === 'legacy' ? 'Your course' : id);

  // Switcher sirf tab dikhao jab sach me ek se zyada course ho
  if (ids.length > 1) {
    select.innerHTML = '';
    ids
      .slice()
      .sort((a, b) => (courses[b]?.timestamp || 0) - (courses[a]?.timestamp || 0))
      .forEach(id => select.appendChild(makeOption(id, nameFor(id))));
    select.appendChild(makeOption(ALL_COURSES, `All courses (${ids.length})`));

    select.value = ids.includes(activeId) ? activeId : select.options[0].value;
    select.classList.remove('hidden');
    select.addEventListener('change', () => renderStats(select.value, courses, nameFor));
  }

  const initial = ids.includes(activeId) ? activeId : ids[0];
  renderStats(ids.length > 1 ? select.value : initial, courses, nameFor);
}

function makeOption(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label; // course naam page se aata hai — textContent se safe rehta hai
  return opt;
}

function renderStats(selectedId, courses, nameFor) {
  const content = document.getElementById('popup-content');
  const ids = Object.keys(courses);

  const summaries = (selectedId === ALL_COURSES ? ids : [selectedId])
    .map(id => courses[id]?.summary)
    .filter(Boolean);

  if (summaries.length === 0) {
    content.innerHTML = '<p class="hint">No data for this course yet.</p>';
    return;
  }

  const s = summaries.reduce((acc, cur) => ({
    totalTopics: acc.totalTopics + (cur.totalTopics || 0),
    totalVideos: acc.totalVideos + (cur.totalVideos || 0),
    completedVideos: acc.completedVideos + (cur.completedVideos || 0),
  }), { totalTopics: 0, totalVideos: 0, completedVideos: 0 });

  const pct = Math.round((s.completedVideos / s.totalVideos) * 100) || 0;
  const label = selectedId === ALL_COURSES ? 'All courses' : nameFor(selectedId);

  content.innerHTML = `
    <div class="stat">Topics: <strong>${s.totalTopics}</strong></div>
    <div class="stat">Videos: <strong>${s.completedVideos}/${s.totalVideos}</strong></div>
    <div class="progress-bar">
      <div class="progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="pct">${pct}% Complete</div>
  `;

  // Naam page se aaya hua text hai — innerHTML me mat daalo
  const caption = document.createElement('div');
  caption.className = 'course-name';
  caption.textContent = label;
  content.prepend(caption);
}
