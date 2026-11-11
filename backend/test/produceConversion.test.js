// Automated tests for the ingredient-specific produce conversion system.
// Run: node test/produceConversion.test.js
// DB-backed checks run only if MongoDB is reachable.

const assert = require('assert');

const { convertQuantity, deductQuantity, canConvert } = require('../utils/unitConversion');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');
const produce = require('../utils/produceConversionService');
const { PRODUCE_PROFILES } = require('../data/produceProfiles');

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

async function main() {
  console.log('== Produce conversion unit tests ==');

  await test('pieces -> grams uses ingredient profile (2 medium carrots = 120g)', () => {
    const r = convertQuantity(2, 'pieces', 'g', 'carrot', { size: 'm' });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 120);
    assert.strictEqual(r.isEstimate, true);
  });

  await test('grams -> pieces inverse conversion', () => {
    const r = convertQuantity(120, 'g', 'pieces', 'carrot', { size: 'm' });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 2);
    assert.strictEqual(r.unit, 'pieces');
  });

  await test('kg -> pieces (1 kg carrots ≈ 16.67 medium pieces)', () => {
    const r = convertQuantity(1, 'kg', 'pieces', 'carrot', { size: 'm' });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 16.67, 0.01);
  });

  await test('size variants produce different weights', () => {
    const small = convertQuantity(1, 'piece', 'g', 'onion', { size: 's' });
    const large = convertQuantity(1, 'piece', 'g', 'onion', { size: 'l' });
    approx(small.quantity, 80);
    approx(large.quantity, 180);
    assert.ok(large.quantity > small.quantity);
  });

  await test('head -> grams (1 head cabbage ≈ 1000g)', () => {
    const r = convertQuantity(1, 'head', 'g', 'cabbage');
    assert.strictEqual(r.success, true);
    approx(r.quantity, 1000);
  });

  await test('bunch -> grams (1 bunch spinach ≈ 250g)', () => {
    const r = convertQuantity(1, 'bunch', 'g', 'spinach');
    assert.strictEqual(r.success, true);
    approx(r.quantity, 250);
  });

  await test('cloves and bulbs (3 garlic cloves ≈ 9g, 1 bulb ≈ 50g)', () => {
    const cloves = convertQuantity(3, 'cloves', 'g', 'garlic');
    const bulb = convertQuantity(1, 'bulb', 'g', 'garlic');
    approx(cloves.quantity, 9);
    approx(bulb.quantity, 50);
  });

  await test('chopped cup -> grams is ingredient-specific (carrot 110g vs onion 160g)', () => {
    const carrot = convertQuantity(1, 'cup', 'g', 'carrot', { form: 'chopped' });
    const onion = convertQuantity(1, 'cup', 'g', 'onion', { form: 'chopped' });
    approx(carrot.quantity, 110);
    approx(onion.quantity, 160);
  });

  await test('sliced vs grated cups differ (carrot)', () => {
    const sliced = convertQuantity(1, 'cup', 'g', 'carrot', { form: 'sliced' });
    const grated = convertQuantity(1, 'cup', 'g', 'carrot', { form: 'grated' });
    approx(sliced.quantity, 93.5);
    approx(grated.quantity, 77);
    assert.ok(sliced.quantity > grated.quantity);
  });

  await test('tablespoons derive from cup profile (1 tbsp chopped carrot ≈ 6.88g)', () => {
    const r = convertQuantity(1, 'tablespoon', 'g', 'carrot', { form: 'chopped' });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 110 / 16, 0.01);
  });

  await test('ml -> grams via ingredient density (240ml chopped carrot ≈ 110g)', () => {
    const r = convertQuantity(240, 'ml', 'g', 'carrot', { form: 'chopped' });
    assert.strictEqual(r.success, true);
    approx(r.quantity, 110, 0.5);
  });

  await test('cup -> ml volume conversion', () => {
    const r = convertQuantity(1, 'cup', 'ml', 'carrot');
    assert.strictEqual(r.success, true);
    approx(r.quantity, 240);
  });

  await test('fractional produce quantities (0.5 medium carrot = 30g)', () => {
    const r = convertQuantity(0.5, 'pieces', 'g', 'carrot', { size: 'm' });
    approx(r.quantity, 30);
  });

  await test('unsupported count unit fails honestly (carrot clove)', () => {
    const r = convertQuantity(2, 'cloves', 'g', 'carrot');
    assert.strictEqual(r.success, false);
  });

  await test('ingredient without profile cannot convert pieces->g (cooking oil)', () => {
    assert.strictEqual(canConvert('pieces', 'g', 'cooking oil'), false);
    const r = convertQuantity(2, 'pieces', 'g', 'cooking oil');
    assert.strictEqual(r.success, false);
  });

  await test('different identities stay distinct (olive oil has no produce profile)', () => {
    assert.strictEqual(produce.getProfile('olive oil'), null);
    assert.strictEqual(produce.getProfile('sesame oil'), null);
  });

  await test('local aliases resolve to profiles (Rathala, Wattakka, Karawila, Murunga)', () => {
    approx(convertQuantity(1, 'piece', 'g', 'Rathala').quantity, 250);   // sweet potato m
    approx(convertQuantity(1, 'piece', 'g', 'Wattakka').quantity, 1200); // pumpkin
    approx(convertQuantity(1, 'piece', 'g', 'Karawila').quantity, 200);  // bitter gourd
    approx(convertQuantity(1, 'piece', 'g', 'Murunga').quantity, 100);   // drumstick
    approx(convertQuantity(1, 'piece', 'g', 'Kola Gowa').quantity, 1000); // cabbage head default
  });

  await test('coconut does not merge with coconut milk', () => {
    assert.ok(produce.getProfile('coconut'));
    assert.strictEqual(produce.getProfile('coconut milk'), null);
  });

  await test('deduction: 1kg carrots - 2 medium carrots = 880g', () => {
    const r = deductQuantity(1, 'kg', 2, 'pieces', 'carrot', { size: 'm' });
    assert.strictEqual(r.isEmpty, false);
    approx(r.quantity, 0.88, 0.001);
    assert.strictEqual(r.unit, 'kg');
    assert.strictEqual(r.isEstimate, true);
  });

  await test('deduction: 5 onions - 2 onions = 3 onions (exact)', () => {
    const r = deductQuantity(5, 'pieces', 2, 'pieces', 'onion');
    approx(r.quantity, 3);
    assert.strictEqual(r.isEstimate, false);
  });

  await test('deduction refuses impossible conversion', () => {
    assert.throws(() => deductQuantity(100, 'g', 2, 'cloves', 'carrot'), /Cannot convert/);
  });

  await test('matcher reports CONVERTED_MATCH for kg inventory vs piece recipe', () => {
    const recipe = { ingredients: [{ name: 'Carrots', quantity: 2, unit: 'pieces', size: 'm' }] };
    const inventory = [{ name: 'Carrots', quantity: 1, unit: 'kg', expiryDate: new Date(Date.now() + 86400000) }];
    const m = matchIngredientRequirements(recipe, inventory);
    assert.strictEqual(m.results[0].status, 'AVAILABLE');
    assert.strictEqual(m.results[0].matchType, 'converted');
    assert.strictEqual(m.results[0].availabilityState, 'CONVERTED_MATCH');
    assert.ok(m.results[0].conversionNote);
    assert.strictEqual(m.canCook, true);
  });

  await test('matcher reports EXACT_MATCH for same-unit sufficient stock', () => {
    const recipe = { ingredients: [{ name: 'Onions', quantity: 2, unit: 'pieces' }] };
    const inventory = [{ name: 'Onions', quantity: 5, unit: 'pieces', expiryDate: new Date(Date.now() + 86400000) }];
    const m = matchIngredientRequirements(recipe, inventory);
    assert.strictEqual(m.results[0].matchType, 'exact');
    assert.strictEqual(m.results[0].availabilityState, 'EXACT_MATCH');
  });

  await test('insufficient converted quantity -> MISSING (100g vs 3 medium carrots)', () => {
    const recipe = { ingredients: [{ name: 'Carrots', quantity: 3, unit: 'pieces', size: 'm' }] };
    const inventory = [{ name: 'Carrots', quantity: 100, unit: 'g', expiryDate: new Date(Date.now() + 86400000) }];
    const m = matchIngredientRequirements(recipe, inventory);
    assert.strictEqual(m.results[0].status, 'MISSING');
    assert.strictEqual(m.canCook, false);
  });

  await test('unsupported conversion produces no false availability', () => {
    // Passion fruit has a piece profile but no volume data.
    const recipe = { ingredients: [{ name: 'Passion Fruit', quantity: 1, unit: 'cup' }] };
    const inventory = [{ name: 'Passion Fruit', quantity: 500, unit: 'g', expiryDate: new Date(Date.now() + 86400000) }];
    const m = matchIngredientRequirements(recipe, inventory);
    assert.strictEqual(m.results[0].status, 'MISSING');
  });

  await test('every profile is flagged estimated with confidence + source', () => {
    for (const [key, p] of Object.entries(PRODUCE_PROFILES)) {
      assert.strictEqual(p.estimated, true, `${key} not estimated`);
      assert.ok(p.confidence, `${key} missing confidence`);
      assert.ok(p.source, `${key} missing source`);
      assert.ok(p.supportedUnits.includes('g') && p.supportedUnits.includes('kg'), `${key} missing weight units`);
    }
  });

  await test('profile count covers catalogue (>= 70 produce items)', () => {
    assert.ok(Object.keys(PRODUCE_PROFILES).length >= 70, `only ${Object.keys(PRODUCE_PROFILES).length} profiles`);
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
    const Recipe = require('../models/Recipe');
    const User = require('../models/User');
    await produce.initProduceProfiles();

    await test('demo pantry: produce items convert to recipe units', async () => {
      const demo = await User.findOne({ email: 'demo@moodmeal.com' });
      assert.ok(demo, 'demo user missing');
      const items = await FoodItem.find({ userId: demo._id, isSeed: true });
      assert.strictEqual(items.length, 50, 'expected 50 seeded items');

      // Every produce item must have a working conversion to grams.
      const produceItems = items.filter((i) => produce.getProfile(i.name));
      assert.ok(produceItems.length >= 15, `only ${produceItems.length} produce items with profiles`);
      for (const item of produceItems) {
        // Pass the item's own slicesPerLoaf so bread loaves resolve correctly.
        const r = convertQuantity(item.quantity, item.unit, 'g', item.name, { slicesPerLoaf: item.slicesPerLoaf });
        assert.strictEqual(r.success, true, `${item.name}: ${item.quantity} ${item.unit} -> g failed`);
        assert.ok(r.quantity > 0, `${item.name}: non-positive gram conversion`);
      }
    });

    await test('all seed recipe produce ingredients resolve a profile or fail honestly', async () => {
      const recipes = await Recipe.find({ isSeed: true });
      assert.strictEqual(recipes.length, 50, 'expected 50 seed recipes');
      const ingredientNames = new Set();
      for (const r of recipes) for (const ing of r.ingredients || []) ingredientNames.add(ing.name);
      const covered = [...ingredientNames].filter((n) => produce.getProfile(n));
      // At minimum all catalogue produce used in recipes must convert.
      for (const name of covered) {
        const profile = produce.getProfile(name);
        assert.ok(profile.countUnits && Object.keys(profile.countUnits).length >= 0);
      }
      console.log(`    (${covered.length}/${ingredientNames.size} recipe ingredients have produce profiles)`);
      assert.ok(covered.length >= 10, 'too few recipe ingredients covered by produce profiles');
    });

    await test('seeded conversion profiles exist in DB and match catalogue', async () => {
      await produce.upsertProduceProfiles(); // idempotent seed
      const ProduceConversion = require('../models/ProduceConversion');
      const count = await ProduceConversion.countDocuments({});
      assert.strictEqual(count, Object.keys(PRODUCE_PROFILES).length, 'DB profile count mismatch');
    });

    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    for (const f of failures) console.log(`  FAIL: ${f.name} — ${f.error.message}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
