const mongoose = require('mongoose');

// Lightweight per-user history of AI-generated recipe fingerprints. Used by
// the Pantry Explorer to avoid re-serving near-identical recipes. Bounded to
// the latest HISTORY_WINDOW entries per user (pruned on write).
const aiRecipeGenerationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fingerprint: { type: String, required: true, index: true },
  ingredientIds: [{ type: String }],
  method: { type: String, default: '' },
  mealType: { type: String, default: '' },
  mood: { type: String, default: '' },
  saved: { type: Boolean, default: false },
  feedback: { type: String, enum: ['helpful', 'not-helpful', null], default: null },
  createdAt: { type: Date, default: Date.now },
});

aiRecipeGenerationSchema.index({ userId: 1, createdAt: -1 });

const AIRecipeGeneration = mongoose.model('AIRecipeGeneration', aiRecipeGenerationSchema);

const HISTORY_WINDOW = 20;

async function recordGenerations(userId, recipes) {
  if (!recipes.length) return;
  const docs = recipes.map((r) => ({
    userId,
    fingerprint: r.fingerprint,
    ingredientIds: r.ingredientIds || [],
    method: String(r.method || '').toLowerCase(),
    mealType: String(r.mealType || '').toLowerCase(),
    mood: r.selectedMood || r.mood || '',
    saved: false,
    feedback: null,
    createdAt: new Date(),
  }));
  await AIRecipeGeneration.insertMany(docs);
  // Bound the window: keep only the newest HISTORY_WINDOW per user.
  const stale = await AIRecipeGeneration.find({ userId })
    .sort({ createdAt: -1 })
    .skip(HISTORY_WINDOW)
    .select('_id')
    .lean();
  if (stale.length) {
    await AIRecipeGeneration.deleteMany({ _id: { $in: stale.map((d) => d._id) } });
  }
}

async function recentHistory(userId, limit = HISTORY_WINDOW) {
  return AIRecipeGeneration.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = { AIRecipeGeneration, recordGenerations, recentHistory, HISTORY_WINDOW };
