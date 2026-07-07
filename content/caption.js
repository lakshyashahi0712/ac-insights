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

    if (!acVideo) throw new Error('Video player nahi mila. Pehle video PLAY karo, phir 📝 click karo.');
    if (acVideo.paused) throw new Error('Video paused hai. Pehle ▶️ play karo, phir 📝 click karo.');

    currentVideoElement = acVideo;

    const stream = acVideo.captureStream?.() || acVideo.mozCaptureStream?.();
    const audioTracks = stream?.getAudioTracks() || [];

    if (audioTracks.length === 0) throw new Error('Audio track nahi mila. Video properly play ho raha hai?');

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
      throw new Error('API key invalid/expired. Naya key enter karo.');
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
          content: `Tum ek expert DSA teacher ho jo Java padhata hai. Neeche ek lecture transcript hai video "${title}" ka.

TRANSCRIPT:
${transcript}

Is transcript se DETAILED study notes banao — sirf generic summary mat do.

## ${title}

### Concept Explanation
(Teacher ne jo exact tareeke se samjhaya — examples, analogies sab include karo)

### Key Definitions
(Teacher ne jo terms define kiye, unke close wording mein likho)

### Examples Discussed
(Specific examples/numbers/cases jo transcript mein hain)

### Code/Logic (agar mentioned ho)
(Jo bhi programming logic verbally explain hua — "if", "for loop", "modulo" etc — Java code mein convert karo)

### Common Mistakes/Tips
(Koi warning ya tip jo teacher ne di ho)

RULES:
- Sirf transcript mein jo bola gaya wahi likho
- Hinglish mein likho
- Agar video chal rahi hai: "⚠️ Note: Video abhi chal rahi hai, yeh ab tak ke notes hain"
- Khaali section mein "Mentioned nahi transcript mein" likho`
        }]
      })
    });

    if (res.status === 429) throw new Error('Rate limit hit. Thodi der ruk ke try karo.');
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Notes generation failed');
    }

    return (await res.json()).choices[0].message.content;
  }

  // --- Notes Formatting ---
  function formatNotesHTML(notes) {
    return notes
      .replace(/```java([\s\S]*?)```/g, '<pre class="ac-code-block"><code>$1</code></pre>')
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
    showNotesPanel(title, null, '🎙️ Live transcription shuru ho gaya... Video dekhte raho!', true);
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
      showNotesPanel(currentVideoTitle, null, '⏹️ Live notes stopped. Koi notes generate nahi hui abhi tak.', false);
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
      if (confirm('Saved notes delete karein?')) {
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
        <p style="color:#94a3b8; margin-bottom:10px;">AI Notes ke liye API key chahiye.</p>

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
        alert(`Valid ${PROVIDERS[provider].name} API key enter karo (${expectedPrefix} se shuru hoti hai)`);
        return;
      }

      await saveApiConfig(key, provider);
      panel.remove();
      alert('✅ API Key saved! Ab video play karo aur 📝 click karo.');
    });

    document.getElementById('ac-api-key-remove')?.addEventListener('click', async () => {
      if (confirm('Saved API key remove karna hai?')) {
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

      extrasEl.appendChild(btn);
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
      console.log('[AC Insights] Tab hidden, recording may be affected');
    }
  });

  return { injectNotesButtons, showSettingsPrompt, getApiConfig, saveApiConfig, removeApiConfig };
})();