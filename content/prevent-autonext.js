// content/prevent-autonext.js

const ACPreventAutoNext = (() => {

  let isEnabled = false;
  let currentVideo = null;

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

  function enable() {
    isEnabled = true;
    attachListener();
    console.log('[AC Insights] Auto-next prevention ON');
  }

  function disable() {
    isEnabled = false;
    console.log('[AC Insights] Auto-next prevention OFF');
  }

  function toggle() {
    isEnabled ? disable() : enable();
    return isEnabled;
  }

  // Naya video load hone pe (SPA navigation) re-attach karo
  function recheck() {
    attachListener();
  }

  return { enable, disable, toggle, recheck, isEnabled: () => isEnabled };
})();