# GymLog 💪

A persistent workout tracking web app. Log sessions, track exercises, and watch your Personal Records get auto-detected using the Epley 1RM formula.

---

## How to Run

**Requirements:** Node.js v16+ (https://nodejs.org)

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in your browser
# http://localhost:3000
```

That's it. One command after install.

Data is stored in the `db/` folder as flat `.db` files (NeDB). Close and restart — your data is still there.

---

## Features

- **Create / View / Update / Delete** workout sessions
- **Add exercises** with multiple sets (weight × reps)
- **Auto PR detection** — every time you log an exercise, GymLog checks if it's a new Personal Record using the Epley estimated 1-rep max formula (`weight × (1 + reps/30)`)
- **PR board** — see all your bests in one place
- **Dashboard stats** — total sessions, this week's count, total volume lifted
- **Muscle group tagging** — tag sessions by chest, back, legs, etc.
