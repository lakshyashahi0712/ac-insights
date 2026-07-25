// content/captions.js

const ACCaptions = (() => {

  let isRecording = false;
  let accumulatedTranscript = '';
  let notesUpdateCounter = 0;
  let currentVideoTitle = '';
  let currentApiKey = '';
  let currentProvider = 'groq';
  let currentVideoElement = null;

  const PROVIDERS = {
    groq: {
      name: 'Groq',
      keyPrefix: 'gsk_',
      transcribeUrl: 'https://api.groq.com/openai/v1/audio/transcriptions',
      chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
      transcribeModel: 'whisper-large-v3',
      chatModel: 'llama-3.3-70b-versatile'
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

  // --- API Config (key + provider) ---
  async function getApiConfig() {
    return new Promise(resolve =>
      chrome.storage.local.get(['ac_api_key', 'ac_api_provider'], r =>
        resolve({
          key: r['ac_api_key'] || null,
          provider: r['ac_api_provider'] || 'groq'
        })
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

  // --- Notes Storage ---
  function getNotesKey(title) {
    return `ac_notes_${title.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  async function saveNotes(title, notes, transcript) {
    const key = getNotesKey(title);
    return new Promise((resolve, reject) =>
      chrome.storage.local.set({
        [key]: { notes, transcript, videoTitle: title, savedAt: Date.now() }
      }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      })
    );
  }

  async function loadNotes(title) {
    const key = getNotesKey(title);
    return new Promise(resolve =>
      chrome.storage.local.get([key], r => resolve(r[key] || null))
    );
  }

  async function deleteNotes(title) {
    return new Promise(resolve =>
      chrome.storage.local.remove(getNotesKey(title), resolve)
    );
  }

  // --- Audio Capture ---
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

  // --- Transcription (provider-aware) ---
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

 // --- Notes Generation (provider-aware) ---
  async function generateNotes(transcript, title, apiKey, provider) {
    const config = PROVIDERS[provider];

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
        messages: [{
          role: 'user',
          content: `You are an expert programming teacher. Below is a lecture transcript for the video "${title}".

TRANSCRIPT:
${transcript}

Create DETAILED study notes from this transcript — do not write a generic summary.

FIRST, detect which programming language this lecture is about from the transcript (Java, C++, Python, JavaScript, or any other) — write the code section in that detected language, do not assume Java.

## ${title}

### Concept Explanation
(Explain exactly how the teacher explained it — include all examples and analogies mentioned in the transcript)

### Key Definitions
(If the teacher defined any terms, write them close to the original wording)

### Examples Discussed
(List the specific examples/numbers/cases discussed in the transcript)

### Code/Logic (if mentioned)
(Convert any programming logic explained verbally — using the detected language's correct syntax — wrap it in a code block with the correct language tag, e.g. \`\`\`python or \`\`\`cpp or \`\`\`java)

### Common Mistakes/Tips
(Any warning or tip the teacher gave)

RULES:
- Only write what was actually said in the transcript, do not make things up
- Write the notes content in Hinglish using ROMAN/ENGLISH script only (e.g. "yeh function declare karna hota hai") — do NOT use Devanagari/Hindi script (do not write हिंदी अक्षर)
- Detect the code language from the transcript, do not assume Java
- If the video is still playing, add at the end: "⚠️ Note: Video is still playing, these are notes so far"
- If a section has no relevant content, write "Not mentioned in transcript" instead of leaving it blank`
        }]
      })
    });

    if (res.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Notes generation failed');
    }

    return (await res.json()).choices[0].message.content;
  }

  // --- Notes Formatting ---
  function formatNotesHTML(notes) {
    return notes
      .replace(/```(\w+)?([\s\S]*?)```/g, '<pre class="ac-code-block"><code>$2</code></pre>')
      .replace(/### (.*)/g, '<h4 class="ac-notes-h4">$1</h4>')
      .replace(/## (.*)/g, '<h3 class="ac-notes-h3">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // --- Live Recording ---
  function recordNextChunk(audioStream) {
    if (!isRecording) return;

    if (currentVideoElement?.paused) {
      console.log('[AC Insights] Video paused, stopping recording');
      stopLiveTranscription();
      return;
    }

    const chunks = [];
    const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });

      if (blob.size < 1000) {
        console.warn('[AC Insights] Empty chunk skipped');
        if (isRecording) recordNextChunk(audioStream);
        return;
      }

      try {
        const text = await transcribe(blob, currentApiKey, currentProvider);
        accumulatedTranscript += text + ' ';
        await updateLiveNotes();
      } catch (err) {
        console.error('[AC Insights] Chunk failed (skipping):', err.message);
      }

      if (isRecording) recordNextChunk(audioStream);
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, 30000);
  }

  async function updateLiveNotes() {
    notesUpdateCounter++;
    const wordCount = accumulatedTranscript.split(' ').length;
    showNotesPanel(currentVideoTitle, null, `📝 Listening... (${wordCount} words captured)`, true);

    if (notesUpdateCounter % 2 !== 0) return;

    try {
      const notes = await generateNotes(accumulatedTranscript, currentVideoTitle, currentApiKey, currentProvider);
      showNotesPanel(currentVideoTitle, notes, null, true);
      await saveNotes(currentVideoTitle, notes, accumulatedTranscript);
    } catch (err) {
      console.error('[AC Insights] Notes update failed:', err);
    }
  }

  async function startLiveTranscription(title, apiKey, provider) {
    isRecording = true;
    accumulatedTranscript = '';
    notesUpdateCounter = 0;
    currentVideoTitle = title;
    currentApiKey = apiKey;
    currentProvider = provider;

    const audioStream = captureRealVideoAudio();
    showNotesPanel(title, null, '🎙️ Live transcription started... Keep watching the video!', true);
    recordNextChunk(audioStream);
  }

  function stopLiveTranscription() {
    isRecording = false;
  }

  async function handleStopClick() {
    stopLiveTranscription();
    const saved = await loadNotes(currentVideoTitle);
    if (saved) {
      showSavedNotesPanel(currentVideoTitle, saved);
    } else {
      showNotesPanel(currentVideoTitle, null, '⏹️ Live notes stopped. No notes have been generated yet.', false);
    }
  }

  // --- UI Panels ---
  function attachCommonListeners(panel, notes) {
    document.getElementById('ac-notes-close')?.addEventListener('click', () => {
      stopLiveTranscription();
      panel.remove();
    });

    document.getElementById('ac-notes-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(notes);
      const btn = document.getElementById('ac-notes-copy');
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.textContent = '📋 Copy Notes'; }, 2000);
    });
  }

  function showNotesPanel(title, notes, message, isLive = false) {
    document.getElementById('ac-notes-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';
    panel.innerHTML = `
      <div class="ac-notes-header">
        <span>📝 AI Notes ${isLive ? '<span class="ac-live-dot">🔴 LIVE</span>' : ''}</span>
        <button id="ac-notes-close">✕</button>
      </div>
      <div class="ac-notes-title">${title}</div>
      <div class="ac-notes-body">
        ${notes
          ? `<div class="ac-notes-content">${formatNotesHTML(notes)}</div>
             <button id="ac-notes-copy">📋 Copy Notes</button>`
          : `<div class="ac-notes-message">
               ${isLive ? '<div class="ac-pulse-loader"></div>' : ''}
               ${message}
             </div>`
        }
      </div>
      ${isLive ? `<div class="ac-notes-footer"><button id="ac-notes-stop">⏹️ Stop Live Notes</button></div>` : ''}
    `;

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');
    attachCommonListeners(panel, notes);

    document.getElementById('ac-notes-stop')?.addEventListener('click', handleStopClick);
  }

  function showSavedNotesPanel(title, saved) {
    document.getElementById('ac-notes-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';

    const savedDate = new Date(saved.savedAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    panel.innerHTML = `
      <div class="ac-notes-header">
        <span>📝 AI Notes <span class="ac-saved-badge">💾 Saved</span></span>
        <button id="ac-notes-close">✕</button>
      </div>
      <div class="ac-notes-title">${title}</div>
      <div class="ac-notes-meta">Saved on ${savedDate}</div>
      <div class="ac-notes-body">
        <div class="ac-notes-content">${formatNotesHTML(saved.notes)}</div>
        <button id="ac-notes-copy">📋 Copy Notes</button>
      </div>
      <div class="ac-notes-footer">
        <button id="ac-notes-regenerate">🔄 Regenerate</button>
        <button id="ac-notes-delete">🗑️ Delete Notes</button>
      </div>
    `;

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');
    attachCommonListeners(panel, saved.notes);

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

  // --- Inject Buttons ---
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

    // Settings button — hamesha available, provider/key switch karne ke liye
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

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
      console.log('[AC Insights] Tab hidden, recording may be affected');
    }
  });

  return { injectNotesButtons, showSettingsPrompt, getApiConfig, saveApiConfig, removeApiConfig };
})();