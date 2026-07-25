# AC Insights — Chrome Extension

> Analytics, productivity & AI-powered notes for Apna College Premium students.

Built for the **Sigma Plus (DSA + Dev)** course on Apna College Premium — but works for any course on the platform with the same structure.

---

## ✨ Features

### 📊 Course Analytics
- Auto-calculates **video count** and **total duration** for every topic — no more manually expanding sections
- Course-wide summary panel — total topics, total videos, total duration
- Live progress tracking — completed vs remaining videos, completion %

### 📅 Study Planner
- Estimates days-to-finish the remaining course based on daily study time (30 min / 1 hr / 2 hr per day)

### 🔍 Search
- Instant lecture search with `Ctrl+K` — search across 500+ videos by name or topic
- Floating search button (collapses on scroll, becomes translucent when idle)

### 🔖 Bookmarks
- Bookmark any video with one click
- Jump back to bookmarked lectures anytime from the popup

### 📝 Live AI Notes (the standout feature)
- Captures the **real-time audio** of the lecture as it plays (via `MediaSource` + `MediaRecorder` on the actual video element — no video downloading involved)
- Transcribes it live using Whisper
- Feeds the transcript into an LLM to generate **structured, detailed notes** — including Java code/logic — grounded in exactly what the teacher explains, not a generic AI summary
- Notes **auto-save** locally — revisit a video later and see the notes instantly, no need to regenerate
- "Regenerate" and "Delete" options for full control

### 🔄 Multi-Provider AI Support
- Choose between **Groq** (free, fast — Whisper + Llama 3.3 70B) or **OpenAI** (paid — Whisper + GPT-4o-mini)
- Switch providers or update/remove your saved API key anytime from the settings panel
- Keys are stored only in `chrome.storage.local` — never sent anywhere except directly to the chosen provider's API

### 🖱️ UX Details
- All panels are **draggable**
- Dark, minimal UI that matches the platform's aesthetic
- Zero interference with the original site — everything is a non-destructive overlay

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Extension | Manifest V3, vanilla JavaScript |
| DOM handling | `MutationObserver` (handles Vue.js SPA re-renders) |
| Audio capture | `MediaSource API`, `captureStream()`, `MediaRecorder` |
| Speech-to-text | Groq (Whisper `large-v3`) or OpenAI (Whisper `whisper-1`) |
| Note generation | Groq (Llama `3.3-70b-versatile`) or OpenAI (`gpt-4o-mini`) |
| Storage | `chrome.storage.local` |

---

## 📦 Installation (Developer Mode)

1. Clone this repo
   ```bash
   git clone https://github.com/<your-username>/ac-insights.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load Unpacked** → select the cloned folder
5. Open any course on Apna College Premium — the extension activates automatically

---

## 🔑 Setup for AI Notes

AI Notes need an API key from either provider:

**Option A — Groq (free, recommended)**
1. Sign up at [console.groq.com](https://console.groq.com) (Google login works)
2. Go to **API Keys** → **Create API Key**

**Option B — OpenAI (paid)**
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Go to **API Keys** → **Create new secret key**
3. Add billing — Whisper/GPT-4o-mini calls are inexpensive but require a funded account

Then:
1. Click 📝 on any video in the course
2. Choose your provider from the dropdown and paste the key
3. To switch providers or remove a saved key later, click 📝 again — the same settings panel lets you update or delete it

---

## 🧠 How Live AI Notes Work

```
Video plays (real player, not downloaded)
        ↓
Audio track captured live via MediaSource/MediaRecorder
        ↓
30-second chunks sent to Whisper for transcription
        ↓
Transcript accumulates as you watch
        ↓
Every ~60s, accumulated transcript → LLM → structured notes
        ↓
Notes shown live + auto-saved to chrome.storage
        ↓
Come back later → instantly see saved notes, no re-recording needed
```

This was the hardest part to get right — Apna College's videos have no captions/subtitles, so the only way to get an accurate transcript was to capture the actual lecture audio in real time as it plays, rather than relying on the video title alone (which produces generic, inaccurate notes).

---

## 📂 Project Structure

```
ac-insights/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── main.js
│   ├── parser.js
│   ├── ui.js
│   ├── search.js
│   ├── bookmarks.js
│   ├── captions.js
│   ├── storage.js
│   └── observer.js
├── utils/
│   ├── duration.js
│   └── draggable.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── styles/
    └── injected.css
```

---

## ⚠️ Disclaimer

This is an **unofficial, independently-built** extension created by a student, for students. It is not affiliated with or endorsed by Apna College. It does not modify, redistribute, or download any course video content — it only reads the page's DOM and captures live audio (locally, in-browser) to generate personal study notes. All processing happens client-side; no course content is ever uploaded or stored on any server other than the transcription/note-generation calls made directly to the user's chosen AI provider, using the user's own API key.

---

## 🙋 About

Built by **Lakshya** — Sigma Plus (DSA + Dev) student at Apna College.

If you're an Apna College student and this helped you, feel free to star ⭐ the repo!
