# AC Insights — Chrome Extension

> Analytics, productivity & AI-powered notes for Apna College students.

Built for the **Sigma Plus (DSA + Dev)** course on Apna College Premium — but works for any course on the platform with the same structure (DSA in Java/C++, Web Dev in JavaScript, AI/ML in Python, and theory-only lectures too).

---

## ✨ Features

### 📊 Course Analytics
- Auto-calculates **video count** and **total duration** for every topic — no more manually expanding sections
- Shows **remaining/unwatched duration** per topic at a glance
- Course-wide summary panel — total topics, videos, duration, completion %

### 📅 Study Planner
- Estimates days-to-finish the remaining course based on daily study time (30 min / 1 hr / 2 hr per day)

### 🔍 Search
- Instant lecture search with `Ctrl+K` — search across 500+ videos by name or topic
- Works both on the main page **and inside the video player** (the player runs in an embedded iframe, so the shortcut is attached there too — otherwise Chrome's own address-bar search would intercept it)
- Automatically expands collapsed topics and jumps straight to the selected video
- Floating search button (collapses on scroll, becomes translucent when idle)

### 🔖 Bookmarks
- Bookmark any video with one click
- Jump back to bookmarked lectures anytime from the popup

### 📝 Live AI Notes (the standout feature)
- Captures the **real-time audio** of the lecture as it plays, directly from the actual video element (via `MediaSource`/`captureStream()` + `MediaRecorder`) — no video downloading involved
- Transcribes it live using Whisper, in short rolling chunks, **decoupled from note generation** so audio capture never pauses while notes are being written
- Notes **stream in live**, typewriter-style, as they're generated
- Automatically detects the **programming language** in use (Java, C++, Python, JavaScript, etc.) from the transcript itself, and correctly skips the code section entirely for non-coding/theory lectures
- Notes are written in **Hinglish, Roman script** — matching how the teacher actually explains things
- **Screenshot capture**: periodically captures the video frame once the screen has been visually stable for a few seconds (so it grabs the finished board/IDE state, not a mid-transition blur), with a fallback timer for lectures where the teacher types continuously and the screen never fully "settles"
- Notes **auto-save** locally — revisit a video later and see the notes (and screenshots) instantly, no need to regenerate
- **Export to PDF** — a professionally formatted PDF with a branded header, section headings, code blocks, and all captured screenshots, generated entirely client-side
- "Regenerate" and "Delete" options for full control

### 🔄 Multi-Provider AI Support
- Choose between **Groq** (free, fast) or **OpenAI** (paid)
- Switch providers or update/remove your saved API key anytime from the settings panel (⚙️ next to each video)
- Keys are stored only in `chrome.storage.local` — never sent anywhere except directly to the chosen provider's API

### ⏭️ No More Auto-Skip
- Prevents the platform from automatically jumping to the next video the instant one ends, so you're not rushed past the end screen

### 🖱️ UX Details
- All panels are **draggable**
- Dark, minimal UI that matches the platform's aesthetic
- Uses `unlimitedStorage` so saved notes and screenshots across many videos never hit Chrome's default storage cap
- Zero interference with the original site — everything is a non-destructive overlay

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Extension | Manifest V3, vanilla JavaScript |
| DOM handling | `MutationObserver` (handles Vue.js SPA re-renders, including inside the video iframe) |
| Audio capture | `MediaSource`/`captureStream()`, `MediaRecorder` |
| Speech-to-text | Groq (Whisper `large-v3`) or OpenAI (Whisper `whisper-1`) |
| Note generation | Groq (`openai/gpt-oss-120b`) or OpenAI (`gpt-4o-mini`), streamed token-by-token |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF), rendered fully client-side |
| Storage | `chrome.storage.local` with `unlimitedStorage` |

---

## 📦 Installation (Developer Mode)

1. Clone this repo
   ```bash
   git clone https://github.com/lakshyashahi0712/ac-insights.git
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
3. Add billing — usage is inexpensive but requires a funded account

Then:
1. Click 📝 on any video in the course
2. Choose your provider from the dropdown and paste the key
3. To switch providers or remove a saved key later, click the ⚙️ icon next to any video — the same settings panel lets you update or delete it

---

## 🧠 How Live AI Notes Work

```
Video plays (the real player, not downloaded)
        ↓
Audio captured live via MediaSource/MediaRecorder, in rolling ~15s chunks
        ↓
Each chunk sent to Whisper for transcription — recording never pauses for this
        ↓
Transcript accumulates as you watch
        ↓
Periodically, the accumulated transcript → LLM → notes, streamed live
        ↓
In parallel, the video frame is captured once it's been visually stable
for a few seconds (or on a fallback timer during continuous typing)
        ↓
Notes + screenshots shown live and auto-saved to chrome.storage
        ↓
Come back later → instantly see saved notes and screenshots, or export to PDF
```

This was the hardest part to get right — Apna College's videos have no captions/subtitles, so the only way to get an accurate transcript is to capture the actual lecture audio in real time as it plays, rather than relying on the video title alone (which produces generic, inaccurate notes). Combining that with stability-based screenshots means notes now capture both what the teacher *said* and what they *wrote on screen* — including exact code, without ever downloading the video itself.

---

## 📂 Project Structure

```
ac-insights/
├── manifest.json
├── lib/
│   └── jspdf/
│       └── jspdf.umd.min.js
├── background/
│   └── service-worker.js
├── content/
│   ├── main.js
│   ├── parser.js
│   ├── ui.js
│   ├── search.js
│   ├── bookmarks.js
│   ├── captions.js
│   ├── pdf-export.js
│   ├── prevent-autonext.js
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

---

## ⚠️ Disclaimer

This is an **unofficial, independently-built** extension created by a student, for students. It is not affiliated with or endorsed by Apna College. It does not modify, redistribute, or download any course video content — it only reads the page's DOM and captures live audio/video frames (locally, in-browser) to generate personal study notes, exactly as a screen recorder would capture what's already playing on screen. All processing happens client-side; no course content is ever uploaded or stored on any server other than the transcription/note-generation calls made directly to the user's chosen AI provider, using the user's own API key.

---

## 🙋 About

Built by **Lakshya** — 3rd-year student Sigma Plus (DSA + Dev) student at Apna College.

If you're an Apna College student and this helped you, feel free to star ⭐ the repo!