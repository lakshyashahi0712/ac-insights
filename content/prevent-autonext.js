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

  function attachListener() {
    const video = getVideo();
    if (!video || video === currentVideo) return;

    currentVideo = video;

    // 'timeupdate' pe continuously check karo — 'ended' se pehle hi intercept karo
    video.addEventListener('timeupdate', preventJump);

    // Extra safety — agar 'ended' phir bhi fire ho jaye
    video.addEventListener('ended', (e) => {
      if (!isEnabled) return;
      e.stopImmediatePropagation();
      video.pause();
      video.currentTime = Math.max(0, video.duration - 0.15);
    }, true); // capture phase — AC ke listener se pehle chalne ki koshish
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