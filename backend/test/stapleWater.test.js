// Tests for plain drinking water as an always-available household staple.
// Run: node test/stapleWater.test.js

require('dotenv').config();
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { canonicalName, isStapleWater } = require('../utils/ingredientIdentity');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');
const { matchIngredients } = require('../utils/moodScorers');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const CookedRecipe = require('../models/CookedRecipe');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const recipeRoutes = require('../routes/recipes');

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

const FUTURE = new Date(Date.now() + 5 * 86400000);
const created = { foods: [], recipes: [], cooked: [], consumed: [] };
let baseUrl;
let token;
let demoUser;

function mkRecipe(ingredients) {
  return {
    name: 'Water Test Recipe',
    ingredients,
    instructions: ['Cook'],
    cookingTime: 20,
    servings: 2,
    nutrition: { calories: 300, protein: 10, carbohydrates: 40, fat: 8 },
    difficulty: 'Easy',
  };
}

function mkItem(name, quantity, unit, extra = {}) {
  return { name, quantity, unit, expiryDate: FUTURE, ...extra };
}

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}/api/recipes${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function main() {
  console.log('== Plain water household staple tests ==');

  // --- Canonical identity (no DB needed) -----------------------------------
  await test('water aliases share canonical identity', () => {
    for (const n of ['water', 'Water', 'plain water', 'drinking water', 'tap water', '  Tap   Water ']) {
      assert.strictEqual(canonicalName(n), 'water', `${n} should canonicalize to water`);
      assert.ok(isStapleWater(n), `${n} should be staple water`);
    }
  });

  await test('other liquids are NOT staple water', () => {
    for (const n of ['coconut water', 'sparkling water', 'mineral water', 'flavoured water', 'flavored water', 'coconut milk', 'milk', 'vegetable stock', 'chicken stock', 'stock', 'rose water', 'watermelon']) {
      assert.ok(!isStapleWater(n), `${n} must NOT be staple water`);
    }
  });

  // --- Matcher (no DB needed) ----------------------------------------------
  const recipe = mkRecipe([
    { name: 'Rice', quantity: 200, unit: 'g' },
    { name: 'Eggs', quantity: 2, unit: 'pieces' },
    { name: 'Onion', quantity: 1, unit: 'pieces' },
    { name: 'Water', quantity: 250, unit: 'ml' },
  ]);
  const stocked = [
    mkItem('Rice', 1, 'kg'),
    mkItem('Eggs', 10, 'pieces'),
    mkItem('Onion', 3, 'pieces'),
  ];

  await test('water is available with zero pantry stock — recipe is pantry-complete', () => {
    const m = matchIngredientRequirements(recipe, stocked);
    assert.strictEqual(m.canCook, true);
    assert.deepStrictEqual(m.missing, []);
    assert.strictEqual(m.missingNames.length, 0);
  });

  await test('water result is AVAILABLE/STAPLE and keeps required quantity visible', () => {
    const m = matchIngredientRequirements(recipe, stocked);
    const w = m.results.find((r) => canonicalName(r.name) === 'water');
    assert.ok(w, 'water must appear in results');
    assert.strictEqual(w.status, 'AVAILABLE');
    assert.strictEqual(w.availabilityState, 'STAPLE_AVAILABLE');
    assert.strictEqual(w.matchType, 'staple');
    assert.strictEqual(w.required, 250);
    assert.strictEqual(w.unit, 'ml');
  });

  await test('water never counts as missing even with empty pantry', () => {
    const m = matchIngredientRequirements(recipe, []);
    assert.ok(!m.missingNames.includes('Water'));
    assert.ok(!m.missing.some((n) => /water/i.test(n)));
    const w = m.results.find((r) => canonicalName(r.name) === 'water');
    assert.strictEqual(w.status, 'AVAILABLE');
    // Other ingredients still correctly missing.
    assert.ok(m.missingNames.includes('Rice'));
  });

  await test('water does not inflate or deflate availability scoring', () => {
    const withWater = matchIngredientRequirements(recipe, stocked);
    const noWaterRecipe = mkRecipe(recipe.ingredients.filter((i) => canonicalName(i.name) !== 'water'));
    const withoutWater = matchIngredientRequirements(noWaterRecipe, stocked);
    assert.strictEqual(withWater.availability, withoutWater.availability);
    assert.strictEqual(withWater.canCook, withoutWater.canCook);
  });

  await test('coconut water still requires normal inventory matching', () => {
    const r = mkRecipe([{ name: 'Coconut Water', quantity: 200, unit: 'ml' }]);
    const m = matchIngredientRequirements(r, []);
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.ok(m.missingNames.includes('Coconut Water'));
  });

  await test('milk and stock still require inventory matching', () => {
    const r = mkRecipe([
      { name: 'Milk', quantity: 200, unit: 'ml' },
      { name: 'Vegetable Stock', quantity: 500, unit: 'ml' },
    ]);
    const m = matchIngredientRequirements(r, []);
    assert.strictEqual(m.results.length, 2);
    assert.ok(m.results.every((r2) => r2.status === 'MISSING'));
  });

  await test('tap/drinking water variants are also auto-available', () => {
    const r = mkRecipe([{ name: 'Tap Water', quantity: 1, unit: 'l' }]);
    const m = matchIngredientRequirements(r, []);
    assert.strictEqual(m.results[0].status, 'AVAILABLE');
    assert.strictEqual(m.canCook, true);
  });

  await test('mood scorer path (matchIngredients) treats water as available', () => {
    const m = matchIngredients(recipe, stocked);
    assert.strictEqual(m.canCook, true);
    assert.deepStrictEqual(m.missing, []);
  });

  // --- HTTP: ingredient-check + cooked route -------------------------------
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  await Recipe.init(); await FoodItem.init(); await User.init();
  await CookedRecipe.init(); await ConsumptionRecord.init();

  demoUser = await User.findOne({ email: 'demo@moodmeal.com' });
  assert.ok(demoUser, 'demo user must exist');
  token = jwt.sign({ userId: demoUser._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });

  const app = express();
  app.use(express.json());
  app.use('/api/recipes', recipeRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await test('ingredient-check reports water as staple/hasEnough', async () => {
      const rec = await Recipe.create(mkRecipe([
        { name: 'Rice', quantity: 200, unit: 'g' },
        { name: 'Water', quantity: 250, unit: 'ml' },
      ]));
      created.recipes.push(rec._id);
      const { status, data } = await api('GET', `/${rec._id}/ingredient-check`);
      assert.strictEqual(status, 200);
      const w = (data.ingredients || data.ingredientCheck || []).find((i) => /water/i.test(i.name));
      assert.ok(w, 'water entry must be present');
      assert.strictEqual(w.hasEnough, true);
      assert.strictEqual(w.status, 'staple');
    });

    await test('cooked route: water not deducted, other ingredients deducted, no water stock created', async () => {
      // Fresh pantry items for this test.
      const rice = await FoodItem.create({
        userId: demoUser._id, name: 'StapleCheck Rice', category: 'Grains and Cereals',
        quantity: 1, baseQuantity: 1000, unit: 'kg', baseUnit: 'g',
        purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
      });
      const eggs = await FoodItem.create({
        userId: demoUser._id, name: 'StapleCheck Eggs', category: 'Protein',
        quantity: 10, baseQuantity: 10, unit: 'pieces', baseUnit: 'pieces',
        purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
      });
      created.foods.push(rice._id, eggs._id);

      const rec = await Recipe.create(mkRecipe([
        { name: 'StapleCheck Rice', quantity: 200, unit: 'g' },
        { name: 'StapleCheck Eggs', quantity: 2, unit: 'pieces' },
        { name: 'Water', quantity: 250, unit: 'ml' },
        { name: 'Tap Water', quantity: 100, unit: 'ml' },
      ]));
      created.recipes.push(rec._id);

      const before = await FoodItem.countDocuments({ userId: demoUser._id, name: /water/i });
      const { status, data } = await api('POST', `/${rec._id}/cooked`, { servings: 2 });
      assert.strictEqual(status, 200, JSON.stringify(data));
      assert.strictEqual(data.canCook, true);

      // Water must not appear in ingredientsUsed.
      assert.ok(!data.ingredientsUsed.some((i) => /water/i.test(i.name)), 'water must not be deducted');

      // Other ingredients deducted correctly.
      const riceAfter = await FoodItem.findById(rice._id).lean();
      const eggsAfter = await FoodItem.findById(eggs._id).lean();
      assert.ok(Math.abs(riceAfter.baseQuantity - 800) < 1, `rice baseQuantity should be ~800g, got ${riceAfter.baseQuantity}`);
      assert.strictEqual(eggsAfter.quantity, 8);

      // No water inventory item created.
      const after = await FoodItem.countDocuments({ userId: demoUser._id, name: /^(water|tap water)$/i });
      assert.strictEqual(after, before, 'no water stock may be created by cooking');

      // No consumption record for water.
      const consumed = await ConsumptionRecord.find({ foodName: /water/i }).lean();
      assert.strictEqual(consumed.length, 0);
    });

    await test('water quantity still scales with servings in recipe data (untouched)', async () => {
      const rec = await Recipe.findById(created.recipes[1]).lean();
      const w = rec.ingredients.find((i) => i.name === 'Water');
      assert.strictEqual(w.quantity, 250); // original recipe data preserved
      assert.strictEqual(w.unit, 'ml');
    });
  } finally {
    server.close();
    await Recipe.deleteMany({ _id: { $in: created.recipes } });
    await FoodItem.deleteMany({ _id: { $in: created.foods } });
    await CookedRecipe.deleteMany({ recipeId: { $in: created.recipes } });
    await ConsumptionRecord.deleteMany({ foodName: /StapleCheck/ });
    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
