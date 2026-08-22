// content/captions.js

const ACCaptions = (() => {

  const CHUNK_DURATION_MS = 15000;         // audio chunk length
  const FRAME_CHECK_INTERVAL_MS = 4000;    // har 4 sec check (thoda kam frequent)
const STABLE_CHECKS_NEEDED = 3;          // ~12 sec stable rehna chahiye (pehle sirf 6 sec)
const MIN_GAP_BETWEEN_CAPTURES_MS = 20000; // 2 screenshots ke beech kam se kam 20 sec gap
const FALLBACK_MAX_WAIT_MS = 45000;      // continuous typing mein bhi 45 sec mein ek baar
  

let isRecording = false;
  let isGeneratingNotes = false;
  let isTranscribingChunk = false;
  let accumulatedTranscript = '';
  let currentVideoTitle = '';
  let currentApiKey = '';
  let currentProvider = 'groq';
  let currentVideoElement = null;

  // --- Screenshot capture state ---
  let capturedScreenshots = [];
  let stabilityInterval = null;
  let lastFrameSig = null;
  let stableCount = 0;
  let lastCaptureTime = 0;
  let sigCanvas = null;

  const PROVIDERS = {
    groq: {
      name: 'Groq',
      keyPrefix: 'gsk_',
      transcribeUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
      chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
      transcribeModel: 'whisper-large-v3',
      chatModel: 'openai/gpt-oss-120b'
    },
    openai: {
      name: 'OpenAI',
      keyPrefix: 'sk-',
      transcribeUrl: 'https://api.openai.com/v1/audio/transcriptions',
      chatUrl: 'https://api.openai.com/v1/chat/completions',
      transcribeModel: 'whisper-1',
      chatModel: 'gpt-4o-mini'
    }
  };

  // ============================================================
  // API CONFIG
  // ============================================================
  async function getApiConfig() {
    return new Promise(resolve =>
      chrome.storage.local.get(['ac_api_key', 'ac_api_provider'], r =>
        resolve({ key: r['ac_api_key'] || null, provider: r['ac_api_provider'] || 'groq' })
      )
    );
  }

  async function saveApiConfig(key, provider) {
    return new Promise(resolve =>
      chrome.storage.local.set({ 'ac_api_key': key, 'ac_api_provider': provider }, resolve)
    );
  }

  async function removeApiConfig() {
    return new Promise(resolve =>
      chrome.storage.local.remove(['ac_api_key', 'ac_api_provider'], resolve)
    );
  }

  // ============================================================
  // NOTES STORAGE (includes screenshots)
  // ============================================================
  function slugTitle(title) {
    return String(title).replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Course ke hisaab se namespaced key — do courses me same naam ka lecture ho
   * (jaise "Introduction") toh unke notes ek dusre ko overwrite na karein.
   * '::' separator jaan-bujh ke use kiya hai: slug me sirf letters/digits/_ aate
   * hain, toh yeh boundary kabhi ambiguous nahi hogi.
   */
  function getNotesKey(title) {
    return `ac_notes::${ACCourse.id()}::${slugTitle(title)}`;
  }

  /** Course-scoping se pehle notes sirf video title pe save hote the */
  function getLegacyNotesKey(title) {
    return `ac_notes_${slugTitle(title)}`;
  }

  async function saveNotes(title, notes, transcript, screenshots = []) {
    const key = getNotesKey(title);
    return new Promise((resolve, reject) =>
      chrome.storage.local.set({
        [key]: { notes, transcript, screenshots, videoTitle: title, savedAt: Date.now() }
      }, () => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        // Namespaced copy ban gayi — purani duplicate hata do (best effort, screenshots bhaari hote hain)
        chrome.storage.local.remove(getLegacyNotesKey(title), () => {
          void chrome.runtime.lastError;
          resolve();
        });
      })
    );
  }

  async function loadNotes(title) {
    const key = getNotesKey(title);
    return new Promise(resolve =>
      chrome.storage.local.get([key], r => {
        if (r[key]) return resolve(r[key]);
        // Purane (course-scoping se pehle ke) notes bhi padho — kuch gum na ho
        const legacyKey = getLegacyNotesKey(title);
        chrome.storage.local.get([legacyKey], lr => resolve(lr[legacyKey] || null));
      })
    );
  }

  async function deleteNotes(title) {
    return new Promise(resolve =>
      chrome.storage.local.remove([getNotesKey(title), getLegacyNotesKey(title)], resolve)
    );
  }

  // ============================================================
  // AUDIO CAPTURE
  // ============================================================
  function captureRealVideoAudio() {
    let acVideo = document.querySelector('video');

    if (!acVideo) {
      const iframe = document.getElementById('playerFrame') || document.querySelector('iframe');
      if (iframe) {
        try {
          acVideo = iframe.contentDocument?.querySelector('video');
        } catch (e) {
          throw new Error('Iframe access blocked.');
        }
      }
    }

    if (!acVideo) throw new Error('Video player not found. Please PLAY the video first, then click 📝.');
    if (acVideo.paused) throw new Error('Video is paused. Please ▶️ play the video first, then click 📝.');

    currentVideoElement = acVideo;

    const stream = acVideo.captureStream?.() || acVideo.mozCaptureStream?.();
    const audioTracks = stream?.getAudioTracks() || [];

    if (audioTracks.length === 0) throw new Error('No audio track found. Is the video playing properly?');

    return new MediaStream(audioTracks);
  }

  // ============================================================
  // SCREENSHOT CAPTURE (stability-based — works for any video length)
  // ============================================================
  function getSmallSignatureCanvas() {
    if (!currentVideoElement || currentVideoElement.videoWidth === 0) return null;
    if (!sigCanvas) {
      sigCanvas = document.createElement('canvas');
      sigCanvas.width = 80;
      sigCanvas.height = 45;
    }
    sigCanvas.getContext('2d').drawImage(currentVideoElement, 0, 0, 80, 45);
    return sigCanvas;
  }

  function computeSignature(canvas) {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
    return Math.round(sum);
  }

  function captureFullFrame() {
    if (!currentVideoElement || currentVideoElement.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = currentVideoElement.videoWidth;
    canvas.height = currentVideoElement.videoHeight;
    canvas.getContext('2d').drawImage(currentVideoElement, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.6);
  }

  function startStabilityWatcher() {
    stableCount = 0;
    lastFrameSig = null;
    lastCaptureTime = 0;

    stabilityInterval = setInterval(() => {
      if (!isRecording || currentVideoElement?.paused) return;

      const small = getSmallSignatureCanvas();
      if (!small) return;

      const sig = computeSignature(small);
      const now = Date.now();
      const gapOk = now - lastCaptureTime > MIN_GAP_BETWEEN_CAPTURES_MS;

      if (lastFrameSig !== null && Math.abs(sig - lastFrameSig) < 300) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastFrameSig = sig;

      // Primary trigger — frame has settled (teacher stopped typing/writing)
      if (stableCount === STABLE_CHECKS_NEEDED && gapOk) {
        captureNow(now);
        return;
      }

      // Fallback trigger — content keeps changing continuously (e.g. live typing)
      // so it never "settles", but we still want periodic progress snapshots
      const tooLongSinceLastCapture = now - lastCaptureTime > FALLBACK_MAX_WAIT_MS;
      if (tooLongSinceLastCapture) {
        captureNow(now);
      }
    }, FRAME_CHECK_INTERVAL_MS);
  }

  function captureNow(timestamp) {
    const dataUrl = captureFullFrame();
    if (dataUrl) {
      capturedScreenshots.push({
        dataUrl,
        timestamp,
        videoTime: currentVideoElement?.currentTime || 0  // ← naya
      });
      lastCaptureTime = timestamp;
      stableCount = 0;
      refreshScreenshotsInPanel();
    }
}

function captureManualScreenshot() {
    if (!isRecording) {
      alert('Live Notes chalu karo pehle (📝 click karo), tabhi screenshot le sakte ho.');
      return;
    }

    const dataUrl = captureFullFrame();
    if (dataUrl) {
      capturedScreenshots.push({
        dataUrl,
        timestamp: Date.now(),
        videoTime: currentVideoElement?.currentTime || 0,
        manual: true  // manually liya gaya, badge dikhane ke liye
      });
      refreshScreenshotsInPanel();
    }
}


  function stopStabilityWatcher() {
    if (stabilityInterval) clearInterval(stabilityInterval);
    stabilityInterval = null;
  }

  function renderScreenshotsStrip(screenshots) {
    if (!screenshots || screenshots.length === 0) return '';
    return `
      <p class="ac-screenshots-label">📸 Screen captures (${screenshots.length})</p>
      <div class="ac-screenshots-scroll">
        ${screenshots.map((s, i) => `
          <div class="ac-screenshot-wrap" data-index="${i}">
            <img src="${s.dataUrl}" class="ac-screenshot-thumb" data-video-time="${s.videoTime || 0}" />
            ${s.manual ? '<span class="ac-manual-badge">✋</span>' : ''}
            <span class="ac-screenshot-time">${formatVideoTime(s.videoTime)}</span>
          </div>
        `).join('')}
      </div>
    `;
}function renderScreenshotsStrip(screenshots) {
    if (!screenshots || screenshots.length === 0) return '';
    return `
      <p class="ac-screenshots-label">📸 Screen captures (${screenshots.length})</p>
      <div class="ac-screenshots-scroll">
        ${screenshots.map((s, i) => `
          <div class="ac-screenshot-wrap" data-index="${i}">
            <img src="${s.dataUrl}" class="ac-screenshot-thumb" data-video-time="${s.videoTime || 0}" />
            ${s.manual ? '<span class="ac-manual-badge">✋</span>' : ''}
            <span class="ac-screenshot-time">${formatVideoTime(s.videoTime)}</span>
          </div>
        `).join('')}
      </div>
    `;
}

function formatVideoTime(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function attachScreenshotClickHandlers() {
    document.querySelectorAll('.ac-screenshot-thumb').forEach(img => {
      img.onclick = (e) => {
        e.stopPropagation();
        jumpToScreenshotMoment(parseFloat(img.dataset.videoTime));
      };
    });

    document.querySelectorAll('.ac-screenshot-wrap').forEach(wrap => {
      wrap.oncontextmenu = (e) => {
        e.preventDefault();
        const img = wrap.querySelector('img');
        const overlay = document.createElement('div');
        overlay.className = 'ac-screenshot-overlay';
        overlay.innerHTML = `<img src="${img.src}" />`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
      };
    });
}

function jumpToScreenshotMoment(videoTime) {
    if (!currentVideoElement) {
      alert('Video player not found.');
      return;
    }
    currentVideoElement.currentTime = videoTime;
    currentVideoElement.play();
}

  function refreshScreenshotsInPanel() {
    const container = document.getElementById('ac-screenshots-container');
    if (!container) return;
    container.innerHTML = renderScreenshotsStrip(capturedScreenshots);
    attachScreenshotClickHandlers();
  }

  // ============================================================
  // WHISPER TRANSCRIPTION
  // ============================================================
  async function transcribe(blob, apiKey, provider) {
    const config = PROVIDERS[provider];
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', config.transcribeModel);
    formData.append('language', 'hi');

    const res = await fetch(config.transcribeUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (res.status === 401) {
      await removeApiConfig();
      throw new Error('API key is invalid or expired. Please enter a new key.');
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Transcription failed');
    }

    return (await res.json()).text;
  }

  // ============================================================
  // STREAMING NOTES GENERATION
  // ============================================================
  async function generateNotes(transcript, title, apiKey, provider, onChunk, isComplete = false) {
    const config = PROVIDERS[provider];

    const statusInstruction = isComplete
      ? ''
      : `\n- The video is still playing and this transcript is incomplete — do NOT claim the lecture is finished, and add at the end: "⚠️ Note: Video is still playing, these are notes so far"`;

    const res = await fetch(config.chatUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.chatModel,
        max_tokens: 1500,
        temperature: 0.3,
        stream: true,
        messages: [{
          role: 'user',
          content: `You are an expert teacher covering programming and computer science topics — this could be DSA (Java/C++), Web Development (JavaScript/HTML/CSS), AI/ML (Python), or a conceptual/theory topic with no code at all. Below is a lecture transcript for the video "${title}".

TRANSCRIPT:
${transcript}

Create DETAILED study notes from this transcript — do not write a generic summary.

STEP 1 — Identify the topic type from the transcript and video title:
- If it's a coding lecture, identify the exact programming language being used by looking at syntax keywords, function signatures, library names, or explicit mentions (e.g. "public static void" = Java, "def" and "import numpy" = Python, "const"/"let"/"=>" = JavaScript, "cout <<"/"vector<int>" = C++). Do not guess — only use the language that the transcript's syntax actually indicates.
- If it's a conceptual/theory topic (e.g. time complexity, system design, networking, career advice) with no actual code, skip the Code/Logic section entirely — do not force code into notes that don't need it.

## ${title}

### Concept Explanation
(Explain exactly how the teacher explained it — include all examples and analogies mentioned in the transcript)

### Key Definitions
(If the teacher defined any terms, write them close to the original wording)

### Examples Discussed
(List the specific examples/numbers/cases discussed in the transcript)

### Code/Logic (only include this section if code was actually discussed)
(Convert any programming logic explained verbally into code, using the language you identified in Step 1. Wrap it in a code block with the correct language tag — \`\`\`java, \`\`\`cpp, \`\`\`python, \`\`\`javascript, etc. If no code was discussed, omit this entire section rather than writing "not applicable")

### Common Mistakes/Tips
(Any warning or tip the teacher gave)

RULES:
- Only write what was actually said in the transcript, do not make things up
- Write the notes content in Hinglish using ROMAN/ENGLISH script only (e.g. "yeh function declare karna hota hai") — do NOT use Devanagari/Hindi script
- Never default to Java unless the transcript's syntax actually indicates Java — check for language-specific keywords first
- If this is a non-coding/theory topic, do not include a Code/Logic section at all
- If a section has no relevant content (other than Code/Logic), write "Not mentioned in transcript" instead of leaving it blank${statusInstruction}`
        }]
      })
    });

    if (res.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Notes generation failed');
    }

    if (!res.body) {
      const data = await res.json();
      const text = data.choices[0].message.content;
      onChunk?.(text);
      return text;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk?.(fullText);
          }
        } catch (e) {}
      }
    }

    return fullText;
}

  // ============================================================
  // NOTES FORMATTING
  // Code blocks are kept separate from prose so newlines inside code
  // aren't double-converted to <br> (the <pre> CSS already handles them).
  // ============================================================
  function formatInline(text) {
    return text
      .replace(/### (.*)/g, '<h4 class="ac-notes-h4">$1</h4>')
      .replace(/## (.*)/g, '<h3 class="ac-notes-h3">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function formatNotesHTML(notes, isStreaming = false) {
    const codeBlockRegex = /```(\w+)?([\s\S]*?)```/g;
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(notes)) !== null) {
      html += formatInline(notes.slice(lastIndex, match.index));
      html += `<pre class="ac-code-block"><code>${match[2]}</code></pre>`;
      lastIndex = codeBlockRegex.lastIndex;
    }
    html += formatInline(notes.slice(lastIndex));

    if (isStreaming) {
      const openFence = html.match(/```(\w+)?\n?([\s\S]*)$/);
      if (openFence) {
        html = html.replace(/```(\w+)?\n?([\s\S]*)$/, `<pre class="ac-code-block"><code>${openFence[2]}</code></pre>`);
      }
    }

    return html;
  }

  // ============================================================
  // LIVE RECORDING (decoupled — audio capture never pauses for AI work)
  // ============================================================
  function recordNextChunk(audioStream) {
    if (!isRecording) return;

    if (currentVideoElement?.paused || currentVideoElement?.ended) {
      console.log('[AC Insights] Video paused/ended, stopping recording loop');
      return;
    }

    const chunks = [];
    const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });

      if (isRecording) recordNextChunk(audioStream); // next chunk starts immediately

      if (blob.size < 1000) return;

      (async () => {
        isTranscribingChunk = true;
        try {
          const text = await transcribe(blob, currentApiKey, currentProvider);
          accumulatedTranscript += text + ' ';
          await updateLiveNotes();
        } catch (err) {
          console.error('[AC Insights] Chunk failed (skipping):', err.message);
        } finally {
          isTranscribingChunk = false;
        }
      })();
    };

    recorder.start();

    const endedHandler = () => {
      if (recorder.state !== 'inactive') recorder.stop();
    };
    currentVideoElement.addEventListener('ended', endedHandler, { once: true });

    setTimeout(() => {
      currentVideoElement?.removeEventListener('ended', endedHandler);
      if (recorder.state !== 'inactive') recorder.stop();
    }, CHUNK_DURATION_MS);
  }

  async function updateLiveNotes(isFinal = false) {
    const wordCount = accumulatedTranscript.trim().split(/\s+/).filter(Boolean).length;

    const panel = ensureNotesPanel(currentVideoTitle);
    if (!panel) return;

    if (isGeneratingNotes) return;

    if (wordCount < 5) {
      updateNotesStatusMessage(`📝 Listening... (${wordCount} words captured)`);
      return;
    }

    isGeneratingNotes = true;
    try {
      let liveText = '';
      await generateNotes(accumulatedTranscript, currentVideoTitle, currentApiKey, currentProvider, (partial) => {
        liveText = partial;
        updateNotesContentLive(partial, true);
      }, isFinal);   // ← isComplete flag pass ho raha hai
      updateNotesContentLive(liveText, false);
      await saveNotes(currentVideoTitle, liveText, accumulatedTranscript, capturedScreenshots);
    } catch (err) {
      console.error('[AC Insights] Notes update failed:', err);
    } finally {
      isGeneratingNotes = false;
    }
}

  async function startLiveTranscription(title, apiKey, provider) {
    isRecording = true;
    isGeneratingNotes = false;
    isTranscribingChunk = false;
    accumulatedTranscript = '';
    capturedScreenshots = [];
    currentVideoTitle = title;
    currentApiKey = apiKey;
    currentProvider = provider;

    const audioStream = captureRealVideoAudio();
    showNotesPanel(title, null, '🎙️ Live transcription started... Keep watching the video!', true);

    currentVideoElement.addEventListener('ended', handleVideoEnded, { once: true });

    startStabilityWatcher();
    recordNextChunk(audioStream);
  }

  function stopLiveTranscription() {
    isRecording = false;
    stopStabilityWatcher();
  }

  async function handleVideoEnded() {
    if (!isRecording) return;
    isRecording = false;
    stopStabilityWatcher();

    updateNotesStatusMessage('🏁 Video ended — finalizing your notes...');

    const title = currentVideoTitle;

    // Wait for any in-flight chunk transcription to finish, so the final
    // generation below uses the complete transcript, not a partial one.
    let waited = 0;
    while (isTranscribingChunk && waited < 15000) {
      await new Promise(r => setTimeout(r, 400));
      waited += 400;
    }

    // Force one final, complete generation now that the video has genuinely ended —
    // this is what removes the stale "video is still playing" note.
    if (accumulatedTranscript.trim().length > 0) {
      await updateLiveNotes(true);
    }

    await finalizeAndShowNotes(title);
}

async function handleStopClick() {
    stopLiveTranscription();

    let waited = 0;
    while (isTranscribingChunk && waited < 8000) {
      await new Promise(r => setTimeout(r, 400));
      waited += 400;
    }

    // Same idea — user explicitly stopped, so generate one final complete
    // version instead of leaving the last "still playing" draft as final.
    if (accumulatedTranscript.trim().length > 0) {
      await updateLiveNotes(true);
    }

    await finalizeAndShowNotes(currentVideoTitle);
}

  async function handleStopClick() {
    stopLiveTranscription();

    let waited = 0;
    while ((isGeneratingNotes || isTranscribingChunk) && waited < 8000) {
      await new Promise(r => setTimeout(r, 400));
      waited += 400;
    }

    await finalizeAndShowNotes(currentVideoTitle);   // ← same fix yahan bhi
}

  // ============================================================
  // LIGHTWEIGHT PANEL UPDATE HELPERS
  // ============================================================
  function ensureNotesPanel(title) {
    const existing = document.getElementById('ac-notes-panel');
    if (existing && existing.dataset.videoTitle === title) return existing;
    if (!isRecording) return null; // user already closed it — don't bring it back
    showNotesPanel(title, null, '🎙️ Live transcription started... Keep watching the video!', true);
    return document.getElementById('ac-notes-panel');
  }

  function updateNotesStatusMessage(message) {
    const main = document.getElementById('ac-notes-main-content');
    if (!main) return;
    main.innerHTML = `
      <div class="ac-notes-message">
        <div class="ac-pulse-loader"></div>
        ${message}
      </div>
    `;
  }


  async function finalizeAndShowNotes(title) {
    const saved = await loadNotes(title);

    if (saved) {
      // Screenshots capture faster than the notes-save cycle. Always sync the
      // latest in-memory screenshots into storage before showing the final
      // panel, so none captured near the end get silently dropped.
      if (capturedScreenshots.length > (saved.screenshots?.length || 0)) {
        await saveNotes(title, saved.notes, saved.transcript, capturedScreenshots);
        saved.screenshots = capturedScreenshots;
      }
      showSavedNotesPanel(title, saved);
    } else {
      showNotesPanel(title, null, '⏹️ No notes were generated (video may have been too short or too quiet).', false);
    }
}

  function updateNotesContentLive(text, isStreaming) {
    const main = document.getElementById('ac-notes-main-content');
    if (!main) return;

    main.innerHTML = `
      <div class="ac-notes-content">${formatNotesHTML(text, isStreaming)}${isStreaming ? '<span class="ac-typing-cursor">▍</span>' : ''}</div>
      ${!isStreaming ? '<button id="ac-notes-copy">📋 Copy Notes</button>' : ''}
    `;

    if (!isStreaming) {
      document.getElementById('ac-notes-copy')?.addEventListener('click', () => {
        navigator.clipboard.writeText(text);
        const btn = document.getElementById('ac-notes-copy');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy Notes'; }, 2000);
      });
    }
  }

  // ============================================================
  // UI PANELS
  // ============================================================
 function panelShell({ headerLabel, title, meta, mainContentHTML, screenshots, footerHTML, showCaptureBtn }) {
    return `
      <div class="ac-notes-header">
        <span>${headerLabel} ${showCaptureBtn ? '<button id="ac-manual-screenshot-btn" title="Take a screenshot right now">📷</button>' : ''}</span>
        <div class="ac-notes-header-actions">
          <button id="ac-notes-minimize" title="Minimize">—</button>
          <button id="ac-notes-close">✕</button>
        </div>
      </div>
      <div class="ac-notes-collapsible">
        <div class="ac-notes-title">${title}</div>
        ${meta ? `<div class="ac-notes-meta">${meta}</div>` : ''}
        <div class="ac-notes-body">
          <div id="ac-notes-main-content">${mainContentHTML}</div>
          <div id="ac-screenshots-container" class="ac-screenshots-strip">${renderScreenshotsStrip(screenshots)}</div>
        </div>
        ${footerHTML || ''}
      </div>
    `;
}

  function attachCloseAndCopy(panel, notes) {
    document.getElementById('ac-notes-close')?.addEventListener('click', () => {
      stopLiveTranscription();
      panel.remove();
    });

    document.getElementById('ac-notes-minimize')?.addEventListener('click', (e) => {
      const collapsible = panel.querySelector('.ac-notes-collapsible');
      const btn = e.target;
      const isMinimized = panel.classList.toggle('minimized');
      collapsible.style.display = isMinimized ? 'none' : '';
      btn.textContent = isMinimized ? '▢' : '—';
      btn.title = isMinimized ? 'Expand' : 'Minimize';
    });

    document.getElementById('ac-manual-screenshot-btn')?.addEventListener('click', () => {
      captureManualScreenshot();
    });

    document.getElementById('ac-notes-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(notes);
      const btn = document.getElementById('ac-notes-copy');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Notes'; }, 2000);
    });

    attachScreenshotClickHandlers();
}

  function showNotesPanel(title, notes, message, isLive = false) {
    document.getElementById('ac-notes-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';
    panel.dataset.videoTitle = title;

    const mainContentHTML = notes
      ? `<div class="ac-notes-content">${formatNotesHTML(notes)}</div><button id="ac-notes-copy">📋 Copy Notes</button>`
      : `<div class="ac-notes-message">${isLive ? '<div class="ac-pulse-loader"></div>' : ''}${message}</div>`;

    panel.innerHTML = panelShell({
      headerLabel: `📝 AI Notes ${isLive ? '<span class="ac-live-dot">🔴 LIVE</span>' : ''}`,
      title,
      mainContentHTML,
      screenshots: capturedScreenshots,
      showCaptureBtn: isLive,   // ← naya, sirf live recording mein dikhega
      footerHTML: isLive ? `<div class="ac-notes-footer"><button id="ac-notes-stop">⏹️ Stop Live Notes</button></div>` : ''
    });

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');
    attachCloseAndCopy(panel, notes);

    document.getElementById('ac-notes-stop')?.addEventListener('click', handleStopClick);
}

  function showSavedNotesPanel(title, saved) {
    document.getElementById('ac-notes-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';
    panel.dataset.videoTitle = title;

    const savedDate = new Date(saved.savedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    panel.innerHTML = panelShell({
      headerLabel: `📝 AI Notes <span class="ac-saved-badge">💾 Saved</span>`,
      title,
      meta: `Saved on ${savedDate}`,
      mainContentHTML: `<div class="ac-notes-content">${formatNotesHTML(saved.notes)}</div><button id="ac-notes-copy">📋 Copy Notes</button>`,
      screenshots: saved.screenshots || [],
      footerHTML: `
        <div class="ac-notes-footer">
          <button id="ac-notes-pdf">📥 Download PDF</button>
          <button id="ac-notes-regenerate">🔄 Regenerate</button>
          <button id="ac-notes-delete">🗑️ Delete Notes</button>
        </div>
      `
    });

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');
    attachCloseAndCopy(panel, saved.notes);

    document.getElementById('ac-notes-pdf')?.addEventListener('click', async (e) => {
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = '⏳ Generating...';
      btn.disabled = true;
      try {
        await ACPdfExport.exportToPdf(title, saved.notes, saved.screenshots || []);
      } catch (err) {
        console.error('[AC Insights] PDF export failed:', err);
        alert('PDF generation failed. Check console for details.');
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });

    document.getElementById('ac-notes-regenerate')?.addEventListener('click', async () => {
      const config = await getApiConfig();
      if (!config.key) { showSettingsPrompt(); return; }
      await deleteNotes(title);
      panel.remove();
      try {
        await startLiveTranscription(title, config.key, config.provider);
      } catch (err) {
        showNotesPanel(title, null, `❌ Error: ${err.message}`);
      }
    });

    document.getElementById('ac-notes-delete')?.addEventListener('click', async () => {
      if (confirm('Delete saved notes?')) {
        await deleteNotes(title);
        panel.remove();
      }
    });
  }

  async function showSettingsPrompt() {
    document.getElementById('ac-notes-panel')?.remove();

    const existing = await getApiConfig();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';
    panel.innerHTML = `
      <div class="ac-notes-header">
        <span>⚙️ Setup Required</span>
        <button id="ac-notes-close">✕</button>
      </div>
      <div class="ac-notes-body">
        <p style="color:#94a3b8; margin-bottom:10px;">An API key is required for AI Notes.</p>

        <label style="font-size:11px; color:#64748b;">Provider</label>
        <select id="ac-provider-select" style="width:100%; padding:8px; margin:4px 0 10px;
          background:#0f172a; border:1px solid #334155; color:#f1f5f9; border-radius:6px; font-size:12px;">
          <option value="groq" ${existing.provider === 'groq' ? 'selected' : ''}>Groq (Free — gsk_...)</option>
          <option value="openai" ${existing.provider === 'openai' ? 'selected' : ''}>OpenAI (Paid — sk-...)</option>
        </select>

        <label style="font-size:11px; color:#64748b;">API Key</label>
        <input id="ac-api-key-input" type="password" placeholder="Enter your API key"
          value="${existing.key || ''}"
          style="width:100%; padding:8px; margin:4px 0 10px; background:#0f172a; border:1px solid #334155;
                 color:#f1f5f9; border-radius:6px; font-size:12px;" />

        <button id="ac-api-key-save">Save Key</button>
        ${existing.key ? '<button id="ac-api-key-remove">🗑️ Remove Saved Key</button>' : ''}
      </div>
    `;

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');

    document.getElementById('ac-notes-close')?.addEventListener('click', () => panel.remove());

    document.getElementById('ac-api-key-save')?.addEventListener('click', async () => {
      const key = document.getElementById('ac-api-key-input').value.trim();
      const provider = document.getElementById('ac-provider-select').value;
      const expectedPrefix = PROVIDERS[provider].keyPrefix;

      if (!key.startsWith(expectedPrefix)) {
        alert(`Please enter a valid ${PROVIDERS[provider].name} API key (it should start with ${expectedPrefix})`);
        return;
      }

      await saveApiConfig(key, provider);
      panel.remove();
      alert('✅ API Key saved! Now play a video and click 📝 to generate notes.');
    });

    document.getElementById('ac-api-key-remove')?.addEventListener('click', async () => {
      if (confirm('Remove the saved API key?')) {
        await removeApiConfig();
        panel.remove();
        alert('API key removed.');
      }
    });
  }

  // ============================================================
  // INJECT BUTTONS
  // ============================================================
  function injectNotesButtons() {
    document.querySelectorAll('li.lrn-path-cont').forEach(async item => {
      if (item.querySelector('.ac-notes-btn')) return;

      const titleEl = item.querySelector('.lrn-path-cont-name');
      const extrasEl = item.querySelector('.lrn-path-cont-extras');
      if (!titleEl || !extrasEl) return;

      const title = titleEl.textContent.trim();
      const saved = await loadNotes(title);

      const btn = document.createElement('button');
      btn.className = `ac-notes-btn ${saved ? 'has-saved' : ''}`;
      btn.title = saved ? 'View Saved Notes' : 'Start Live AI Notes';
      btn.innerHTML = saved ? '📄' : '📝';

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const config = await getApiConfig();
        if (!config.key) { showSettingsPrompt(); return; }

        const currentSaved = await loadNotes(title);
        if (currentSaved) {
          showSavedNotesPanel(title, currentSaved);
        } else {
          try {
            await startLiveTranscription(title, config.key, config.provider);
          } catch (err) {
            showNotesPanel(title, null, `❌ Error: ${err.message}`);
          }
        }
      });

      const settingsBtn = document.createElement('button');
      settingsBtn.className = 'ac-settings-btn';
      settingsBtn.title = 'AI Provider Settings';
      settingsBtn.innerHTML = '⚙️';

      settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSettingsPrompt();
      });

      extrasEl.appendChild(btn);
      extrasEl.appendChild(settingsBtn);
    });
  }

  return { injectNotesButtons, showSettingsPrompt };
})();