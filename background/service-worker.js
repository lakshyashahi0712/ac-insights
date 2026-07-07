chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Sirf woh URL jo .m3u8 pe KHATAM hoti hai, .ts segment nahi
    if (details.url.endsWith('.m3u8') && details.url.includes('wistia')) {
      console.log('[AC Insights] Real M3U8 manifest captured:', details.url);
      chrome.storage.local.set({
        'ac_current_m3u8': details.url,
        'ac_m3u8_timestamp': Date.now()
      });
    }
  },
  { urls: ["*://*.wistia.com/*"] }
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_M3U8') {
    chrome.storage.local.get(['ac_current_m3u8'], (result) => {
      sendResponse({ url: result['ac_current_m3u8'] || null });
    });
    return true;
  }
});