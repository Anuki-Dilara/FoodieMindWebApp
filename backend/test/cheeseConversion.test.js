// Automated tests for cheese weight<->slice/cube/volume conversion.
// Run: node test/cheeseConversion.test.js
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
const PACK = { weightGrams: 200, slices: 10 }; // 20 g per slice

function mkRecipe(name, qty, unit, ingredientName = 'Cheddar Cheese', extra = {}) {
  return { name: 'Test Recipe', ingredients: [{ name: ingredientName, quantity: qty, unit, ...extra }] };
}

function mkItem(name, qty, unit, extra = {}) {
  return { name, quantity: qty, unit, expiryDate: FUTURE, ...extra };
}

async function main() {
  console.log('== Cheese conversion tests ==');

  await test('grams -> slices with package profile (200g pack = 10 slices)', () => {
    const r = convertQuantity(200, 'g', 'slice', 'Cheddar Cheese', { slicePack: PACK });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 10);
    assert.strictEqual(r.conversion.slicePack.weightGrams, 200);
  });

  await test('kg -> slices', () => {
    const r = convertQuantity(1, 'kg', 'slice', 'Cheddar Cheese', { slicePack: PACK });
    approx(r.quantity, 50); // 1000g / 20g
  });

  await test('slices -> grams deduction amount (2 slices = 40g)', () => {
    const r = convertQuantity(2, 'slice', 'g', 'Cheddar Cheese', { slicePack: PACK });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 40);
    assert.strictEqual(r.isEstimate, true);
  });

  await test('package weight + slice count calculates per-slice weight', () => {
    const r = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { slicePack: { weightGrams: 250, slices: 12 } });
    approx(r.quantity, 250 / 12, 0.01);
  });

  await test('different cheese types use different slice weights', () => {
    const cheddar = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', {});
    const parmesan = convertQuantity(1, 'slice', 'g', 'Parmesan', {});
    const mozzarella = convertQuantity(1, 'slice', 'g', 'Mozzarella', {});
    approx(cheddar.quantity, 28);
    approx(parmesan.quantity, 10);
    approx(mozzarella.quantity, 30);
    assert.ok(new Set([cheddar.quantity, parmesan.quantity, mozzarella.quantity]).size === 3);
  });

  await test('thin / standard / thick slice sizes differ', () => {
    const thin = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { size: 's' });
    const std = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { size: 'm' });
    const thick = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { size: 'l' });
    approx(thin.quantity, 18);
    approx(std.quantity, 28);
    approx(thick.quantity, 40);
    // size words also accepted
    const thinWord = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { size: 'thin' });
    approx(thinWord.quantity, 18);
  });

  await test('package override beats profile default', () => {
    const withPack = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { slicePack: { weightGrams: 200, slices: 8 } });
    approx(withPack.quantity, 25); // overrides 28g default for standard size
    const thinWithPack = convertQuantity(1, 'slice', 'g', 'Cheddar Cheese', { size: 's', slicePack: { weightGrams: 200, slices: 8 } });
    approx(thinWithPack.quantity, 18); // thin estimate preserved
  });

  await test('missing slice profile: unprofiled cheese type fails honestly', () => {
    const r = convertQuantity(2, 'slice', 'g', 'Paneer', {});
    assert.strictEqual(r.success, false);
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Paneer'),
      [mkItem('Paneer', 200, 'g')]
    );
    // weight->slice cannot verify -> paneer has no profile and isn't
    // cheese-family, so legacy optimism may apply; assert no crash + status is defined
    assert.ok(m.results[0].status);
  });

  await test('insufficient quantity: 100g cheddar vs 2 slices(56g needed) is fine, 40g is not', () => {
    const ok = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Cheddar Cheese', 100, 'g')]
    );
    assert.strictEqual(ok.canCook, true); // 100g = 3.57 slices >= 2
    const short = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Cheddar Cheese', 40, 'g')]
    );
    assert.strictEqual(short.canCook, false); // 40g = 1.43 slices < 2
  });

  await test('fractional slice quantities', () => {
    const r = convertQuantity(1.5, 'slice', 'g', 'Cheddar Cheese', { slicePack: PACK });
    approx(r.quantity, 30);
  });

  await test('cooking deduction: 200g - 2 slices(40g) = 160g', () => {
    const opts = { slicePack: PACK };
    const avail = convertQuantity(200, 'g', 'slice', 'Cheddar Cheese', opts);
    approx(avail.quantity, 10);
    const deduct = convertQuantity(2, 'slice', 'g', 'Cheddar Cheese', opts);
    approx(deduct.quantity, 40);
    const remaining = deductQuantity(200, 'g', deduct.quantity, 'g', 'Cheddar Cheese', opts);
    approx(remaining.quantity, 160);
    // The slice->g conversion that produced the deduction is an estimate.
    assert.strictEqual(deduct.isEstimate, true);
  });

  await test('remaining stock calculation keeps original unit (grams)', () => {
    const opts = { slicePack: PACK };
    // Deduct 6 slices from 200g -> 80g remains
    const deduct = convertQuantity(6, 'slice', 'g', 'Cheddar Cheese', opts);
    approx(deduct.quantity, 120);
    const rem = deductQuantity(200, 'g', deduct.quantity, 'g', 'Cheddar Cheese', opts);
    approx(rem.quantity, 80);
    assert.strictEqual(rem.unit, 'g');
  });

  await test('cheddar vs mozzarella are different identities', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Mozzarella'),
      [mkItem('Cheddar Cheese', 200, 'g', { slicePack: PACK })]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
    const m2 = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice', 'Mozzarella'),
      [mkItem('Mozzarella', 200, 'g')]
    );
    assert.strictEqual(m2.results[0].availabilityState, 'CONVERTED_MATCH');
  });

  await test('sliced vs grated form handling (volume uses form-specific cup weights)', () => {
    const grated = convertQuantity(1, 'cup', 'g', 'Parmesan', { form: 'grated' });
    approx(grated.quantity, 100);
    // cheddar has no 'whole' cup fallback for unrelated forms? cheddar cups are
    // grated/shredded only — 'whole' form falls back to chopped->none->whole->none
    const cheddarGrated = convertQuantity(1, 'cup', 'g', 'Cheddar Cheese', { form: 'grated' });
    approx(cheddarGrated.quantity, 113);
  });

  await test('serving-scaled quantities still convert (4 slices)', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 4, 'slice'),
      [mkItem('Cheddar Cheese', 200, 'g', { slicePack: PACK })]
    );
    assert.strictEqual(m.canCook, true);
  });

  await test('shopping-list semantics: missing cheese keeps original unit', () => {
    const m = matchIngredientRequirements(mkRecipe('R', 2, 'slice', 'Gouda'), []);
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.strictEqual(m.results[0].unit, 'slice');
    assert.strictEqual(m.results[0].required, 2);
  });

  await test('cubes convert per cheese type', () => {
    const feta = convertQuantity(4, 'cube', 'g', 'Feta', {});
    approx(feta.quantity, 60);
    const halloumi = convertQuantity(4, 'cube', 'g', 'Halloumi', {});
    approx(halloumi.quantity, 80);
  });

  await test('aliases resolve cheese identities', () => {
    const { normalizeIngredientName } = require('../utils/unitConversion');
    assert.strictEqual(normalizeIngredientName('Cheddar'), 'cheddar cheese');
    assert.strictEqual(normalizeIngredientName('Parmesan Cheese'), 'parmesan');
    assert.strictEqual(normalizeIngredientName('American Cheese'), 'processed cheese');
    assert.strictEqual(normalizeIngredientName('Jack Cheese'), 'monterey jack');
    assert.strictEqual(normalizeIngredientName('Colby Jack'), 'colby');
    // paneer is NOT cottage cheese
    assert.notStrictEqual(normalizeIngredientName('Paneer'), normalizeIngredientName('Cottage Cheese'));
  });

  await test('expired cheese excluded', () => {
    const m = matchIngredientRequirements(
      mkRecipe('R', 2, 'slice'),
      [mkItem('Cheddar Cheese', 200, 'g', { slicePack: PACK, expiryDate: PAST })]
    );
    assert.strictEqual(m.results[0].status, 'MISSING');
  });

  await test('cottage/ricotta have no slice profile (weight+volume only)', () => {
    const r = convertQuantity(1, 'slice', 'g', 'Cottage Cheese', {});
    assert.strictEqual(r.success, false);
    const cup = convertQuantity(1, 'cup', 'g', 'Ricotta', {});
    approx(cup.quantity, 246);
  });

  await test('supportedUnitsFor reports cheese units', () => {
    const s = produce.supportedUnitsFor('Cheddar Cheese');
    assert.ok(s.units.includes('slice'));
    assert.ok(s.units.includes('cube'));
    assert.ok(s.units.includes('g') && s.units.includes('kg'));
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

    await test('demo pantry Cheese has slicePack and matches 2-slice recipe', async () => {
      const demo = await User.findOne({ email: 'demo@moodmeal.com' });
      const cheese = await FoodItem.findOne({ userId: demo._id, name: 'Cheese', isSeed: true });
      assert.ok(cheese, 'demo Cheese item missing');
      assert.strictEqual(cheese.quantity, 200);
      assert.strictEqual(cheese.slicePack?.weightGrams, 200);
      assert.strictEqual(cheese.slicePack?.slices, 10);
      const m = matchIngredientRequirements(
        mkRecipe('R', 2, 'slice', 'Cheese'),
        [cheese.toObject()]
      );
      assert.strictEqual(m.results[0].availabilityState, 'CONVERTED_MATCH');
      assert.strictEqual(m.canCook, true);
      assert.ok(m.results[0].conversionNote.includes('package-specific'), `note: ${m.results[0].conversionNote}`);
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
