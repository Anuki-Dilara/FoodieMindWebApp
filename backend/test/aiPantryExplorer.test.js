// Tests for the AI Pantry Explorer (local Ollama, mocked provider).
// Run: node test/aiPantryExplorer.test.js

require('dotenv').config();
process.env.AI_PANTRY_EXPLORER_ENABLED = 'true';
process.env.AI_MAX_GENERATION_ATTEMPTS = '2';

const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { canonicalName } = require('../utils/ingredientIdentity');
const { extractJsonArray, validateGeneratedRecipe, buildApprovedIngredients } = require('../services/pantryExplorerService');
const { generatePantryRecipes } = require('../services/pantryExplorerService');
const { setProviderForTests, resetProvider, AiTimeoutError } = require('../services/aiProvider');
const aiRoutes = require('../routes/ai');
const recipeRoutes = require('../routes/recipes');
const FoodItem = require('../models/FoodItem');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const CookedRecipe = require('../models/CookedRecipe');
const ConsumptionRecord = require('../models/ConsumptionRecord');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

const FUTURE = new Date(Date.now() + 10 * 86400000);
const EXPIRED = new Date(Date.now() - 86400000);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// ---------- fixtures ----------

const PANTRY = [
  { name: 'Test Rice', quantity: 1, unit: 'kg', baseQuantity: 1000, baseUnit: 'g' },
  { name: 'Test Eggs', quantity: 5, unit: 'pieces' },
  { name: 'Test Tomatoes', quantity: 4, unit: 'pieces' },
  { name: 'Test Onions', quantity: 3, unit: 'pieces' },
  { name: 'Test Carrots', quantity: 2, unit: 'pieces' },
  { name: 'Test Chillies', quantity: 5, unit: 'pieces' },
];

function aiRecipeJson(overrides = {}) {
  return JSON.stringify([{
    name: 'Pantry Power Bowl',
    description: 'A simple bowl built only from pantry stock.',
    mealType: 'Lunch',
    prepTime: 10,
    cookTime: 15,
    handsOnTime: 10,
    servings: 2,
    difficulty: 'Easy',
    method: 'stovetop',
    equipment: ['pan'],
    ingredients: [
      { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g', form: 'rinsed' },
      { id: canonicalName('Test Eggs'), name: 'Test Eggs', quantity: 2, unit: 'pieces' },
      { id: 'water', name: 'Water', quantity: 200, unit: 'ml' },
    ],
    instructions: [
      { text: 'Rinse the rice and set aside.', ingredientIds: [canonicalName('Test Rice')] },
      { text: 'Boil water and cook the rice until tender.', ingredientIds: ['water', canonicalName('Test Rice')] },
      { text: 'Fry the eggs and serve over the rice.', ingredientIds: [canonicalName('Test Eggs'), canonicalName('Test Rice')] },
    ],
    nutrition: { calories: 520, protein: 22, carbohydrates: 62, fat: 16, fibre: 3 },
    moodReason: 'Filling and fast for a hungry mood.',
    pantryReason: 'Uses only verified pantry stock plus water.',
    ...overrides,
  }]);
}

// Mutable mock provider.
const mockProvider = {
  name: 'mock',
  available: true,
  generateImpl: async () => ({ text: aiRecipeJson(), provider: 'mock', model: 'mock' }),
  calls: 0,
  async isAvailable() { return this.available; },
  async generate(prompt) { this.calls++; return this.generateImpl(prompt); },
};

let app, server, baseUrl, token, testUser;
const created = { foods: [], recipes: [], users: [] };

async function api(path, body, method = 'POST') {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

function approvedMap(extra = {}) {
  // Minimal approvedById map for pure validation tests.
  const map = new Map();
  const add = (name, stock, opts = {}) => map.set(canonicalName(name), {
    id: canonicalName(name), name, stock, staple: false, ...opts,
  });
  add('Test Rice', [{ quantity: 1, unit: 'kg' }]);
  add('Test Eggs', [{ quantity: 5, unit: 'pieces' }]);
  add('Test Onions', [{ quantity: 3, unit: 'pieces' }]);
  add('Onion', [{ quantity: 3, unit: 'pieces' }]);
  add('Sesame Oil', [{ quantity: 200, unit: 'ml' }]);
  map.set('water', { id: 'water', name: 'Water', stock: null, staple: true });
  for (const [k, v] of Object.entries(extra)) map.set(k, v);
  return map;
}

function baseRaw(overrides = {}) {
  return {
    name: 'Test Recipe',
    description: 'desc',
    mealType: 'Lunch',
    prepTime: 10, cookTime: 15, handsOnTime: 10,
    servings: 2, difficulty: 'Easy', method: 'stovetop',
    equipment: ['pan'],
    ingredients: [
      { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
      { id: canonicalName('Test Eggs'), name: 'Test Eggs', quantity: 2, unit: 'pieces' },
    ],
    instructions: [
      { text: 'Cook the rice.', ingredientIds: [canonicalName('Test Rice')] },
      { text: 'Fry the eggs.', ingredientIds: [canonicalName('Test Eggs')] },
    ],
    nutrition: { calories: 500, protein: 20, carbohydrates: 60, fat: 15, fibre: 3 },
    moodReason: 'x', pantryReason: 'y',
    ...overrides,
  };
}

async function main() {
  console.log('== AI Pantry Explorer tests (mocked Ollama) ==');

  // ---------- pure parsing ----------
  await test('extractJsonArray parses clean JSON array', () => {
    const out = extractJsonArray(aiRecipeJson());
    assert.ok(Array.isArray(out) && out.length === 1);
  });

  await test('extractJsonArray strips markdown fences and prose', () => {
    const out = extractJsonArray('Here you go:\n```json\n' + aiRecipeJson() + '\n```\nHope that helps!');
    assert.ok(Array.isArray(out) && out.length === 1);
  });

  await test('extractJsonArray returns null on malformed output', () => {
    assert.strictEqual(extractJsonArray('not json at all'), null);
    assert.strictEqual(extractJsonArray('{"a":1}'), null);
    assert.strictEqual(extractJsonArray(''), null);
  });

  // ---------- pure validation ----------
  await test('validation accepts a pantry-valid recipe', () => {
    const { errors, recipe } = validateGeneratedRecipe(baseRaw(), {
      approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {},
    });
    assert.deepStrictEqual(errors, []);
    assert.ok(recipe);
    assert.strictEqual(recipe.isAIGenerated, true);
    assert.strictEqual(recipe.nutrition.isEstimated, true);
  });

  await test('unavailable salt is rejected', () => {
    const raw = baseRaw({
      ingredients: [
        { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
        { id: 'salt', name: 'Salt', quantity: 1, unit: 'teaspoons' },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /unapproved ingredient: salt/.test(e)), errors.join(';'));
  });

  await test('unavailable cooking oil is rejected even when sesame oil exists', () => {
    const raw = baseRaw({
      ingredients: [
        { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
        { id: 'cooking oil', name: 'Cooking oil', quantity: 2, unit: 'tablespoons' },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /unapproved ingredient/.test(e)), errors.join(';'));
  });

  await test('quantity exceeding stock is rejected', () => {
    const raw = baseRaw({
      ingredients: [{ id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 5000, unit: 'g' }],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /insufficient stock/.test(e)), errors.join(';'));
  });

  await test('count->weight conversion validates stock (onions pieces vs grams)', () => {
    // Real 'Onion' has a produce profile: 3 pieces must cover a 150 g request.
    const raw = baseRaw({
      ingredients: [
        { id: canonicalName('Onion'), name: 'Onion', quantity: 150, unit: 'g' },
        { id: canonicalName('Test Eggs'), name: 'Test Eggs', quantity: 2, unit: 'pieces' },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(!errors.some((e) => /unapproved|insufficient/.test(e)), errors.join(';'));
  });

  await test('water is the only free staple — passes with no stock', () => {
    const raw = baseRaw({
      ingredients: [
        { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
        { id: canonicalName('Test Eggs'), name: 'Test Eggs', quantity: 2, unit: 'pieces' },
        { id: 'water', name: 'Water', quantity: 500, unit: 'ml' },
      ],
    });
    const { errors, recipe } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.deepStrictEqual(errors, []);
    assert.ok(recipe.ingredients.find((i) => i.id === 'water').staple);
  });

  await test('coconut water / milk are NOT free staples', () => {
    for (const id of ['coconut water', 'milk', 'coconut milk', 'vegetable stock']) {
      const raw = baseRaw({
        ingredients: [
          { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
          { id, name: id, quantity: 100, unit: 'ml' },
        ],
      });
      const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
      assert.ok(errors.some((e) => /unapproved ingredient/.test(e)), `${id} should be rejected`);
    }
  });

  await test('instruction mentioning unavailable salt is rejected', () => {
    const raw = baseRaw({
      instructions: [
        { text: 'Cook the rice.', ingredientIds: [canonicalName('Test Rice')] },
        { text: 'Add salt to taste and fry the eggs.', ingredientIds: [canonicalName('Test Eggs')] },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /unavailable ingredient "salt"/.test(e)), errors.join(';'));
  });

  await test('instruction mentioning unavailable cooking oil is rejected', () => {
    const raw = baseRaw({
      instructions: [
        { text: 'Cook the rice.', ingredientIds: [canonicalName('Test Rice')] },
        { text: 'Heat cooking oil and fry the eggs.', ingredientIds: [canonicalName('Test Eggs')] },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /unavailable ingredient/.test(e)), errors.join(';'));
  });

  await test('instruction referencing unapproved ingredientIds is rejected', () => {
    const raw = baseRaw({
      instructions: [
        { text: 'Cook the rice.', ingredientIds: [canonicalName('Test Rice')] },
        { text: 'Season well.', ingredientIds: ['garlic'] },
      ],
    });
    const { errors } = validateGeneratedRecipe(raw, { approvedById: approvedMap(), mood: 'Hungry', filters: {}, user: {} });
    assert.ok(errors.some((e) => /unapproved id/.test(e)), errors.join(';'));
  });

  await test('time filter violation is rejected', () => {
    const raw = baseRaw({ prepTime: 40, cookTime: 30 });
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: { timeAvailable: '30 minutes' }, user: {},
    });
    assert.ok(errors.some((e) => /exceeds/.test(e)), errors.join(';'));
  });

  await test('servings mismatch is rejected', () => {
    const raw = baseRaw({ servings: 4 });
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: { selectedServings: 2 }, user: {},
    });
    assert.ok(errors.some((e) => /servings/.test(e)), errors.join(';'));
  });

  await test('no-cook filter violation is rejected', () => {
    const raw = baseRaw({ method: 'stovetop' });
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Lazy',
      filters: { noCookOnly: true }, user: {},
    });
    assert.ok(errors.some((e) => /no-cook/.test(e)), errors.join(';'));
  });

  await test('equipment violation is rejected', () => {
    const raw = baseRaw({ equipment: ['oven'] });
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: { equipment: ['pan'] }, user: {},
    });
    assert.ok(errors.some((e) => /equipment/.test(e)), errors.join(';'));
  });

  await test('useIngredientFirst must be featured', () => {
    const raw = baseRaw();
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: { useIngredientFirst: 'Test Carrots' }, user: {},
    });
    assert.ok(errors.some((e) => /useIngredientFirst/.test(e)), errors.join(';'));
  });

  await test('allergy conflict is rejected', () => {
    const raw = baseRaw();
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: {}, user: { allergies: ['egg'] },
    });
    assert.ok(errors.some((e) => /allergy conflict/.test(e)), errors.join(';'));
  });

  await test('vegetarian dietary conflict is rejected', () => {
    const raw = baseRaw();
    const { errors } = validateGeneratedRecipe(raw, {
      approvedById: approvedMap(), mood: 'Hungry',
      filters: {}, user: { dietaryPreferences: ['vegetarian'] },
    });
    assert.ok(errors.some((e) => /dietary conflict/.test(e)), errors.join(';'));
  });

  // ---------- DB + service ----------
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 8000 });
  await FoodItem.init(); await Recipe.init(); await User.init();
  await CookedRecipe.init(); await ConsumptionRecord.init();

  // Idempotent setup: remove leftovers from any previous crashed run.
  const staleUser = await User.findOne({ email: 'ai-explorer-test@example.com' });
  if (staleUser) {
    await FoodItem.deleteMany({ userId: staleUser._id });
    await Recipe.deleteMany({ createdBy: staleUser._id });
    await CookedRecipe.deleteMany({ userId: staleUser._id });
    await ConsumptionRecord.deleteMany({ userId: staleUser._id });
    await User.deleteOne({ _id: staleUser._id });
  }
  const bcrypt = require('bcryptjs');
  testUser = await User.create({
    fullName: 'AI Explorer Test', email: 'ai-explorer-test@example.com',
    passwordHash: await bcrypt.hash('TestPass123!', 10), role: 'user',
  });
  created.users.push(testUser._id);
  token = jwt.sign({ userId: testUser._id }, JWT_SECRET, { expiresIn: '1h' });

  for (const p of PANTRY) {
    const item = await FoodItem.create({
      userId: testUser._id, name: p.name, category: 'Other',
      quantity: p.quantity, unit: p.unit,
      baseQuantity: p.baseQuantity ?? p.quantity, baseUnit: p.baseUnit ?? p.unit,
      purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
    });
    created.foods.push(item._id);
  }
  // Expired item must be excluded from the approved list.
  const expired = await FoodItem.create({
    userId: testUser._id, name: 'Test Expired Greens', category: 'Other',
    quantity: 5, unit: 'pieces', baseQuantity: 5, baseUnit: 'pieces',
    purchaseDate: new Date(), expiryDate: EXPIRED, status: 'Expired',
  });
  created.foods.push(expired._id);

  app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  app.use('/api/recipes', recipeRoutes);
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await test('buildApprovedIngredients excludes expired stock', async () => {
    const approved = await buildApprovedIngredients(testUser._id, FoodItem);
    assert.ok(!approved.some((a) => /expired greens/i.test(a.name)), 'expired item must not be approved');
    assert.ok(approved.some((a) => a.staple && a.id === 'water'), 'water staple must be present');
  });

  setProviderForTests(mockProvider);
  mockProvider.available = true;
  mockProvider.calls = 0;
  mockProvider.generateImpl = async () => ({ text: aiRecipeJson(), provider: 'mock', model: 'mock' });

  await test('AI generates a validated recipe when no pantry-complete recipe exists', async () => {
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.ok(out.recipes.length >= 1, 'expected at least one valid recipe');
    assert.strictEqual(out.recipes[0].isAIGenerated, true);
    assert.ok(out.recipes[0].ingredients.every((i) => i.staple || /test/i.test(i.name)));
  });

  await test('all eight moods can trigger generation', async () => {
    const moods = ['Happy', 'Tired', 'Sick', 'Stressed', 'Energetic', 'Lazy', 'Sad', 'Hungry'];
    for (const mood of moods) {
      const out = await generatePantryRecipes({
        userId: testUser._id, moods: [mood], filters: {}, FoodItem, User,
      });
      assert.ok(out.recipes.length >= 1, `mood ${mood} should produce a recipe`);
      assert.strictEqual(out.recipes[0].selectedMood, mood);
    }
  });

  await test('model output with unavailable salt yields no recipes', async () => {
    mockProvider.generateImpl = async () => ({
      text: JSON.stringify([{
        name: 'Salted Rice', description: 'x', mealType: 'Lunch',
        prepTime: 5, cookTime: 10, handsOnTime: 5, servings: 2, difficulty: 'Easy',
        method: 'stovetop', equipment: [],
        ingredients: [
          { id: canonicalName('Test Rice'), name: 'Test Rice', quantity: 200, unit: 'g' },
          { id: 'salt', name: 'Salt', quantity: 1, unit: 'teaspoons' },
        ],
        instructions: [
          { text: 'Cook rice.', ingredientIds: [canonicalName('Test Rice')] },
          { text: 'Add salt.', ingredientIds: ['salt'] },
        ],
        nutrition: { calories: 400, protein: 8, carbohydrates: 80, fat: 2, fibre: 1 },
        moodReason: 'x', pantryReason: 'y',
      }]),
    });
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.strictEqual(out.recipes.length, 0, 'salt recipe must never be returned');
    assert.ok(out.rejections.length > 0);
  });

  await test('invalid JSON from model yields no recipes and records rejection', async () => {
    mockProvider.generateImpl = async () => ({ text: 'I cannot help with that.', provider: 'mock', model: 'mock' });
    const out = await generatePantryRecipes({
      userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User,
    });
    assert.strictEqual(out.recipes.length, 0);
    assert.ok(out.rejections.some((r) => /invalid JSON/.test(r)));
  });

  await test('Ollama unavailable surfaces AI_UNAVAILABLE', async () => {
    mockProvider.available = false;
    await assert.rejects(
      () => generatePantryRecipes({ userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User }),
      (e) => e.code === 'AI_UNAVAILABLE'
    );
    mockProvider.available = true;
  });

  await test('Ollama timeout surfaces AI_TIMEOUT', async () => {
    mockProvider.generateImpl = async () => { throw new AiTimeoutError('timed out'); };
    await assert.rejects(
      () => generatePantryRecipes({ userId: testUser._id, moods: ['Hungry'], filters: {}, FoodItem, User }),
      (e) => e.code === 'AI_TIMEOUT'
    );
    mockProvider.generateImpl = async () => ({ text: aiRecipeJson(), provider: 'mock', model: 'mock' });
  });

  // ---------- HTTP route ----------
  await test('route: existing pantry-complete recipe prevents AI call', async () => {
    // Create a recipe the temp user can fully cook.
    const rec = await Recipe.create({
      name: 'AITest Existing Meal',
      ingredients: [
        { name: 'Test Rice', quantity: 100, unit: 'g' },
        { name: 'Test Eggs', quantity: 1, unit: 'pieces' },
      ],
      instructions: ['Cook'],
      cookingTime: 20, servings: 2, difficulty: 'Easy',
      mealType: 'Lunch', moodTags: ['Hungry'], tags: ['hungry'],
      nutrition: { calories: 400, protein: 15, carbohydrates: 50, fat: 10 },
    });
    created.recipes.push(rec._id);

    mockProvider.calls = 0;
    const { status, data } = await api('/ai/pantry-explorer', { moods: ['Hungry'], filters: {} });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.activated, false);
    assert.strictEqual(data.reason, 'existing-recipes');
    assert.strictEqual(mockProvider.calls, 0, 'AI must not be called when suitable recipes exist');
  });

  await test('route: AI activates when no pantry-complete recipe exists', async () => {
    // Remove the blocking recipe.
    await Recipe.deleteOne({ _id: created.recipes.pop() });
    const { status, data } = await api('/ai/pantry-explorer', { moods: ['Hungry'], filters: {} });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.activated, true);
    assert.ok(data.recipes.length >= 1);
    assert.strictEqual(data.recipes[0].isAIGenerated, true);
    assert.ok(data.recipes.every((r) => r.nutrition?.isEstimated));
  });

  await test('route: duplicate generation is prevented', async () => {
    // Slow provider so the second request overlaps the first.
    let release;
    const gate = new Promise((r) => { release = r; });
    mockProvider.generateImpl = async () => { await gate; return { text: aiRecipeJson(), provider: 'mock', model: 'mock' }; };

    const p1 = api('/ai/pantry-explorer', { moods: ['Sad'], filters: {} });
    await new Promise((r) => setTimeout(r, 150)); // let p1 register in-flight
    const p2 = await api('/ai/pantry-explorer', { moods: ['Sad'], filters: {} });
    release();
    const r1 = await p1;

    assert.strictEqual(p2.status, 409);
    assert.strictEqual(p2.data.code, 'GENERATION_IN_PROGRESS');
    assert.strictEqual(r1.status, 200);
    mockProvider.generateImpl = async () => ({ text: aiRecipeJson(), provider: 'mock', model: 'mock' });
  });

  await test('route: save persists generated recipe with ownership + AI flags', async () => {
    const gen = await api('/ai/pantry-explorer', { moods: ['Energetic'], filters: {} });
    assert.strictEqual(gen.status, 200);
    assert.ok(gen.data.recipes.length >= 1);
    const r = gen.data.recipes[0];

    const { status, data } = await api('/ai/pantry-explorer/save', { recipe: r });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.recipe.isAIGenerated, true);
    assert.strictEqual(data.recipe.source, 'ai-generated');
    assert.strictEqual(String(data.recipe.createdBy), String(testUser._id));
    created.recipes.push(data.recipe._id);
  });

  await test('route: cooking a saved generated recipe deducts pantry, not water', async () => {
    const saved = await Recipe.findOne({ userId: undefined, createdBy: testUser._id, isAIGenerated: true });
    assert.ok(saved, 'saved AI recipe must exist');

    const riceBefore = await FoodItem.findOne({ userId: testUser._id, name: 'Test Rice' });
    const riceQtyBefore = riceBefore.quantity;

    const { status, data } = await api(`/recipes/${saved._id}/cooked`, { servings: saved.servings });
    assert.strictEqual(status, 200, JSON.stringify(data));

    const riceAfter = await FoodItem.findOne({ userId: testUser._id, name: 'Test Rice' });
    assert.ok(riceAfter.quantity < riceQtyBefore, 'rice must be deducted');

    const waterItems = await FoodItem.find({ userId: testUser._id, name: /water/i });
    assert.strictEqual(waterItems.length, 0, 'no water inventory may be created');
  });

  await test('route: disabled flag returns 503', async () => {
    const prev = process.env.AI_PANTRY_EXPLORER_ENABLED;
    process.env.AI_PANTRY_EXPLORER_ENABLED = 'false';
    const { status, data } = await api('/ai/pantry-explorer', { moods: ['Hungry'], filters: {} });
    assert.strictEqual(status, 503);
    assert.strictEqual(data.code, 'AI_DISABLED');
    process.env.AI_PANTRY_EXPLORER_ENABLED = prev;
  });

  // ---------- cleanup ----------
  resetProvider();
  if (created.foods.length) await FoodItem.deleteMany({ _id: { $in: created.foods } });
  if (created.recipes.length) await Recipe.deleteMany({ _id: { $in: created.recipes } });
  await CookedRecipe.deleteMany({ userId: testUser._id });
  await ConsumptionRecord.deleteMany({ userId: testUser._id });
  if (created.users.length) await User.deleteMany({ _id: { $in: created.users } });
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    for (const f of failures) console.log(`  FAIL: ${f.name} — ${f.error.message}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
