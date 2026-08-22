# AC Insights

**A free Chrome add-on for Apna College students.** It shows you how much of your course is
left, helps you plan when you'll finish, lets you search all your lectures instantly, and can
write notes for you while you watch.

Made for **Sigma Plus (DSA + Dev)**, and works with other Apna College courses too
(DSA in Java/C++, Web Dev, AI/ML, and theory lectures).

No account to create. No payment. Nothing leaves your computer.

---

## What it does

| | |
|---|---|
| 📊 **See your real progress** | How many videos and hours each topic has, how much you've finished, and how much is actually left |
| 🎯 **Plan your finish date** | Pick the date you want to be done by, and it tells you how many hours a day you need |
| 🔍 **Find any lecture instantly** | Press `Ctrl + K` and type — no scrolling through hundreds of videos |
| 🔖 **Bookmark lectures** | Save the ones you want to come back to |
| 📝 **AI notes while you watch** | Listens to the lecture and writes notes in Hinglish, with screenshots of the code. Save as PDF. *(optional — needs a free key, explained below)* |
| ⏭️ **Stop auto-skip** | The site jumps to the next video the second one ends. This stops that. You can turn it off whenever you like |

---

## Before you start

You need two things:

1. **Google Chrome** on a laptop or desktop (Microsoft Edge and Brave also work — they're built on Chrome). This does **not** work on a phone or tablet.
2. Your usual **Apna College login**.

Installing takes about 5 minutes. You don't need to know any coding.

---

## Step 1 — Install it

### 1a. Download the files

Go to **https://github.com/lakshyashahi0712/ac-insights**

Click the green **`< > Code`** button near the top right, then click **Download ZIP**.

A file called `ac-insights-main.zip` lands in your Downloads folder.

### 1b. Unzip it

Right-click the downloaded file → **Extract All…** (Windows) or double-click it (Mac).

> ### ⚠️ Please read this bit — it's the one thing people get wrong
>
> Put the unzipped folder somewhere you won't touch it again — for example
> `Documents\ac-insights`, **not** your Downloads folder.
>
> Chrome doesn't copy these files. It reads them from that folder every single time you
> open Chrome. **If you delete, rename or move the folder later, the extension stops
> working.** So don't "clean up Downloads" afterwards.

### 1c. Open Chrome's extensions page

Copy this, paste it into Chrome's address bar, and press Enter:

```
chrome://extensions
```

*(Clicking it won't work — Chrome only opens this if you type or paste it.)*

### 1d. Switch on Developer mode

Look at the **top-right** of that page. There's a small toggle labelled **Developer mode**.
Turn it **on**. Three new buttons appear along the top.

### 1e. Load the folder

Click **Load unpacked** (top-left). A folder picker opens.

> ### ⚠️ Pick the *right* folder
>
> Unzipping usually gives you a folder inside a folder. You need the **inner** one — the one
> that has a file called **`manifest.json`** sitting directly inside it.
>
> ```
> ac-insights-main/          ← after unzipping you land here
>    └── ac-insights-main/   ← 👈 CHOOSE THIS ONE
>          ├── manifest.json      (if you can see this file, you're in the right place)
>          ├── content/
>          ├── popup/
>          └── ...
> ```
>
> If Chrome shows a red error like *"Manifest file is missing or unreadable"*, you picked
> the outer folder. Click **Load unpacked** again and go one level deeper.

Once it works, a card saying **AC Insights 1.0.0** appears on the page. That's it — it's installed.

### 1f. Pin it so you can find it

Click the **🧩 puzzle-piece icon** in Chrome's toolbar (top right), find **AC Insights** in the
list, and click the **📌 pin** next to it. Its icon now stays in your toolbar.

---

## Step 2 — Open your course

Log in to Apna College and open any course as you normally would.

The extension switches on by itself. You'll notice:

- **Small labels next to each topic** showing the number of videos and total time
- **A summary box** with your overall progress and the study planner
- **A 🔖 button on each video** to bookmark it
- **A floating search button**, or just press `Ctrl + K`

Nothing on the site is changed or damaged — everything the extension adds sits on top, and
disappears the moment you remove the extension.

Click the **AC Insights icon** in your toolbar to see your progress, your bookmarks, and the
auto-skip switch.

> If you study more than one course, the extension keeps each one **completely separate** —
> its own progress, bookmarks, notes and target date. The popup has a dropdown to switch
> between them, or view **All courses** together.

---

## Step 3 — Set your finish date (optional)

In the summary box on the course page, find **🎯 Finish by** and pick a date.

It immediately tells you how much you need to watch **per day** to get there, and roughly how
many videos a day that is. If the pace is unrealistic it warns you:

- Over ~4 hours a day → *"that's a heavy pace"*
- More than physically fits in a day → *"pick a later date"*

Your date is saved automatically, separately for each course.

---

## Step 4 — Turn on AI notes (optional, free)

This is the big feature: while a lecture plays, the extension listens to it and writes proper
notes for you — in Hinglish, the way the teacher actually explains — plus screenshots of the
code on screen. You can export the whole thing as a PDF.

For this one feature it needs a **free key** from an AI service. It takes 2 minutes and does
**not** need a credit card.

### 4a. Get your free key

1. Go to **https://console.groq.com**
2. Sign up — the **"Continue with Google"** button is the fastest way
3. On the left, click **API Keys**
4. Click **Create API Key**, give it any name you like (e.g. `apna`), and confirm
5. A long code starting with `gsk_...` appears. **Copy it now** — Groq only shows it once
6. Paste it somewhere safe for a moment (Notepad is fine) while you do the next step

> Groq is free for normal study use. There's also an OpenAI option in the settings if you
> prefer it, but that one needs a paid account — Groq is the recommended choice.

### 4b. Give the key to the extension

1. On your course page, click the **⚙️ gear icon** next to any video
2. Leave the provider set to **Groq**
3. Paste your `gsk_...` key into the box and save

Done. You only ever do this once.

### 4c. Make notes for a lecture

The **order matters** here:

1. **Open the lecture and press play.** Let it actually start playing, with sound on.
2. **Now** click the **📝 icon** next to that video.
3. A panel appears saying **"Listening…"** and the word count starts climbing. Notes begin
   writing themselves after a short while.
4. **Just keep watching.** Don't close the tab. Notes and screenshots keep building as the
   lecture goes.
5. When the video ends, notes finish automatically. To stop early, click **⏹️ Stop Live Notes**
   and give it a few seconds to finish writing.

If you click 📝 while the video is **paused**, you'll get a message telling you to press play
first. That's expected — it needs the lecture to actually be playing to hear it.

### 4d. Come back to your notes anytime

Once a video has notes, its icon changes from **📝** to **📄**. Click that to reopen the saved
notes and screenshots instantly — no waiting, no regenerating.

Inside that panel you get:

- **📥 Download PDF** — a properly formatted PDF with headings, code and all screenshots
- **🔄 Regenerate** — throw them away and write fresh ones
- **🗑️ Delete Notes**

---

## The buttons, at a glance

| You see | It means |
|---|---|
| 🔖 | Bookmark this lecture |
| 📝 | Start writing notes for this lecture *(play the video first)* |
| 📄 | This lecture already has saved notes — click to read them |
| ⚙️ | AI settings — add, change or remove your key |
| ⏹️ | Stop taking notes now |
| 🎯 | Set your target finish date |
| `Ctrl + K` | Search all lectures |

All the panels can be **dragged** around by their title bar at the top if they're covering
something.

---

## Something not working?

| What you're seeing | What to do |
|---|---|
| **Nothing appears on the course page** | Refresh the page (`F5`). The extension only runs on `apnacollege.in` — you won't see anything on other sites. |
| **It worked before, now it's gone** | You most likely moved, renamed or deleted the unzipped folder. Put it back, then go to `chrome://extensions` and click the **↻ reload** arrow on the AC Insights card. |
| **Red "Manifest file is missing or unreadable"** | You chose the wrong folder when loading. Load it again and pick the inner folder — the one containing `manifest.json`. |
| **"Video is paused. Please ▶️ play the video first"** | Exactly what it says: press play, wait a second, then click 📝. |
| **Notes came out empty** | The lecture needs to be actually playing with sound. If the tab or video was muted, there may have been nothing to hear. Play it properly and hit 🔄 Regenerate. |
| **"Setup Required" popup** | Your key isn't saved yet, or it was removed. Go back to Step 4. |
| **Notes stopped partway** | Usually the key hit its free limit, or the internet dropped. Wait a bit and click 🔄 Regenerate. |
| **`Ctrl + K` does nothing** | Click once anywhere on the page first so it's focused, then try again. |
| **Chrome says "Disable developer mode extensions"** | Normal for any extension installed this way. Click **Cancel** / close it — don't remove the extension. |
| **Progress numbers look wrong** | Apna College occasionally changes their page layout. Refresh first; if it persists, please [open an issue](https://github.com/lakshyashahi0712/ac-insights/issues). |

---

## Common questions

**Is this safe? Will my account get banned?**
It only *reads* what's already on your screen and adds its own panels on top. It doesn't touch
your account, log in for you, change anything on the site, or download any videos. It's the
same kind of thing as an ad blocker or a dark-mode extension.

**Does it cost anything?**
No. The extension is free, and the Groq key for AI notes is free for normal study use with no
card required.

**Where is my data kept?**
On your own computer, in your browser's storage. Your progress, bookmarks, notes and key never
go to me or to any server of mine. The only thing that ever leaves your machine is the lecture
audio sent to the AI service you chose — using your own key — to be turned into notes.

**Can it download the lectures for me?**
No, and that's deliberate. It listens to the audio while the real player plays it, exactly like
a screen recorder would. No video file is ever saved or shared.

**Do I need to keep the tab open while notes are being made?**
Yes. It's listening live, so it needs the lecture playing in that tab. You can work in another
window, but don't close or reload the course tab.

**Will it update itself?**
No — because you installed it manually. To get a newer version, download the ZIP again, replace
the old folder, and click the **↻ reload** arrow on `chrome://extensions`.

**How do I remove it?**
`chrome://extensions` → **Remove** on the AC Insights card. Your saved notes go with it.
Export any PDFs you want to keep first.

---

## Want to help, or curious how it works?

Found a bug or have an idea? [Open an issue](https://github.com/lakshyashahi0712/ac-insights/issues) —
plain English is completely fine, you don't need to know how to code.

<details>
<summary><b>For developers</b> — architecture, tech stack, running the tests (click to expand)</summary>

<br>

### Tech stack

| Layer | Tech |
|---|---|
| Extension | Manifest V3, vanilla JavaScript, no build step |
| DOM handling | `MutationObserver` (handles Vue.js SPA re-renders, including inside the video iframe) |
| Audio capture | `MediaSource`/`captureStream()`, `MediaRecorder` |
| Speech-to-text | Groq (Whisper `large-v3`) or OpenAI (`whisper-1`) |
| Note generation | Groq (`openai/gpt-oss-120b`) or OpenAI (`gpt-4o-mini`), streamed token-by-token |
| PDF export | [jsPDF](https://github.com/parallax/jsPDF), fully client-side |
| Storage | `chrome.storage.local` with `unlimitedStorage`, versioned per-course schemas |

### How live AI notes work

```
Video plays (the real player, nothing downloaded)
        ↓
Audio captured live via MediaSource/MediaRecorder, in rolling ~15s chunks
        ↓
Each chunk sent to Whisper — recording never pauses for this
        ↓
Transcript accumulates as you watch
        ↓
Periodically, accumulated transcript → LLM → notes, streamed live
        ↓
In parallel, the video frame is captured once it's been visually stable for a
few seconds (fallback timer for lectures with continuous typing)
        ↓
Notes + screenshots shown live and auto-saved to chrome.storage
        ↓
Revisit later → saved notes and screenshots instantly, or export to PDF
```

Apna College's videos have no captions, so the only route to an accurate transcript is
capturing the real lecture audio as it plays — titles alone produce generic, wrong notes.
Pairing that with stability-based screenshots captures both what the teacher *said* and what
they *wrote*, including exact code, without ever downloading the video.

Language detection (Java / C++ / Python / JS) is inferred from the transcript itself, and the
code section is skipped entirely for theory-only lectures.

### Project structure

```
ac-insights/
├── manifest.json
├── lib/jspdf/jspdf.umd.min.js
├── background/service-worker.js
├── content/
│   ├── main.js              entry point, orchestration
│   ├── parser.js            reads topics/videos out of the DOM
│   ├── ui.js                summary card, planner, deadline mode
│   ├── search.js            Ctrl+K search (page + iframe)
│   ├── bookmarks.js
│   ├── caption.js           audio capture, transcription, live notes
│   ├── pdf-export.js
│   ├── prevent-autonext.js
│   ├── storage.js           per-course cache + deadlines
│   └── observer.js          MutationObserver wiring
├── utils/
│   ├── duration.js          duration parsing, planner + deadline math
│   ├── course.js            course identification and registry
│   └── draggable.js
├── popup/                   popup.html / .js / .css
├── styles/injected.css
└── tests/
    ├── helpers/             load.js (vm harness), fake-chrome.js
    ├── duration.test.js
    ├── course-scope.test.js
    └── notes-finalize.test.js
```

### Running the tests

Zero dependencies — Node's built-in runner (Node 20+) over the real source files:

```bash
npm test
```

37 tests covering the deadline/duration math, per-course storage scoping and migration, and
the notes-finalize control flow. See [tests/README.md](tests/README.md) for what's covered,
what isn't, and how to add a test.

### Packaging

`tests/` and `package.json` are dev-only and marked `export-ignore`, so this produces a clean
store upload:

```bash
git archive --format=zip -o ac-insights.zip HEAD
```

</details>

---

## ⚠️ Disclaimer

This is an **unofficial, independently-built** extension created by a student, for students. It
is not affiliated with or endorsed by Apna College. It does not modify, redistribute, or
download any course video content — it only reads the page's DOM and captures live audio/video
frames (locally, in-browser) to generate personal study notes, exactly as a screen recorder
would capture what's already playing on screen. All processing happens client-side; no course
content is ever uploaded or stored on any server other than the transcription/note-generation
calls made directly to the user's chosen AI provider, using the user's own API key.

---

## 🙋 About

Built by **Lakshya** — a 3rd-year student on Sigma Plus (DSA + Dev) at Apna College.

If this helped you, a ⭐ on the repo is appreciated.
