// utils/duration.js
// All time parsing & formatting logic isolated here

const DurationUtils = (() => {

  /**
   * Parses duration strings like "12:34", "1:02:45", "5 min", "1h 20m"
   * Returns total seconds
   */
  function parseToSeconds(raw) {
    if (!raw) return 0;
    const str = raw.trim();

    // Format: HH:MM:SS or MM:SS
    const colonMatch = str.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (colonMatch) {
      const [, a, b, c] = colonMatch;
      if (c !== undefined) {
        return parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c);
      }
      return parseInt(a) * 60 + parseInt(b);
    }

    // Format: "1h 20m", "45m", "2h"
    let secs = 0;
    const hMatch = str.match(/(\d+)\s*h/i);
    const mMatch = str.match(/(\d+)\s*m(?:in)?/i);
    const sMatch = str.match(/(\d+)\s*s(?:ec)?/i);
    if (hMatch) secs += parseInt(hMatch[1]) * 3600;
    if (mMatch) secs += parseInt(mMatch[1]) * 60;
    if (sMatch) secs += parseInt(sMatch[1]);

    return secs;
  }

  /**
   * Formats total seconds → "1h 48m" or "45m" 
   */
  function formatDuration(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '—';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  /**
   * Study planner: given total remaining seconds, 
   * returns array of {pace, days}
   */
  function studyPlan(remainingSeconds, paceMinutes = [30, 60, 120]) {
    return paceMinutes.map(mins => ({
      pace: mins >= 60 ? `${mins / 60}h/day` : `${mins}m/day`,
      days: Math.ceil(remainingSeconds / (mins * 60))
    }));
  }

  return { parseToSeconds, formatDuration, studyPlan };
})();