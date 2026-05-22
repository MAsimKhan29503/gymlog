const express = require('express');
const cors = require('cors');
const path = require('path');
const Datastore = require('nedb-promises');

const app = express();
const PORT = 3000;

// --- Persistent Datastores ---
const workoutsDB = Datastore.create({ filename: path.join(__dirname, 'db', 'workouts.db'), autoload: true });
const exercisesDB = Datastore.create({ filename: path.join(__dirname, 'db', 'exercises.db'), autoload: true });
const prsDB = Datastore.create({ filename: path.join(__dirname, 'db', 'prs.db'), autoload: true });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// =====================
//  WORKOUTS (sessions)
// =====================

// GET all workouts, sorted by date desc
app.get('/api/workouts', async (req, res) => {
  try {
    const workouts = await workoutsDB.find({}).sort({ date: -1 });
    res.json(workouts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET single workout with its exercises
app.get('/api/workouts/:id', async (req, res) => {
  try {
    const workout = await workoutsDB.findOne({ _id: req.params.id });
    if (!workout) return res.status(404).json({ error: 'Not found' });
    const exercises = await exercisesDB.find({ workoutId: req.params.id }).sort({ order: 1 });
    res.json({ ...workout, exercises });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create workout
app.post('/api/workouts', async (req, res) => {
  try {
    const { name, date, notes, muscleGroups } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'name and date required' });
    const doc = await workoutsDB.insert({
      name: name.trim(),
      date,
      notes: notes || '',
      muscleGroups: muscleGroups || [],
      createdAt: new Date().toISOString()
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update workout
app.put('/api/workouts/:id', async (req, res) => {
  try {
    const { name, date, notes, muscleGroups } = req.body;
    await workoutsDB.update({ _id: req.params.id }, { $set: { name, date, notes, muscleGroups } });
    const updated = await workoutsDB.findOne({ _id: req.params.id });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE workout + its exercises
app.delete('/api/workouts/:id', async (req, res) => {
  try {
    await workoutsDB.remove({ _id: req.params.id });
    await exercisesDB.remove({ workoutId: req.params.id }, { multi: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =====================
//  EXERCISES (within a workout)
// =====================

// GET exercises for a workout
app.get('/api/workouts/:id/exercises', async (req, res) => {
  try {
    const exercises = await exercisesDB.find({ workoutId: req.params.id }).sort({ order: 1 });
    res.json(exercises);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add exercise to workout
app.post('/api/workouts/:id/exercises', async (req, res) => {
  try {
    const { name, sets } = req.body;
    // sets = [{ reps, weight, unit }]
    if (!name || !sets || !sets.length) return res.status(400).json({ error: 'name and sets required' });

    const existing = await exercisesDB.find({ workoutId: req.params.id });
    const doc = await exercisesDB.insert({
      workoutId: req.params.id,
      name: name.trim(),
      sets,
      order: existing.length,
      createdAt: new Date().toISOString()
    });

    // --- Auto PR detection ---
    await checkAndUpdatePR(name.trim(), sets);

    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update exercise
app.put('/api/exercises/:id', async (req, res) => {
  try {
    const { name, sets } = req.body;
    await exercisesDB.update({ _id: req.params.id }, { $set: { name, sets } });
    if (sets) await checkAndUpdatePR(name, sets);
    const updated = await exercisesDB.findOne({ _id: req.params.id });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE exercise
app.delete('/api/exercises/:id', async (req, res) => {
  try {
    await exercisesDB.remove({ _id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// =====================
//  PERSONAL RECORDS (the "real user feature")
// =====================

app.get('/api/prs', async (req, res) => {
  try {
    const prs = await prsDB.find({}).sort({ updatedAt: -1 });
    res.json(prs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper: 1-rep max estimate (Epley formula)
function estimate1RM(weight, reps) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

async function checkAndUpdatePR(exerciseName, sets) {
  // Find the best set (highest estimated 1RM)
  let best1RM = 0;
  let bestSet = null;
  for (const set of sets) {
    const w = parseFloat(set.weight) || 0;
    const r = parseInt(set.reps) || 0;
    if (w > 0 && r > 0) {
      const e1rm = estimate1RM(w, r);
      if (e1rm > best1RM) {
        best1RM = e1rm;
        bestSet = set;
      }
    }
  }
  if (!bestSet || best1RM === 0) return;

  const key = exerciseName.toLowerCase().trim();
  const existing = await prsDB.findOne({ key });

  if (!existing || best1RM > existing.estimated1RM) {
    const record = {
      key,
      exerciseName,
      weight: bestSet.weight,
      reps: bestSet.reps,
      unit: bestSet.unit || 'kg',
      estimated1RM: best1RM,
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      await prsDB.update({ key }, { $set: record });
    } else {
      await prsDB.insert(record);
    }
    return true; // new PR!
  }
  return false;
}

// =====================
//  STATS endpoint
// =====================
app.get('/api/stats', async (req, res) => {
  try {
    const totalWorkouts = await workoutsDB.count({});
    const totalExercises = await exercisesDB.count({});
    const totalPRs = await prsDB.count({});

    // workouts in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentWorkouts = await workoutsDB.count({ date: { $gte: sevenDaysAgo } });

    // total volume (sum of weight*reps across all sets)
    const allExercises = await exercisesDB.find({});
    let totalVolume = 0;
    for (const ex of allExercises) {
      for (const set of (ex.sets || [])) {
        totalVolume += (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0);
      }
    }

    res.json({ totalWorkouts, totalExercises, totalPRs, recentWorkouts, totalVolume: Math.round(totalVolume) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n💪 GymLog running at http://localhost:${PORT}\n`);
});
