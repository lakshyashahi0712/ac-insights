// content/parser.js

const ACParser = (() => {

  const SELECTORS = {
    topicContainer: '.lrn-path-chapter.drip-section',
    topicTitle: '.lrn-path-chapter-name-txt',
    videoItem: 'li.lrn-path-cont',
    videoDuration: '.lrn-path-cont-info.video-duration',
    completedVideo: '.lrn-path-completion-circle.completed',
  };

  function parseTopic(topicEl) {
    const titleEl = topicEl.querySelector(SELECTORS.topicTitle);
    const title = titleEl ? titleEl.textContent.trim() : 'Unknown Topic';

    const videoItems = [...topicEl.querySelectorAll(SELECTORS.videoItem)];
    let totalSeconds = 0;
    let completedCount = 0;

    const videos = videoItems.map(item => {
      const durationEl = item.querySelector(SELECTORS.videoDuration);
      const titleEl2 = item.querySelector('.lrn-path-cont-name');
      const rawDuration = durationEl ? durationEl.textContent.trim() : '';
      const seconds = DurationUtils.parseToSeconds(rawDuration);
      const isCompleted = !!item.querySelector(SELECTORS.completedVideo);
      const videoTitle = titleEl2 ? titleEl2.textContent.trim() : '';

      totalSeconds += seconds;
      if (isCompleted) completedCount++;

      return { rawDuration, seconds, isCompleted, title: videoTitle, element: item };
    });

    return {
      title,
      videoCount: videos.length,
      totalSeconds,
      completedCount,
      videos,
    };
  }

  function parseCourse() {
    const topicEls = [...document.querySelectorAll(SELECTORS.topicContainer)];

    if (topicEls.length === 0) {
      console.warn('[AC Insights] No topics found. Selectors may need updating.');
      return null;
    }

    const topics = topicEls.map(parseTopic);

    const summary = topics.reduce((acc, t) => {
      acc.totalVideos += t.videoCount;
      acc.totalSeconds += t.totalSeconds;
      acc.completedVideos += t.completedCount;
      return acc;
    }, {
      totalTopics: topics.length,
      totalVideos: 0,
      totalSeconds: 0,
      completedVideos: 0,
    });

    summary.remainingVideos = summary.totalVideos - summary.completedVideos;
    summary.remainingSeconds = topics.reduce((acc, t) => {
      const remainingSecs = t.videos
        .filter(v => !v.isCompleted)
        .reduce((s, v) => s + v.seconds, 0);
      return acc + remainingSecs;
    }, 0);

    return { topics, summary };
  }

  return { parseCourse, SELECTORS };
})();

