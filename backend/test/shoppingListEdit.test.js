// End-to-end tests for editable shopping-list quantity/unit.
// Run: node test/shoppingListEdit.test.js
// Spins up a minimal Express app with the real shopping-list router + auth
// middleware and exercises the API over HTTP on an ephemeral port.

require('dotenv').config();
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const ShoppingListItem = require('../models/ShoppingListItem');
const FoodItem = require('../models/FoodItem');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const shoppingListRoutes = require('../routes/shoppingList');

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

const created = { items: [], foods: [], recipes: [] };
let baseUrl;
let token;
let otherToken;
let demoUser;
let otherUser;

async function api(method, path, body, tok = token) {
  const res = await fetch(`${baseUrl}/api/shopping-list${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function createItem(body) {
  const { status, data } = await api('POST', '/', body);
  assert.strictEqual(status, 201, `POST failed: ${JSON.stringify(data)}`);
  created.items.push(data.item._id);
  return data.item;
}

async function main() {
  console.log('== Shopping list quantity/unit editing tests ==');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  await ShoppingListItem.init();
  await FoodItem.init();
  await Recipe.init();
  await User.init();

  demoUser = await User.findOne({ email: 'demo@moodmeal.com' });
  assert.ok(demoUser, 'demo user must exist (run npm run seed first)');
  otherUser = await User.findOne({ email: { $ne: 'demo@moodmeal.com' } });
  if (!otherUser) {
    otherUser = await User.create({
      fullName: 'SL Test User', email: 'sltest@example.com',
      passwordHash: 'x', role: 'user',
    });
  }
  const sign = (u) => jwt.sign({ userId: u._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
  token = sign(demoUser);
  otherToken = sign(otherUser);

  const app = express();
  app.use(express.json());
  app.use('/api/shopping-list', shoppingListRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // --- Validation -------------------------------------------------------
    await test('POST creates item and returns normalized unit', async () => {
      const item = await createItem({ name: 'Tomatoes', quantity: 500, unit: 'g', source: 'manual' });
      assert.strictEqual(item.quantity, 500);
      assert.strictEqual(item.unit, 'g');
    });

    await test('PUT edits quantity (500 g -> 1 kg) and persists', async () => {
      const item = await createItem({ name: 'Tomatoes', quantity: 500, unit: 'g' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 1, unit: 'kg' });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.item.quantity, 1);
      assert.strictEqual(data.item.unit, 'kg');
      // Simulate page refresh — value must come back from the DB.
      const fresh = await ShoppingListItem.findById(item._id).lean();
      assert.strictEqual(fresh.quantity, 1);
      assert.strictEqual(fresh.unit, 'kg');
    });

    await test('PUT accepts fractional quantities', async () => {
      const item = await createItem({ name: 'Milk', quantity: 1, unit: 'l' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 2.5, unit: 'l' });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.item.quantity, 2.5);
    });

    await test('PUT rejects zero quantity', async () => {
      const item = await createItem({ name: 'Onions', quantity: 3, unit: 'pieces' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 0, unit: 'pieces' });
      assert.strictEqual(status, 400);
      assert.ok(/positive/i.test(data.message));
      const fresh = await ShoppingListItem.findById(item._id).lean();
      assert.strictEqual(fresh.quantity, 3); // unchanged
    });

    await test('PUT rejects negative quantity', async () => {
      const item = await createItem({ name: 'Rice', quantity: 2, unit: 'kg' });
      const { status } = await api('PUT', `/${item._id}`, { quantity: -2, unit: 'kg' });
      assert.strictEqual(status, 400);
    });

    await test('PUT rejects invalid unit string', async () => {
      const item = await createItem({ name: 'Milk', quantity: 1, unit: 'l' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 1, unit: 'bogus-unit' });
      assert.strictEqual(status, 400);
      assert.ok(/invalid unit/i.test(data.message));
    });

    await test('PUT rejects incompatible unit for profiled ingredient (tomato + loaf)', async () => {
      const item = await createItem({ name: 'Tomatoes', quantity: 500, unit: 'g' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 1, unit: 'loaf' });
      assert.strictEqual(status, 400);
      assert.ok(/not supported/i.test(data.message));
    });

    await test('POST rejects invalid quantity/unit pair', async () => {
      const { status } = await api('POST', '/', { name: 'Tomatoes', quantity: -5, unit: 'g' });
      assert.strictEqual(status, 400);
    });

    // --- Ingredient-specific unit compatibility --------------------------
    await test('bread: loaf -> 12 slices is allowed', async () => {
      const item = await createItem({ name: 'Bread', quantity: 1, unit: 'loaf' });
      const { status, data } = await api('PUT', `/${item._id}`, { quantity: 12, unit: 'slice' });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.item.unit, 'slice');
    });

    await test('bread: ml is rejected (incompatible dimension)', async () => {
      const item = await createItem({ name: 'Bread', quantity: 1, unit: 'loaf' });
      const { status } = await api('PUT', `/${item._id}`, { quantity: 200, unit: 'ml' });
      assert.strictEqual(status, 400);
    });

    await test('cheese: cheddar 200 g -> 300 g keeps identity; cube unit allowed', async () => {
      const item = await createItem({ name: 'Cheddar Cheese', quantity: 200, unit: 'g', source: 'meal-plan' });
      const r1 = await api('PUT', `/${item._id}`, { quantity: 300, unit: 'g' });
      assert.strictEqual(r1.status, 200);
      assert.strictEqual(r1.data.item.name, 'Cheddar Cheese');
      const r2 = await api('PUT', `/${item._id}`, { quantity: 4, unit: 'cube' });
      assert.strictEqual(r2.status, 200);
      const r3 = await api('PUT', `/${item._id}`, { quantity: 1, unit: 'loaf' });
      assert.strictEqual(r3.status, 400); // cheese has no loaf unit
    });

    await test('vegetable: onion pieces and kg-style weight units behave per profile', async () => {
      const item = await createItem({ name: 'Onion', quantity: 3, unit: 'pieces' });
      const ok = await api('PUT', `/${item._id}`, { quantity: 0.5, unit: 'kg' });
      assert.strictEqual(ok.status, 200); // onion profile allows weight
      const bad = await api('PUT', `/${item._id}`, { quantity: 2, unit: 'loaf' });
      assert.strictEqual(bad.status, 400); // onion has no loaf unit
    });

    await test('unprofiled ingredient (cereal brand) accepts generic units', async () => {
      const item = await createItem({ name: 'Quinoa Flakes', quantity: 1, unit: 'packets' });
      const { status } = await api('PUT', `/${item._id}`, { quantity: 500, unit: 'g' });
      assert.strictEqual(status, 200);
    });

    // --- Ownership ---------------------------------------------------------
    await test('user cannot edit another user\'s item (404)', async () => {
      const item = await createItem({ name: 'Tomatoes', quantity: 1, unit: 'kg' });
      const { status } = await api('PUT', `/${item._id}`, { quantity: 2, unit: 'kg' }, otherToken);
      assert.strictEqual(status, 404);
      const fresh = await ShoppingListItem.findById(item._id).lean();
      assert.strictEqual(fresh.quantity, 1);
    });

    await test('unauthenticated request is rejected', async () => {
      const res = await fetch(`${baseUrl}/api/shopping-list`, { method: 'GET' });
      assert.strictEqual(res.status, 401);
    });

    // --- Source preservation / immutability --------------------------------
    await test('editing does not modify source recipe or pantry quantities', async () => {
      const recipe = await Recipe.create({
        name: 'SL Edit Test Recipe',
        ingredients: [{ name: 'Tomatoes', quantity: 500, unit: 'g' }],
        instructions: ['Test'], cookingTime: 10, servings: 1,
        nutrition: { calories: 100, protein: 1, carbohydrates: 10, fat: 2 },
        difficulty: 'Easy',
      });
      created.recipes.push(recipe._id);
      const food = await FoodItem.create({
        userId: demoUser._id, name: 'Pantry Sentinel', category: 'Other',
        quantity: 7, baseQuantity: 7000, unit: 'kg', baseUnit: 'g',
        purchaseDate: new Date(), expiryDate: new Date(Date.now() + 86400000),
        status: 'Fresh',
      });
      created.foods.push(food._id);

      const item = await createItem({ name: 'Tomatoes', quantity: 500, unit: 'g', source: 'meal-plan' });
      await api('PUT', `/${item._id}`, { quantity: 1, unit: 'kg' });

      const freshRecipe = await Recipe.findById(recipe._id).lean();
      assert.strictEqual(freshRecipe.ingredients[0].quantity, 500);
      assert.strictEqual(freshRecipe.ingredients[0].unit, 'g');
      const freshFood = await FoodItem.findById(food._id).lean();
      assert.strictEqual(freshFood.quantity, 7);
      assert.strictEqual(freshFood.unit, 'kg');
    });

    await test('mark-bought uses the edited quantity/unit', async () => {
      const item = await createItem({ name: 'Coconut Milk', quantity: 400, unit: 'ml' });
      await api('PUT', `/${item._id}`, { quantity: 2, unit: 'l' });
      const { status, data } = await api('POST', `/${item._id}/mark-bought`, {
        purchaseDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      });
      assert.strictEqual(status, 200);
      created.foods.push(data.foodItem._id);
      assert.strictEqual(data.foodItem.quantity, 2);
      assert.strictEqual(data.foodItem.unit, 'l');
      const fresh = await ShoppingListItem.findById(item._id).lean();
      assert.strictEqual(fresh.status, 'Bought');
    });
  } finally {
    server.close();
    await ShoppingListItem.deleteMany({ _id: { $in: created.items } });
    await FoodItem.deleteMany({ _id: { $in: created.foods } });
    await Recipe.deleteMany({ _id: { $in: created.recipes } });
    if (otherUser.email === 'sltest@example.com') await User.deleteOne({ _id: otherUser._id });
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
