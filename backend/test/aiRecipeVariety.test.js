// Tests for AI Recipe Variety Intelligence — fingerprints, similarity,
// generation history, diversity selection and feedback influence.
// Run: node test/aiRecipeVariety.test.js

require('dotenv').config();
process.env.AI_PANTRY_EXPLORER_ENABLED = 'true';
process.env.AI_MAX_GENERATION_ATTEMPTS = '2';

const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { canonicalName } = require('../utils/ingredientIdentity');
const {
  fingerprint, similarityOf, isNearDuplicate, recipeComponents,
  maxSimilarityTo, diversityScore, varietyTags,
} = require('../utils/recipeSimilarity');
const { generatePantryRecipes } = require('../services/pantryExplorerService');
const { setProviderForTests, resetProvider } = require('../services/aiProvider');
const { AIRecipeGeneration, recordGenerations, recentHistory, HISTORY_WINDOW } = require('../models/AIRecipeGeneration');
const aiRoutes = require('../routes/ai');
const moodRoutes = require('../routes/mood');
const recipeRoutes = require('../routes/recipes');
const FoodItem = require('../models/FoodItem');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const CookedRecipe = require('../models/CookedRecipe');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const MoodFeedback = require('../models/MoodFeedback');
const RecommendationEvent = require('../models/RecommendationEvent');

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name} — ${e.message}`); }
}

const FUTURE = new Date(Date.now() + 10 * 86400000);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ---------- recipe-shaped fixtures ----------
function mkRecipe({ name, ings, method = 'stovetop', mealType = 'Lunch', servings = 2 }) {
  return {
    name,
    ingredients: ings.map(([n, q, u]) => ({ name: n, quantity: q, unit: u })),
    method, mealType, servings,
  };
}

// Recipe A: rice + eggs, stovetop, Lunch
const RECIPE_A = mkRecipe({
  name: 'Rice Egg Bowl',
  ings: [['Test Rice', 200, 'g'], ['Test Eggs', 2, 'pieces']],
});
// Near-identical to A — different title only.
const RECIPE_A2 = mkRecipe({
  name: 'Spicy Rice Egg Fry',
  ings: [['Test Rice', 200, 'g'], ['Test Eggs', 2, 'pieces']],
});
// Recipe B: tomato + onion + carrot, no-cook, Snack — very different.
const RECIPE_B = mkRecipe({
  name: 'Fresh Garden Salad',
  ings: [['Test Tomatoes', 2, 'pieces'], ['Test Onions', 1, 'pieces'], ['Test Carrots', 1, 'pieces']],
  method: 'no-cook', mealType: 'Snack',
});
// Recipe C: rice + tomato, baking, Dinner — moderately different from A.
const RECIPE_C = mkRecipe({
  name: 'Baked Tomato Rice',
  ings: [['Test Rice', 200, 'g'], ['Test Tomatoes', 2, 'pieces']],
  method: 'baking', mealType: 'Dinner',
});

// ---------- AI JSON output builder ----------
function aiJson(rec, overrides = {}) {
  return JSON.stringify([{
    name: rec.name, description: 'd', mealType: rec.mealType,
    prepTime: 10, cookTime: 15, handsOnTime: 10, servings: rec.servings || 2,
    difficulty: 'Easy', method: rec.method, equipment: [],
    ingredients: rec.ingredients.map((i) => ({
      id: canonicalName(i.name), name: i.name, quantity: i.quantity, unit: i.unit,
    })),
    instructions: [
      { text: 'Prepare the main ingredients.', ingredientIds: rec.ingredients.slice(0, 1).map((i) => canonicalName(i.name)) },
      { text: 'Cook and combine everything.', ingredientIds: rec.ingredients.map((i) => canonicalName(i.name)) },
    ],
    nutrition: { calories: 400, protein: 15, carbohydrates: 55, fat: 10, fibre: 3 },
    moodReason: 'm', pantryReason: 'p',
    ...overrides,
  }]);
}

const mockProvider = {
  name: 'mock', available: true, calls: 0,
  queue: [],
  async isAvailable() { return this.available; },
  async generate() {
    this.calls++;
    const next = this.queue.length ? this.queue.shift() : aiJson(RECIPE_A);
    if (next instanceof Error) throw next;
    return { text: next, provider: 'mock', model: 'mock' };
  },
};

let app, server, baseUrl, token, testUser, testUser2;
const created = { foods: [], recipes: [] };

async function api(path, body, method = 'POST', tok = token) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

async function seedUser(email) {
  const u = await User.create({
    fullName: 'Variety Test', email,
    passwordHash: await bcrypt.hash('TestPass123!', 10), role: 'user',
  });
  const pantry = [
    ['Test Rice', 1, 'kg'], ['Test Eggs', 5, 'pieces'], ['Test Tomatoes', 4, 'pieces'],
    ['Test Onions', 3, 'pieces'], ['Test Carrots', 2, 'pieces'], ['Test Chillies', 5, 'pieces'],
  ];
  for (const [name, quantity, unit] of pantry) {
    const item = await FoodItem.create({
      userId: u._id, name, category: 'Other', quantity, unit,
      baseQuantity: quantity, baseUnit: unit,
      purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
    });
    created.foods.push(item._id);
  }
  return u;
}

async function main() {
  console.log('== AI Recipe Variety tests ==');

  // ---------- fingerprint / similarity (pure) ----------
  await test('fingerprint ignores recipe name — title change alone is not diversity', () => {
    assert.strictEqual(fingerprint(RECIPE_A), fingerprint(RECIPE_A2));
  });

  await test('fingerprint changes with ingredient set, method or meal type', () => {
    const base = fingerprint(RECIPE_A);
    assert.notStrictEqual(base, fingerprint(RECIPE_B));
    assert.notStrictEqual(base, fingerprint({ ...RECIPE_A, method: 'baking' }));
    assert.notStrictEqual(base, fingerprint({ ...RECIPE_A, mealType: 'Dinner' }));
  });

  await test('water is excluded from the fingerprint', () => {
    const withWater = mkRecipe({
      name: 'Watery', ings: [['Test Rice', 200, 'g'], ['Test Eggs', 2, 'pieces'], ['Water', 250, 'ml']],
    });
    assert.strictEqual(fingerprint(withWater), fingerprint(RECIPE_A));
  });

  await test('similar recipes are detected as near-duplicates', () => {
    assert.ok(isNearDuplicate(RECIPE_A, RECIPE_A2), 'title-only change must be a near-dup');
    assert.ok(similarityOf(RECIPE_A, RECIPE_A2) >= 0.85);
  });

  await test('different cooking method / meal style reduce similarity', () => {
    const sameIngsDiffMethod = mkRecipe({
      name: 'Baked Egg Rice', ings: RECIPE_A.ingredients.map((i) => [i.name, i.quantity, i.unit]),
      method: 'baking', mealType: 'Lunch',
    });
    const sim = similarityOf(RECIPE_A, sameIngsDiffMethod);
    assert.ok(sim < 0.85, `expected <0.85, got ${sim}`);
    assert.ok(!isNearDuplicate(RECIPE_A, sameIngsDiffMethod));
    assert.ok(!isNearDuplicate(RECIPE_A, RECIPE_B));
    assert.ok(!isNearDuplicate(RECIPE_A, RECIPE_C));
  });

  await test('diversityScore is deterministic and higher for different recipes', () => {
    const s1 = diversityScore(RECIPE_C, { selected: [RECIPE_A], history: [RECIPE_A] });
    const s2 = diversityScore(RECIPE_A2, { selected: [RECIPE_A], history: [RECIPE_A] });
    assert.ok(s1 > s2, 'different recipe must outscore a clone');
    assert.strictEqual(s1, diversityScore(RECIPE_C, { selected: [RECIPE_A], history: [RECIPE_A] }));
  });

  await test('varietyTags describe real differences', () => {
    const tagsB = varietyTags(RECIPE_B, [recipeComponents(RECIPE_A)]);
    assert.ok(tagsB.includes('Different ingredient combo'));
    assert.ok(tagsB.includes('Different cooking method'));
    const tagsA2 = varietyTags(RECIPE_A2, [recipeComponents(RECIPE_A)]);
    assert.ok(!tagsA2.includes('Different ingredient combo'));
  });

  await test('maxSimilarityTo applies not-helpful penalty', () => {
    // Use a moderately-similar history entry so the +0.15 penalty is visible
    // (an identical entry would already saturate at 1.0).
    const hist = [{ ...recipeComponents(RECIPE_C), feedback: null }];
    const histBad = [{ ...recipeComponents(RECIPE_C), feedback: 'not-helpful' }];
    const simNormal = maxSimilarityTo(RECIPE_A, hist);
    const simBad = maxSimilarityTo(RECIPE_A, histBad);
    assert.ok(simBad > simNormal, `${simBad} should exceed ${simNormal}`);
  });

  // ---------- DB ----------
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 8000 });
  await FoodItem.init(); await Recipe.init(); await User.init();
  await CookedRecipe.init(); await ConsumptionRecord.init();
  await AIRecipeGeneration.init(); await MoodFeedback.init(); await RecommendationEvent.init();

  // Idempotent cleanup of leftovers.
  for (const email of ['variety-test@example.com', 'variety-test2@example.com']) {
    const stale = await User.findOne({ email });
    if (stale) {
      await FoodItem.deleteMany({ userId: stale._id });
      await Recipe.deleteMany({ createdBy: stale._id });
      await AIRecipeGeneration.deleteMany({ userId: stale._id });
      await MoodFeedback.deleteMany({ userId: stale._id });
      await CookedRecipe.deleteMany({ userId: stale._id });
      await ConsumptionRecord.deleteMany({ userId: stale._id });
      await User.deleteOne({ _id: stale._id });
    }
  }

  testUser = await seedUser('variety-test@example.com');
  testUser2 = await seedUser('variety-test2@example.com');
  token = jwt.sign({ userId: testUser._id }, JWT_SECRET, { expiresIn: '1h' });
  const token2 = jwt.sign({ userId: testUser2._id }, JWT_SECRET, { expiresIn: '1h' });

  app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  app.use('/api/mood', moodRoutes);
  app.use('/api/recipes', recipeRoutes);
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  setProviderForTests(mockProvider);
  mockProvider.available = true;
  mockProvider.queue = [];

  await test('first generation returns diverse recipes and records history', async () => {
    mockProvider.queue = [JSON.stringify([RECIPE_A, RECIPE_B, RECIPE_C].map((r) => JSON.parse(aiJson(r))[0]))];
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.ok(out.recipes.length >= 2, `expected >=2 recipes, got ${out.recipes.length}`);
    const hist = await recentHistory(testUser._id);
    assert.strictEqual(hist.length, out.recipes.length, 'one history entry per returned recipe');
    assert.ok(out.recipes.every((r) => r.fingerprint && r.varietyTags));
    assert.ok(!out.recipes.every((r) => r.similarToPrevious), 'fresh recipes should not be flagged similar');
  });

  await test('repeat generation avoids recently generated recipes', async () => {
    // Same pantry, same model output — history should force different picks
    // or an exhausted explanation.
    mockProvider.queue = [JSON.stringify([RECIPE_A, RECIPE_B, RECIPE_C].map((r) => JSON.parse(aiJson(r))[0]))];
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    const firstFps = new Set((await recentHistory(testUser._id, 3)).map((h) => h.fingerprint));
    // Everything the model offered is already in history → exhausted path.
    assert.ok(out.recipes.every((r) => r.similarToPrevious) || out.recipes.length === 0,
      'repeat batch should be flagged similar or empty');
    assert.ok(out.exhausted === true || out.recipes.length === 0, 'should signal exhausted combinations');
  });

  await test('a genuinely new recipe is preferred over history repeats', async () => {
    // History now contains A,B,C. Offer A2 (clone of A), B (repeat) and D (new).
    const RECIPE_D = mkRecipe({
      name: 'Chilli Carrot Fry',
      ings: [['Test Carrots', 1, 'pieces'], ['Test Chillies', 2, 'pieces']],
      method: 'stovetop', mealType: 'Snack',
    });
    mockProvider.queue = [JSON.stringify([RECIPE_A2, RECIPE_B, RECIPE_D].map((r) => JSON.parse(aiJson(r))[0]))];
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.ok(out.recipes.length >= 1);
    const top = out.recipes[0];
    assert.strictEqual(top.name, 'Chilli Carrot Fry', `expected new recipe first, got ${top.name}`);
    assert.ok(!top.similarToPrevious, 'new recipe must not be flagged similar');
  });

  await test('history is user-specific — second user gets fresh results', async () => {
    mockProvider.queue = [JSON.stringify([RECIPE_A, RECIPE_B].map((r) => JSON.parse(aiJson(r))[0]))];
    const out = await generatePantryRecipes({
      userId: testUser2._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.ok(out.recipes.length >= 1);
    assert.ok(out.recipes.every((r) => !r.similarToPrevious), 'user2 has no history — nothing should be similar');
  });

  await test('history window is bounded to latest 20 per user', async () => {
    const fake = Array.from({ length: 25 }, (_, i) => ({
      name: `Fake ${i}`, ingredients: [{ name: 'Test Rice', quantity: 1, unit: 'kg' }],
      method: 'stovetop', mealType: 'Lunch', fingerprint: `fp${i}`, ingredientIds: ['test rice'],
    }));
    await recordGenerations(testUser._id, fake);
    const count = await AIRecipeGeneration.countDocuments({ userId: testUser._id });
    assert.ok(count <= HISTORY_WINDOW, `expected <=${HISTORY_WINDOW}, got ${count}`);
  });

  await test('not-helpful feedback increases avoidance of similar recipes', async () => {
    // Seed a not-helpful history entry matching RECIPE_A's fingerprint.
    const fpA = fingerprint(RECIPE_A);
    await AIRecipeGeneration.create({
      userId: testUser2._id, fingerprint: fpA, ingredientIds: recipeComponents(RECIPE_A).ingredientIds,
      method: 'stovetop', mealType: 'lunch', mood: 'Hungry', feedback: 'not-helpful',
    });
    // Offer A (penalized) and D (fresh) — D must win.
    const RECIPE_D = mkRecipe({
      name: 'Chilli Carrot Fry',
      ings: [['Test Carrots', 1, 'pieces'], ['Test Chillies', 2, 'pieces']],
      method: 'stovetop', mealType: 'Snack',
    });
    mockProvider.queue = [JSON.stringify([RECIPE_A, RECIPE_D].map((r) => JSON.parse(aiJson(r))[0]))];
    const out = await generatePantryRecipes({
      userId: testUser2._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.strictEqual(out.recipes[0].name, 'Chilli Carrot Fry');
  });

  await test('save stores fingerprint and marks history saved', async () => {
    mockProvider.queue = [JSON.stringify([RECIPE_B].map((r) => JSON.parse(aiJson(r))[0]))];
    const gen = await api('/ai/pantry-explorer', { moods: ['Happy'], filters: {} });
    assert.strictEqual(gen.status, 200);
    assert.ok(gen.data.recipes.length >= 1);
    const r = gen.data.recipes[0];
    assert.ok(r.fingerprint, 'generated recipe must carry a fingerprint');

    const { status, data } = await api('/ai/pantry-explorer/save', { recipe: r });
    assert.strictEqual(status, 201);
    assert.ok(data.recipe.aiGeneration?.fingerprint, 'saved recipe must store the fingerprint');
    const hist = await AIRecipeGeneration.findOne({ userId: testUser._id, fingerprint: r.fingerprint }).lean();
    assert.ok(hist, 'history entry must exist');
    assert.strictEqual(hist.saved, true, 'save must mark history entry saved');
    created.recipes.push(data.recipe._id);
  });

  await test('mood feedback mirrors onto AI generation history', async () => {
    const saved = await Recipe.findOne({ createdBy: testUser._id, isAIGenerated: true }).lean();
    assert.ok(saved, 'need a saved AI recipe');
    const fp = saved.aiGeneration?.fingerprint;
    assert.ok(fp, 'saved recipe must carry fingerprint');

    const { status } = await api('/mood/feedback', { recipeId: saved._id, mood: 'Happy', helpful: false });
    assert.strictEqual(status, 200);
    const hist = await AIRecipeGeneration.findOne({ userId: testUser._id, fingerprint: fp }).lean();
    assert.strictEqual(hist.feedback, 'not-helpful');
  });

  // ---------- cleanup ----------
  resetProvider();
  for (const u of [testUser, testUser2]) {
    if (!u) continue;
    await FoodItem.deleteMany({ userId: u._id });
    await Recipe.deleteMany({ createdBy: u._id });
    await AIRecipeGeneration.deleteMany({ userId: u._id });
    await MoodFeedback.deleteMany({ userId: u._id });
    await RecommendationEvent.deleteMany({ userId: u._id });
    await CookedRecipe.deleteMany({ userId: u._id });
    await ConsumptionRecord.deleteMany({ userId: u._id });
    await User.deleteOne({ _id: u._id });
  }
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { failures.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.error.message}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
