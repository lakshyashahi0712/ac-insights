// content/captions.js

const ACCaptions = (() => {

  let isRecording = false;
  let accumulatedTranscript = '';
  let notesUpdateCounter = 0;
  let currentVideoTitle = '';
  let currentApiKey = '';
  let currentVideoElement = null;

  // --- API Key ---
  async function getApiKey() {
    return new Promise(resolve =>
      chrome.storage.local.get(['ac_openai_key'], r => resolve(r['ac_openai_key'] || null))
    );
  }

  async function saveApiKey(key) {
    return new Promise(resolve =>
      chrome.storage.local.set({ 'ac_openai_key': key }, resolve)
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

  // --- Whisper API ---
  async function transcribe(blob, apiKey) {
    const formData = new FormData();
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'hi');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });

    if (res.status === 401) {
      await chrome.storage.local.remove('ac_openai_key');
      throw new Error('API key invalid/expired. Naya key enter karo.');
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Whisper API failed');
    }

    return (await res.json()).text;
  }

  // --- Groq Notes Generation ---
  async function generateNotes(transcript, title, apiKey) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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
        const text = await transcribe(blob, currentApiKey);
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
      const notes = await generateNotes(accumulatedTranscript, currentVideoTitle, currentApiKey);
      showNotesPanel(currentVideoTitle, notes, null, true);
      await saveNotes(currentVideoTitle, notes, accumulatedTranscript);
    } catch (err) {
      console.error('[AC Insights] Notes update failed:', err);
    }
  }

  async function startLiveTranscription(title, apiKey) {
    isRecording = true;
    accumulatedTranscript = '';
    notesUpdateCounter = 0;
    currentVideoTitle = title;
    currentApiKey = apiKey;

    const audioStream = captureRealVideoAudio();
    showNotesPanel(title, null, '🎙️ Live transcription shuru ho gaya... Video dekhte raho!', true);
    recordNextChunk(audioStream);
  }

  function stopLiveTranscription() {
    isRecording = false;
  }

  // --- Handle Stop Button (shows final state after stopping) ---
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
      const apiKey = await getApiKey();
      await deleteNotes(title);
      panel.remove();
      try {
        await startLiveTranscription(title, apiKey);
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

  function showSettingsPrompt() {
    document.getElementById('ac-notes-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'ac-notes-panel';
    panel.innerHTML = `
      <div class="ac-notes-header">
        <span>⚙️ Setup Required</span>
        <button id="ac-notes-close">✕</button>
      </div>
      <div class="ac-notes-body">
        <p style="color:#94a3b8; margin-bottom:12px;">AI Notes ke liye Groq API key chahiye.</p>
        <input id="ac-api-key-input" type="password" placeholder="gsk_..."
          style="width:100%; padding:8px; background:#0f172a; border:1px solid #334155;
                 color:#f1f5f9; border-radius:6px; font-size:12px;" />
        <button id="ac-api-key-save">Save Key</button>
      </div>
    `;

    document.body.appendChild(panel);
    makeDraggable(panel, '.ac-notes-header');

    document.getElementById('ac-notes-close')?.addEventListener('click', () => panel.remove());

    document.getElementById('ac-api-key-save')?.addEventListener('click', async () => {
      const key = document.getElementById('ac-api-key-input').value.trim();
      if (!key.startsWith('gsk_')) {
        alert('Valid Groq API key enter karo (gsk_ se shuru hoti hai)');
        return;
      }
      await saveApiKey(key);
      panel.remove();
      alert('✅ API Key saved! Ab video play karo aur 📝 click karo.');
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
        const apiKey = await getApiKey();
        if (!apiKey) { showSettingsPrompt(); return; }

        const currentSaved = await loadNotes(title);
        if (currentSaved) {
          showSavedNotesPanel(title, currentSaved);
        } else {
          try {
            await startLiveTranscription(title, apiKey);
          } catch (err) {
            showNotesPanel(title, null, `❌ Error: ${err.message}`);
          }
        }
      });

      extrasEl.appendChild(btn);
    });
  }

  // --- Tab visibility handler ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRecording) {
      console.log('[AC Insights] Tab hidden, recording may be affected');
    }
  });

  return { injectNotesButtons, showSettingsPrompt, getApiKey, saveApiKey };
})();