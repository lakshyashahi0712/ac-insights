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
    const colonMatch = str.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);  // 1 ya 2 digits allow karo
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

  /** Aaj ka din local timezone me, YYYY-MM-DD (date input ke min ke liye) */
  function todayISO(now = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * "YYYY-MM-DD" se aaj tak kitne din bache — aaj ka din bhi count hota hai,
   * toh aaj ki deadline = 1 din.
   * new Date("YYYY-MM-DD") UTC maanta hai (timezone ke wajah se din khisak sakta
   * hai), isliye parts se local date banate hain.
   */
  function daysUntil(dateStr, now = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
    if (!m) return null;

    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(target.getTime())) return null;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000) + 1;
  }

  /**
   * Planner ka ulta sawaal: "itni tareekh tak khatam karna hai — roz kitna dekhun?"
   */
  function requiredPace(remainingSeconds, dateStr, remainingVideos = 0, now = new Date()) {
    const days = daysUntil(dateStr, now);
    if (days === null) return null;

    if (remainingSeconds <= 0) return { done: true, days };
    if (days <= 0) return { past: true, days };

    const secondsPerDay = Math.ceil(remainingSeconds / days);

    return {
      days,
      secondsPerDay,
      perDay: formatDuration(secondsPerDay),
      videosPerDay: remainingVideos > 0 ? Math.ceil(remainingVideos / days) : 0,
      heavy: secondsPerDay > 4 * 3600,        // 4 ghante se zyada roz = realistically mushkil
      impossible: secondsPerDay > 16 * 3600,  // itna toh ek din me dekha hi nahi ja sakta
    };
  }

  return { parseToSeconds, formatDuration, studyPlan, todayISO, daysUntil, requiredPace };
})();