// content/prevent-autonext.js

const ACPreventAutoNext = (() => {

  const STORAGE_KEY = 'ac_prevent_autonext';
  const DEFAULT_ENABLED = true;

  let isEnabled = DEFAULT_ENABLED;
  let currentVideo = null;
  let watchingStorage = false;

  function getVideo() {
    let video = document.querySelector('video');
    if (!video) {
      const iframe = document.getElementById('playerFrame') || document.querySelector('iframe');
      try {
        video = iframe?.contentDocument?.querySelector('video');
      } catch (e) {}
    }
    return video;
  }

  function preventJump(e) {
    if (!isEnabled) return;

    // Video khatam hone se thoda pehle hi ruk jao — 'ended' event ko trigger hi na hone do
    const video = e.target;
    if (video.duration && video.currentTime >= video.duration - 0.05) {
      video.pause();
      // Thoda peeche kar do taaki "ended" state se bahar aa jaye
      video.currentTime = Math.max(0, video.duration - 0.15);
    }
  }

  let attachedVideo = null; // track which exact video element has our listeners

function attachListener() {
    const video = getVideo();
    if (!video) return;

    if (video === attachedVideo) return; // already attached, nothing to do

    currentVideo = video;
    attachedVideo = video;

    video.addEventListener('timeupdate', preventJump);
    video.addEventListener('ended', handleEnded, true);
}

function handleEnded(e) {
    if (!isEnabled) return;
    e.stopImmediatePropagation();
    const video = e.target;
    video.pause();
    video.currentTime = Math.max(0, video.duration - 0.15);
}

  /** User ki saved choice padho — kuch saved nahi hai toh default ON */
  async function loadPref() {
    if (!chrome.runtime?.id) return DEFAULT_ENABLED;
    return new Promise(resolve => {
      try {
        chrome.storage.local.get([STORAGE_KEY], result => {
          const saved = result?.[STORAGE_KEY];
          resolve(typeof saved === 'boolean' ? saved : DEFAULT_ENABLED);
        });
      } catch (e) {
        resolve(DEFAULT_ENABLED);
      }
    });
  }

  function savePref(value) {
    if (!chrome.runtime?.id) return;
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: value });
    } catch (e) {
      console.warn('[AC Insights] Could not save auto-next preference — extension reloaded?');
    }
  }

  /** Popup se toggle karne pe page reload ke bina hi apply ho jaye */
  function watchPrefChanges() {
    if (watchingStorage || !chrome.runtime?.id) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        const next = changes[STORAGE_KEY].newValue;
        if (typeof next === 'boolean' && next !== isEnabled) {
          apply(next);
        }
      });
      watchingStorage = true;
    } catch (e) {}
  }

  function apply(enabled) {
    isEnabled = enabled;
    if (isEnabled) attachListener();
    console.log(`[AC Insights] Auto-next prevention ${isEnabled ? 'ON' : 'OFF'}`);
  }

  /** @param {boolean} enabled @param {{persist?: boolean}} opts */
  function setEnabled(enabled, { persist = true } = {}) {
    apply(!!enabled);
    if (persist) savePref(isEnabled);
    return isEnabled;
  }

  function enable() {
    return setEnabled(true);
  }

  function disable() {
    return setEnabled(false);
  }

  function toggle() {
    return setEnabled(!isEnabled);
  }

  /** Saved choice ke hisaab se start karo + popup toggle sunna shuru karo */
  async function init() {
    const saved = await loadPref();
    setEnabled(saved, { persist: false });
    watchPrefChanges();
    return isEnabled;
  }

  // Naya video load hone pe (SPA navigation) re-attach karo
  function recheck() {
    if (!isEnabled) return;
    attachListener();
  }

  return {
    init,
    enable,
    disable,
    toggle,
    setEnabled,
    recheck,
    isEnabled: () => isEnabled,
    STORAGE_KEY,
    DEFAULT_ENABLED
  };
})();
