// Automated tests for bread loaf<->slice unit conversion.
// Run: node test/breadConversion.test.js
// DB-backed checks run only if MongoDB is reachable.

const assert = require('assert');

const { convertQuantity, deductQuantity, canConvert } = require('../utils/unitConversion');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');
const produce = require('../utils/produceConversionService');

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

function approx(actual, expected, tol = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);
}

const FUTURE = new Date(Date.now() + 5 * 86400000);
const PAST = new Date(Date.now() - 86400000);

function mkRecipe(name, qty, unit, ingredientName = 'Bread') {
  return {
    name: 'Test Recipe',
    ingredients: [{ name: ingredientName, quantity: qty, unit }],
  };
}

function mkItem(name, qty, unit, extra = {}) {
  return { name, quantity: qty, unit, expiryDate: FUTURE, ...extra };
}

async function main() {
  console.log('== Bread loaf<->slice conversion tests ==');

  await test('1 loaf (18 slices) matches recipe needing 2 slices — CONVERTED_MATCH', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Bread', 1, 'loaf', { slicesPerLoaf: 18 })]
    );
    const d = m.results[0];
    assert.strictEqual(d.status, 'AVAILABLE');
    assert.strictEqual(d.availabilityState, 'CONVERTED_MATCH');
    assert.strictEqual(d.matchType, 'converted');
    assert.strictEqual(m.canCook, true);
    assert.ok(d.conversionNote.includes('18 slices per loaf'), `note: ${d.conversionNote}`);
  });

  await test('1 loaf (18 slices) matches recipe needing 4 slices', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 4, 'slices'),
      [mkItem('Bread', 1, 'loaf', { slicesPerLoaf: 18 })]
    );
    assert.strictEqual(m.results[0].availabilityState, 'CONVERTED_MATCH');
    assert.strictEqual(m.canCook, true);
  });

  await test('slice-to-slice is EXACT_MATCH (not converted)', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Bread', 6, 'slice')]
    );
    const d = m.results[0];
    assert.strictEqual(d.status, 'AVAILABLE');
    assert.strictEqual(d.availabilityState, 'EXACT_MATCH');
    assert.strictEqual(d.matchType, 'exact');
  });

  await test('slice-to-loaf conversion (recipe needs 1/2 loaf)', () => {
    const r = convertQuantity(0.5, 'loaf', 'slice', 'White Bread', {});
    assert.strictEqual(r.success, true);
    approx(r.quantity, 9); // 18 slices/loaf * 0.5
    const back = convertQuantity(9, 'slice', 'loaf', 'White Bread', {});
    approx(back.quantity, 0.5);
  });

  await test('different slice counts per loaf are respected', () => {
    const r18 = convertQuantity(1, 'loaf', 'slice', 'Bread', { slicesPerLoaf: 18 });
    const r24 = convertQuantity(1, 'loaf', 'slice', 'Bread', { slicesPerLoaf: 24 });
    approx(r18.quantity, 18);
    approx(r24.quantity, 24);
    // And the reverse direction uses the same per-item count.
    const back = convertQuantity(12, 'slice', 'loaf', 'Bread', { slicesPerLoaf: 24 });
    approx(back.quantity, 0.5);
  });

  await test('fractional loaf quantities convert correctly', () => {
    const r = convertQuantity(0.25, 'loaf', 'slice', 'White Bread', {});
    approx(r.quantity, 4.5); // 18 * 0.25
    const g = convertQuantity(0.5, 'loaf', 'g', 'White Bread', {});
    approx(g.quantity, 225);
  });

  await test('missing slice-count: generic bread loaf without profile default or user count -> MISSING', () => {
    // 'bread' profile intentionally has slicesPerLoaf: null.
    const conv = convertQuantity(1, 'loaf', 'slice', 'Bread', {});
    assert.strictEqual(conv.success, false);
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Bread', 1, 'loaf')] // no slicesPerLoaf
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.strictEqual(m.canCook, false);
  });

  await test('unprofiled bread type (pita) never produces false availability', () => {
    const conv = convertQuantity(1, 'loaf', 'slice', 'Pita Bread', { slicesPerLoaf: 8 });
    assert.strictEqual(conv.success, false);
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Pita Bread'),
      [mkItem('Pita Bread', 1, 'loaf', { slicesPerLoaf: 8 })]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
  });

  await test('insufficient slices detected (1 loaf=18 slices, recipe needs 20)', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 20, 'slice'),
      [mkItem('Bread', 1, 'loaf', { slicesPerLoaf: 18 })]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.strictEqual(m.results[0].hasPartialExact, true);
  });

  await test('inventory deduction: 1 loaf(18) - 2 slices = 0.89 loaf ≈ 16 slices', () => {
    const opts = { slicesPerLoaf: 18 };
    // Availability: 1 loaf -> 18 slices
    const avail = convertQuantity(1, 'loaf', 'slice', 'Bread', opts);
    approx(avail.quantity, 18);
    // Deduction: 2 slices -> loaf
    const deduct = convertQuantity(2, 'slice', 'loaf', 'Bread', opts);
    approx(deduct.quantity, 2 / 18, 0.001);
    const remaining = deductQuantity(1, 'loaf', deduct.quantity, 'loaf', 'Bread', opts);
    approx(remaining.quantity, 16 / 18, 0.01);
    // The slice->loaf conversion that produced the deduction is an estimate.
    assert.strictEqual(deduct.isEstimate, true);
    // Slice-equivalent remaining
    approx(remaining.quantity * 18, 16, 0.2);
  });

  await test('partial deduction across fractional loaf keeps precision', () => {
    const opts = { slicesPerLoaf: 20 };
    // 3 slices of a 20-slice loaf
    const r = convertQuantity(3, 'slice', 'loaf', 'Bread', opts);
    approx(r.quantity, 0.15);
    const rem = deductQuantity(1, 'loaf', r.quantity, 'loaf', 'Bread', opts);
    approx(rem.quantity, 0.85);
  });

  await test('bread-type identity: white vs sourdough do NOT match', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Sourdough Bread'),
      [mkItem('White Bread', 1, 'loaf')]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
    // ...but identical types match via their own profiles
    const m2 = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Sourdough Bread'),
      [mkItem('Sourdough Bread', 1, 'loaf')]
    );
    assert.strictEqual(m2.results[0].availabilityState, 'CONVERTED_MATCH');
    approx(m2.results[0].availableQuantity, 16); // 16 slices/loaf sourdough
  });

  await test('aliases resolve to correct bread identities', () => {
    const { normalizeIngredientName } = require('../utils/unitConversion');
    assert.strictEqual(normalizeIngredientName('Sandwich Bread'), 'white bread');
    assert.strictEqual(normalizeIngredientName('Brown Bread'), 'whole wheat bread');
    assert.strictEqual(normalizeIngredientName('Sourdough'), 'sourdough bread');
    assert.strictEqual(normalizeIngredientName('Gluten Free Bread'), 'gluten-free bread');
    assert.strictEqual(normalizeIngredientName('Loaf of Bread'), 'bread');
    // Different types stay distinct
    assert.notStrictEqual(normalizeIngredientName('White Bread'), normalizeIngredientName('Sourdough Bread'));
  });

  await test('serving-scaled recipe quantities still convert (4 slices for 2 servings)', () => {
    // Simulates servings scaling: original 2 slices -> 4 slices at 2x
    const m = matchIngredientRequirements(
      mkRecipe('R', 4, 'slice'),
      [mkItem('Bread', 1, 'loaf', { slicesPerLoaf: 18 })]
    );
    assert.strictEqual(m.canCook, true);
  });

  await test('shopping-list semantics: missing bread keeps original recipe unit', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Pita Bread'),
      []
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.strictEqual(m.results[0].unit, 'slice'); // original unit preserved
    assert.strictEqual(m.results[0].required, 2);
  });

  await test('expired bread loaf is excluded', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Bread', 1, 'loaf', { slicesPerLoaf: 18, expiryDate: PAST })]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
  });

  await test('weight conversions: kg->g, g->slice, loaf->g', () => {
    const kg = convertQuantity(1, 'kg', 'g', 'White Bread', {});
    approx(kg.quantity, 1000);
    const g2s = convertQuantity(100, 'g', 'slice', 'White Bread', {});
    approx(g2s.quantity, 4); // 100g / 25g per slice
    const l2g = convertQuantity(1, 'loaf', 'g', 'White Bread', {});
    approx(l2g.quantity, 450);
  });

  await test('bread roll cannot convert to slices/loaves', () => {
    const r = convertQuantity(1, 'whole', 'slice', 'Bread Roll', {});
    assert.strictEqual(r.success, false);
    const g = convertQuantity(2, 'pieces', 'g', 'Bread Roll', {});
    approx(g.quantity, 100);
  });

  await test('generic count fallback never treats 1 loaf = 1 slice', () => {
    // Even with identical base units, bread requires the profile.
    const r = convertQuantity(1, 'loaf', 'slice', 'Bread', {});
    assert.strictEqual(r.success, false);
    assert.ok(!canConvert('loaf', 'slice', 'Bread', {}));
  });

  await test('supportedUnitsFor(bread) returns storage-valid units', () => {
    const s = produce.supportedUnitsFor('White Bread');
    assert.ok(s.units.includes('loaf'), 'missing loaf');
    assert.ok(s.units.includes('slice'), 'missing slice');
    assert.ok(s.units.includes('g') && s.units.includes('kg'));
    assert.strictEqual(s.preferredUnit, 'slice');
  });

  // ---------- DB-backed checks ----------
  let mongoose;
  try {
    mongoose = require('mongoose');
    require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  } catch (e) {
    console.log('  (MongoDB not reachable — skipping DB-backed checks)');
    mongoose = null;
  }

  if (mongoose) {
    const FoodItem = require('../models/FoodItem');
    const User = require('../models/User');
    await produce.initProduceProfiles();

    await test('demo pantry Bread has slicesPerLoaf and converts', async () => {
      const demo = await User.findOne({ email: 'demo@moodmeal.com' });
      const bread = await FoodItem.findOne({ userId: demo._id, name: 'Bread', isSeed: true });
      assert.ok(bread, 'demo Bread item missing');
      assert.strictEqual(bread.unit, 'loaf');
      assert.strictEqual(bread.slicesPerLoaf, 18);
      const m = matchIngredientRequirements(
        mkRecipe('R', 2, 'slice'),
        [bread.toObject()]
      );
      assert.strictEqual(m.results[0].availabilityState, 'CONVERTED_MATCH');
      assert.strictEqual(m.canCook, true);
    });

    await test('seed counts preserved: 50 recipes / 50 demo items', async () => {
      const Recipe = require('../models/Recipe');
      const demo = await User.findOne({ email: 'demo@moodmeal.com' });
      const [r, i] = await Promise.all([
        Recipe.countDocuments({ isSeed: true }),
        FoodItem.countDocuments({ userId: demo._id, isSeed: true }),
      ]);
      assert.strictEqual(r, 50);
      assert.strictEqual(i, 50);
    });

    await mongoose.disconnect();
  }

  console.log(`\n========== ${passed} passed, ${failed} failed ==========`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
