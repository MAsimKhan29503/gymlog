# ANSWERS.md

---

## 1. How to Run

**Requirements:** Node.js v16 or higher — download from https://nodejs.org

```bash
npm install
npm start
```

Then open **http://localhost:3000** in any browser.

Data persists automatically in the `db/` folder. Close the server, restart it, and all sessions and exercises will still be there.

---

## 2. Stack Choice

**Stack:** Node.js + Express + NeDB + plain HTML/CSS/JS (no frontend framework)

**Why this stack:**

- **Node.js + Express** is the fastest way to get a working REST API running. No boilerplate, no config files, single runtime. Anyone with Node installed can run this in 30 seconds.
- **NeDB** is a pure JavaScript embedded database that writes to flat files. No native compilation, no database server to install or configure, no `brew install`, no `apt-get`. It works identically on Windows, Mac, and Linux. The data files are human-readable. For a "fresh machine" requirement, this is the correct choice.
- **Plain HTML/CSS/JS** for the frontend means zero build step, zero bundlers, zero `webpack.config.js` confusion. The frontend is a single file the browser runs directly.

**What would have been a worse choice:**

- **Python + SQLite** would require compiling the `pysqlite3` bindings on some systems and managing virtual environments (`venv`, `pip`, interpreter version conflicts). Not simpler for the end user.
- **React + Vite** would require a build step, Node dev server AND a separate API server, and introduce hundreds of transitive dependencies. Total overkill for a CRUD app.
- **MongoDB** would require a running database daemon, authentication setup, and a network connection — three things that can fail on a fresh machine.

---

## 3. One Real Edge Case

**The edge case:** Empty or incomplete set rows are silently skipped when saving an exercise.

**File:** `public/index.html`, function `submitExercise()` — the `.forEach` loop over `.set-row` elements:

```javascript
// public/index.html — submitExercise(), inside the .set-row forEach
if (weight && reps) sets.push({ weight: parseFloat(weight), reps: parseInt(reps), unit });
```

The UI lets users add as many set rows as they want. A user who clicks "+ Add Set" but leaves the fields blank (or fills in weight but forgets reps) would otherwise produce a set object like `{ weight: 100, reps: NaN }`. This would corrupt the stored data and break volume calculations and PR detection on the server (dividing by zero or producing `NaN` in the Epley formula).

The fix: the row is only pushed into the `sets` array if **both** `weight` and `reps` are truthy. An empty string is falsy in JavaScript, so blank fields are naturally excluded.

Without this guard: a user adds 4 set rows, fills in 3, leaves 1 blank → the saved exercise silently contains a malformed set → the total volume stat on the dashboard becomes `NaN` → the entire stats bar breaks.

Server-side, `checkAndUpdatePR()` in `server.js` (lines 103–108) also guards against this:

```javascript
const w = parseFloat(set.weight) || 0;
const r = parseInt(set.reps)    || 0;
if (w > 0 && r > 0) { ... }
```

Double validation: client filters junk before sending; server ignores it even if junk arrives.

---

## 4. AI Usage

**Tool used:** Claude (claude.ai)

**What I asked:** I asked Claude to help scaffold a full-stack gym tracker app meeting the fellowship assessment spec — persistent CRUD, one meaningful feature beyond basic CRUD, a polished frontend, and the full submission file set.

**What it gave me:** A complete implementation including the Express server with NeDB persistence, full REST API (`/api/workouts`, `/api/exercises`, `/api/prs`, `/api/stats`), and a single-file HTML frontend with an industrial/gym aesthetic.

**What I changed and why:**

The original AI-generated `submitExercise()` function sent all set rows to the server unconditionally, including blank ones. I added the `if (weight && reps)` guard inside the `.forEach` loop and added a check:

```javascript
if (!sets.length) { alert('Enter at least one complete set (weight + reps).'); return; }
```

The AI hadn't thought about the case where a user clicks Save with all set rows left blank. Without this, the API call would succeed but store an exercise with zero sets, which would appear in the UI as an empty exercise block with no rows — confusing and unclearable without going into the database manually. I also added the matching server-side guard in `checkAndUpdatePR()` for defence in depth.

I also restructured the PR toast notification. The AI's version showed a generic "saved!" toast. I changed it to make two sequential toasts: one immediate ("Exercise saved! Checking for PRs…") and a second delayed one that fires only if a PR was actually set, naming the exercise and the weight. This felt meaningfully better UX — it creates a moment of anticipation.

---

## 5. Honest Gap

**What isn't good enough:** The PR detection shows whether your **current** weight × reps beats your **all-time** best estimated 1RM — but there's no **progress history** for an exercise. You can't see a graph of your bench press over time, or know that you hit 100kg last month and 105kg this month. The PR card only shows the current best.

**What I'd do with another day:** Add a `history` collection in NeDB that records every `(exerciseName, date, estimated1RM)` entry. Then build a small line chart per exercise on the PR page using the native Canvas API (no library needed) showing 1RM trend over the last 90 days. That would turn the PR page from a static leaderboard into a genuine progress tracker — which is the actually useful thing for a gym app.
