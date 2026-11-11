// Automated tests for the 50-item demo pantry inventory.
// Run: npm test   (node test/inventory.test.js)
// DB-backed checks run only if MongoDB is reachable.

const assert = require('assert');
const path = require('path');
const { DEMO_INVENTORY, upsertSeedInventory } = require('../seed/seedInventory');
const { convertToBase, convertQuantity, normalizeIngredientName } = require('../utils/unitConversion');
const { matchIngredients } = require('../utils/moodScorers');
const { ingredientExactMatch } = require('../utils/recipeEngine');
const { getExpiryStatus } = require('../utils/expiryHelper');
const FoodItem = require('../models/FoodItem');

const VALID_UNITS = ['ml', 'l', 'g', 'kg', 'pieces', 'packets', 'cups', 'tablespoons',
  'teaspoons', 'tbsp', 'tsp', 'bunch', 'bulb', 'loaf', 'can',
  'head', 'clove', 'stalk', 'ear', 'cob', 'wedge', 'slice', 'segment', 'pod', 'sprig', 'whole'];
const VALID_CATEGORIES = [
  'Dairy', 'Fruits', 'Vegetables', 'Meat', 'Fish', 'Bakery',
  'Grains', 'Canned food', 'Snacks', 'Drinks', 'Spices', 'Other',
  'Grains and Cereals', 'Legumes', 'Herbs and Spices',
  'Nuts and Seeds', 'Cooking Essentials', 'Canned and Packaged Foods', 'Protein',
];

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

async function main() {
  console.log('== Inventory seed data tests ==');

  await test('DEMO_INVENTORY contains exactly 50 unique items', () => {
    assert.strictEqual(DEMO_INVENTORY.length, 50);
    const names = DEMO_INVENTORY.map((i) => i.name);
    assert.strictEqual(new Set(names).size, 50, 'duplicate item names');
  });

  await test('all items have valid names and positive quantities', () => {
    for (const item of DEMO_INVENTORY) {
      assert.ok(item.name && item.name.trim().length > 0, 'empty name');
      assert.ok(item.quantity > 0, `${item.name} has non-positive quantity`);
    }
  });

  await test('all units are schema-compatible and convertible to base units', () => {
    for (const item of DEMO_INVENTORY) {
      assert.ok(VALID_UNITS.includes(item.unit), `${item.name}: invalid unit ${item.unit}`);
      const base = convertToBase(item.quantity, item.unit);
      assert.ok(base.quantity > 0, `${item.name}: base conversion failed`);
      assert.ok(base.baseUnit, `${item.name}: missing baseUnit`);
    }
  });

  await test('count-style units (can, loaf, bunch, bulb) convert to pieces base', () => {
    for (const unit of ['can', 'loaf', 'bunch', 'bulb']) {
      const base = convertToBase(2, unit);
      assert.strictEqual(base.baseUnit, 'pieces');
      assert.strictEqual(base.quantity, 2);
      const conv = convertQuantity(2, unit, 'pieces');
      assert.ok(conv.success && conv.quantity === 2, `${unit} -> pieces failed`);
    }
  });

  await test('all categories are schema-compatible', () => {
    for (const item of DEMO_INVENTORY) {
      assert.ok(VALID_CATEGORIES.includes(item.category), `${item.name}: invalid category ${item.category}`);
    }
    // Spec-required groups are represented
    for (const cat of ['Grains and Cereals', 'Legumes', 'Herbs and Spices',
      'Nuts and Seeds', 'Cooking Essentials', 'Canned and Packaged Foods',
      'Vegetables', 'Fruits', 'Dairy', 'Protein']) {
      assert.ok(DEMO_INVENTORY.some((i) => i.category === cat), `missing category ${cat}`);
    }
  });

  await test('expiry offsets are realistic per food type', () => {
    const dry = DEMO_INVENTORY.filter((i) => ['Grains and Cereals', 'Legumes', 'Herbs and Spices',
      'Nuts and Seeds', 'Cooking Essentials', 'Canned and Packaged Foods'].includes(i.category)
      && !['Garlic', 'Ginger', 'Green Chillies', 'Curry Leaves'].includes(i.name));
    for (const item of dry) {
      assert.ok(item.expiryDays >= 30, `${item.name}: dry good expires too soon (${item.expiryDays}d)`);
    }
    // Fresh fish/chicken within spec ranges
    const fish = DEMO_INVENTORY.find((i) => i.name === 'Fresh Fish');
    const chicken = DEMO_INVENTORY.find((i) => i.name === 'Chicken');
    assert.ok(fish.expiryDays >= 1 && fish.expiryDays <= 2, 'fish expiry out of range');
    assert.ok(chicken.expiryDays >= 2 && chicken.expiryDays <= 3, 'chicken expiry out of range');
    const bread = DEMO_INVENTORY.find((i) => i.name === 'Bread');
    assert.ok(bread.expiryDays >= 3 && bread.expiryDays <= 5, 'bread expiry out of range');
  });

  await test('at least 5 items expire within 3 days (expiry-priority demo)', () => {
    const soon = DEMO_INVENTORY.filter((i) => i.expiryDays <= 3);
    assert.ok(soon.length >= 5, `only ${soon.length} items expire within 3 days`);
    // And generated statuses reflect that
    const now = Date.now();
    const statuses = soon.map((i) => getExpiryStatus(new Date(now + i.expiryDays * 864e5)).status);
    assert.ok(statuses.every((s) => s === 'Use Soon'), 'soon items not marked Use Soon');
  });

  await test('ingredient aliases normalize correctly', () => {
    assert.strictEqual(normalizeIngredientName('Dhal'), 'red lentil');
    assert.strictEqual(normalizeIngredientName('Dhal (Red Lentils)'), 'red lentil');
    assert.strictEqual(normalizeIngredientName('Red Lentils'), 'red lentil');
    assert.strictEqual(normalizeIngredientName('chilli'), 'chili');
    assert.strictEqual(normalizeIngredientName('Chilli Powder'), 'chili powder'); // not merged with chili
    assert.strictEqual(normalizeIngredientName('Spring Onion'), 'green onion');
    assert.strictEqual(normalizeIngredientName('Yoghurt'), 'yogurt');
    assert.strictEqual(normalizeIngredientName('Wheat Flour'), 'flour');
    assert.strictEqual(normalizeIngredientName('Green Chillies'), 'chili');
  });

  await test('aliases do not merge distinct foods', () => {
    assert.notStrictEqual(normalizeIngredientName('chilli powder'), normalizeIngredientName('chilli'));
    assert.notStrictEqual(normalizeIngredientName('tomato paste'), normalizeIngredientName('tomato'));
    assert.notStrictEqual(normalizeIngredientName('red rice'), normalizeIngredientName('basmati rice'));
    assert.ok(ingredientExactMatch('Dhal', 'Red Lentils'));
    assert.ok(!ingredientExactMatch('chilli powder', 'chilli'));
    // Strict identity: rice noodles are not generic/wheat noodles
    assert.ok(!ingredientExactMatch('noodles', 'Rice Noodles'));
    assert.ok(!ingredientExactMatch('Cooking Oil', 'Sesame Oil'));
    // Green beans are a specific bean, not generic "beans"
    assert.ok(!ingredientExactMatch('beans', 'Green Beans'));
  });

  // ---------- pantry matching ----------
  const mkItem = (name, quantity, unit, daysLeft = 10) => ({
    name, quantity, unit,
    expiryDate: new Date(Date.now() + daysLeft * 864e5),
  });

  await test('quantity-aware matching: sufficient stock satisfies recipe', () => {
    const recipe = { ingredients: [{ name: 'rice', quantity: 300, unit: 'g' }] };
    const inv = [mkItem('White Rice', 2, 'kg')]; // 2000g available
    const res = matchIngredients(recipe, inv);
    assert.strictEqual(res.missing.length, 0);
    assert.strictEqual(res.matched.length, 1);
  });

  await test('insufficient quantity is reported as missing', () => {
    const recipe = { ingredients: [{ name: 'rice', quantity: 3000, unit: 'g' }] };
    const inv = [mkItem('White Rice', 2, 'kg')]; // only 2000g
    const res = matchIngredients(recipe, inv);
    assert.strictEqual(res.matched.length, 0);
    assert.ok(res.missing.includes('rice'));
    assert.ok(res.partial.length === 1);
    assert.strictEqual(res.partial[0].available, 2000);
  });

  await test('missing ingredients are calculated correctly', () => {
    const recipe = { ingredients: [
      { name: 'rice', quantity: 200, unit: 'g' },
      { name: 'saffron', quantity: 1, unit: 'g' },
      { name: 'onion', quantity: 1, unit: 'pieces' },
    ] };
    const inv = [mkItem('White Rice', 1, 'kg'), mkItem('Onions', 1, 'kg')];
    const res = matchIngredients(recipe, inv);
    assert.deepStrictEqual(res.missing, ['saffron']);
    assert.strictEqual(res.matched.length, 2);
  });

  await test('optional ingredients are excluded from mandatory matching', () => {
    const recipe = { ingredients: [
      { name: 'rice', quantity: 200, unit: 'g' },
      { name: 'saffron', quantity: 1, unit: 'g', isOptional: true },
    ] };
    const res = matchIngredients(recipe, [mkItem('White Rice', 1, 'kg')]);
    assert.strictEqual(res.missing.length, 0);
    assert.strictEqual(res.matched.length, 1);
  });

  await test('expired inventory is ignored by recommendations', () => {
    const recipe = { ingredients: [{ name: 'milk', quantity: 200, unit: 'ml' }] };
    const expired = mkItem('Milk', 1, 'l', -1); // expired yesterday
    const res = matchIngredients(recipe, [expired]);
    assert.strictEqual(res.matched.length, 0);
    assert.ok(res.missing.includes('milk'));
  });

  await test('incompatible units are not directly compared (name-match fallback)', () => {
    // A recipe asking for 'rice' in ml cannot be quantity-verified against a
    // kg stock item; the engine falls back to name matching rather than
    // inventing a weight<->volume conversion.
    const recipe = { ingredients: [{ name: 'rice', quantity: 200, unit: 'ml' }] };
    const inv = [mkItem('White Rice', 2, 'kg')];
    const res = matchIngredients(recipe, inv);
    assert.strictEqual(res.matched.length, 1);
    assert.strictEqual(res.missing.length, 0);
    // And the reverse: an unconvertible but name-matching item never crashes.
    const res2 = matchIngredients(
      { ingredients: [{ name: 'olive oil', quantity: 50, unit: 'g' }] },
      [mkItem('Cooking Oil', 1, 'l')]
    );
    assert.ok(Array.isArray(res2.missing));
  });

  await test('expiring ingredients are flagged for expiry priority', () => {
    const recipe = { ingredients: [{ name: 'spinach', quantity: 1, unit: 'bunch' }] };
    const inv = [mkItem('Spinach', 1, 'bunch', 2)]; // expires in 2 days
    const res = matchIngredients(recipe, inv);
    assert.strictEqual(res.expiringCount, 1);
    assert.ok(res.expiringNames.includes('spinach'));
  });

  await test('demo inventory items match seeded recipe ingredients via aliases', () => {
    // Recipes use 'red lentils', 'chilli', 'yogurt', 'flour', 'noodles', 'rice'
    const checks = [
      ['red lentils', 'Dhal (Red Lentils)'],
      ['chilli', 'Green Chillies'],
      ['yogurt', 'Yoghurt'],
      ['flour', 'Wheat Flour'],
      ['rice', 'White Rice'],
      ['oil', 'Cooking Oil'],
      ['pepper', 'Black Pepper'],
      ['cinnamon', 'Cinnamon Sticks'],
      ['tuna', 'Canned Tuna'],
      ['fish', 'Fresh Fish'],
      ['chicken', 'Chicken'],
      ['onion', 'Onions'],
    ];
    for (const [recipeIng, pantryName] of checks) {
      assert.ok(ingredientExactMatch(recipeIng, pantryName),
        `recipe '${recipeIng}' should match pantry '${pantryName}'`);
    }
  });

  // ---------- DB-backed tests ----------
  let mongoose;
  try {
    mongoose = require('mongoose');
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  } catch (e) {
    console.log('\n== DB tests skipped (MongoDB unreachable) ==');
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const User = require('../models/User');
  const demoUser = await User.findOne({ email: 'demo@moodmeal.com' });
  assert.ok(demoUser, 'demo user not found — run npm run seed first');

  await test('demo user has exactly 50 unique seeded inventory items', async () => {
    const items = await FoodItem.find({ userId: demoUser._id, isSeed: true }).lean();
    assert.strictEqual(items.length, 50, `expected 50, got ${items.length}`);
    assert.strictEqual(new Set(items.map((i) => i.name)).size, 50);
  });

  await test('all seeded records belong to the demo user only', async () => {
    const owners = await FoodItem.aggregate([
      { $match: { isSeed: true } },
      { $group: { _id: '$userId', n: { $sum: 1 } } },
    ]);
    assert.strictEqual(owners.length, 1);
    assert.strictEqual(owners[0]._id.toString(), demoUser._id.toString());
    assert.strictEqual(owners[0].n, 50);
  });

  await test('seeded items have valid quantities, units, categories, expiry dates', async () => {
    const items = await FoodItem.find({ userId: demoUser._id, isSeed: true }).lean();
    for (const item of items) {
      assert.ok(item.name && item.quantity > 0, `${item.name} invalid`);
      assert.ok(VALID_UNITS.includes(item.unit), `${item.name} bad unit`);
      assert.ok(VALID_CATEGORIES.includes(item.category), `${item.name} bad category`);
      assert.ok(item.expiryDate > new Date(), `${item.name} expired`);
      assert.ok(['Fresh', 'Use Soon'].includes(item.status), `${item.name} bad status`);
    }
  });

  await test('several items expire within 3 days in DB', async () => {
    const soon = await FoodItem.countDocuments({
      userId: demoUser._id, isSeed: true,
      expiryDate: { $lte: new Date(Date.now() + 3 * 864e5) },
    });
    assert.ok(soon >= 5, `only ${soon} items expiring within 3 days`);
  });

  await test('re-running seed does not create duplicates (idempotent)', async () => {
    await upsertSeedInventory(demoUser);
    const items = await FoodItem.find({ userId: demoUser._id, isSeed: true }).lean();
    assert.strictEqual(items.length, 50);
    assert.strictEqual(new Set(items.map((i) => i.name)).size, 50);
  });

  await test('real-user inventory is untouched by seeding', async () => {
    const bcrypt = require('bcryptjs');
    const other = await User.create({
      fullName: 'Test User', email: `test-${Date.now()}@example.com`,
      passwordHash: await bcrypt.hash('Test123!', 10),
    });
    const userItem = await FoodItem.create({
      userId: other._id, name: 'My Secret Sauce', quantity: 1, unit: 'pieces',
      baseQuantity: 1, baseUnit: 'pieces', category: 'Other',
      expiryDate: new Date(Date.now() + 30 * 864e5),
    });
    try {
      await upsertSeedInventory(demoUser);
      const stillThere = await FoodItem.findById(userItem._id).lean();
      assert.ok(stillThere, 'user item was deleted');
      const userCount = await FoodItem.countDocuments({ userId: other._id });
      assert.strictEqual(userCount, 1, 'seed added items to real user');
      const demoCount = await FoodItem.countDocuments({ userId: demoUser._id, isSeed: true });
      assert.strictEqual(demoCount, 50);
    } finally {
      await FoodItem.deleteMany({ userId: other._id });
      await User.findByIdAndDelete(other._id);
    }
  });

  await test('pantry availability feeds recommendations for demo user', async () => {
    const { getMoodRecommendations } = require('../utils/moodRecommendationEngine');
    const Recipe = require('../models/Recipe');
    const recipes = await Recipe.find({ isSeed: true }).lean();
    const inventory = await FoodItem.find({ userId: demoUser._id, isSeed: true }).lean();
    const res = await getMoodRecommendations(recipes, inventory, demoUser, ['Hungry'], {}, {});
    const all = [...res.readyToCook, ...res.needsIngredients];
    assert.ok(all.length > 0, 'no recommendations returned');
    // At least one recipe should have pantry matches from the 50-item demo pantry
    const withMatches = all.filter((r) => (r.matchedIngredients || []).length > 0);
    assert.ok(withMatches.length > 0, 'no recipe matched any pantry ingredient');
    for (const r of all) {
      assert.ok(r.score >= 0 && r.score <= 100);
      assert.ok(r.explanation);
    }
  });

  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Test runner failed:', e);
  process.exit(1);
});
