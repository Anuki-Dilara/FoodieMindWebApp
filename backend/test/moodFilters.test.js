// Tests for the redesigned Mood refinement filters:
//   - Time Available (total recipe time hard filter)
//   - Servings (dynamic ingredient scaling + nutrition)
//   - Use-This-Ingredient-First (bounded ranking preference)
//   - Cooking Setup (equipment + no-cook)
// Run: node test/moodFilters.test.js

const assert = require('assert');
const { getMoodRecommendations, requiredEquipmentFor, normalizeEquipmentSet, canonicalEquipment } = require('../utils/moodRecommendationEngine');

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

const user = { _id: 'user-1', cookingSkillLevel: 'Advanced', allergies: [], dietaryPreferences: [] };
const emptyContext = { cookedHistory: [], feedbackByRecipe: new Map(), substitutions: [] };
const future = new Date(Date.now() + 30 * 86400000);
const soon = new Date(Date.now() + 2 * 86400000);
const past = new Date(Date.now() - 86400000);

function mkRecipe(overrides = {}) {
  return {
    _id: overrides._id || `r-${Math.random().toString(36).slice(2)}`,
    name: overrides.name || 'Test Recipe',
    description: '',
    mealType: overrides.mealType || 'Dinner',
    difficulty: 'Easy',
    cookingTime: overrides.cookingTime ?? 25,
    servings: overrides.servings ?? 2,
    ingredients: overrides.ingredients || [{ name: 'Rice', quantity: 200, unit: 'g', isOptional: false }],
    instructions: ['Cook it'],
    nutrition: { calories: 400, protein: 15, carbohydrates: 55, fat: 10, fibre: 4, isEstimated: true },
    preparation: {
      handsOnTime: overrides.handsOnTime ?? 10,
      totalSteps: 4,
      equipment: overrides.equipment ?? [],
      method: overrides.method || 'stovetop',
      effort: 'Low',
    },
    moodTags: overrides.moodTags || ['Tired'],
    tags: overrides.tags || [],
    foodTemperature: overrides.foodTemperature || 'warm',
    texture: overrides.texture || ['soft'],
    flavourProfile: overrides.flavourProfile || ['mild'],
    colourVariety: 3,
    ingredientCategories: ['grains'],
    dietaryType: [],
    ...overrides,
  };
}

function namesOf(result) {
  return [...result.readyToCook, ...result.needsIngredients].map((r) => r.name);
}

async function recommend(recipes, inventory = [], moods = ['Tired'], filters = {}) {
  return getMoodRecommendations(recipes, inventory, user, moods, filters, emptyContext);
}

async function main() {
  console.log('== Mood filter tests ==');

  // ---------- Time Available ----------
  await test('time filter excludes recipes over the limit (total time)', async () => {
    const slow = mkRecipe({ _id: 'slow', name: 'Slow Stew', cookingTime: 50 });
    const fast = mkRecipe({ _id: 'fast', name: 'Quick Fry', cookingTime: 20 });
    const res = await recommend([slow, fast], [], ['Tired'], { timeAvailable: '30 minutes' });
    assert.ok(namesOf(res).includes('Quick Fry'));
    assert.ok(!namesOf(res).includes('Slow Stew'));
  });

  await test('time filter recalculates when limit changes', async () => {
    const slow = mkRecipe({ _id: 'slow2', name: 'Slow Stew', cookingTime: 50 });
    const fast = mkRecipe({ _id: 'fast2', name: 'Quick Fry', cookingTime: 20 });
    const tight = await recommend([slow, fast], [], ['Tired'], { timeAvailable: '30 minutes' });
    const loose = await recommend([slow, fast], [], ['Tired'], { timeAvailable: '60 minutes' });
    assert.ok(!namesOf(tight).includes('Slow Stew'));
    assert.ok(namesOf(loose).includes('Slow Stew'));
  });

  await test('filter uses total time, not hands-on time', async () => {
    // cookingTime=35 total but only 5 min hands-on — must still be excluded at 30.
    const r = mkRecipe({ _id: 'hands', name: 'Hands On Dish', cookingTime: 35, handsOnTime: 5 });
    const res = await recommend([r], [], ['Tired'], { timeAvailable: '30 minutes' });
    assert.strictEqual(namesOf(res).length, 0);
  });

  await test('missing cookingTime handled safely (defaults to 45)', async () => {
    const r = mkRecipe({ _id: 'notime', name: 'Mystery Dish' });
    delete r.cookingTime;
    const res30 = await recommend([r], [], ['Tired'], { timeAvailable: '30 minutes' });
    const res60 = await recommend([r], [], ['Tired'], { timeAvailable: '60 minutes' });
    assert.strictEqual(namesOf(res30).length, 0);
    assert.ok(namesOf(res60).includes('Mystery Dish'));
  });

  // ---------- Servings ----------
  await test('servings scale ingredient quantities proportionally', async () => {
    const r = mkRecipe({
      _id: 'srv', name: 'Rice Bowl', servings: 2,
      ingredients: [{ name: 'Rice', quantity: 200, unit: 'g' }],
    });
    const res = await recommend([r], [], ['Tired'], { selectedServings: 4 });
    const out = [...res.readyToCook, ...res.needsIngredients][0];
    assert.strictEqual(out.ingredients[0].quantity, 400);
    assert.strictEqual(out.servings, 4);
    assert.strictEqual(out.originalServings, 2);
    assert.strictEqual(out.selectedServings, 4);
  });

  await test('fractional scaling preserves units (3 servings of a 2-serving recipe)', async () => {
    const r = mkRecipe({
      _id: 'frac', name: 'Fraction Bowl', servings: 2,
      ingredients: [{ name: 'Rice', quantity: 200, unit: 'g' }],
    });
    const res = await recommend([r], [], ['Tired'], { selectedServings: 3 });
    const out = [...res.readyToCook, ...res.needsIngredients][0];
    assert.strictEqual(out.ingredients[0].quantity, 300);
    assert.strictEqual(out.ingredients[0].unit, 'g');
  });

  await test('per-serving nutrition unchanged; totals scale with servings', async () => {
    const r = mkRecipe({ _id: 'nut', name: 'Nutri Bowl', servings: 2 });
    const res = await recommend([r], [], ['Tired'], { selectedServings: 4 });
    const out = [...res.readyToCook, ...res.needsIngredients][0];
    assert.strictEqual(out.caloriesPerServing, 400); // per serving preserved
    assert.strictEqual(out.totalNutrition.calories, 1600); // 400 x 4
    assert.strictEqual(out.totalNutrition.protein, 60);
  });

  // ---------- Use This Ingredient First ----------
  await test('ingredient-first boosts matching recipes but keeps others', async () => {
    const withTomato = mkRecipe({
      _id: 'tom', name: 'Tomato Rice',
      ingredients: [{ name: 'Tomato', quantity: 2, unit: 'pieces' }, { name: 'Rice', quantity: 200, unit: 'g' }],
    });
    const without = mkRecipe({
      _id: 'cab', name: 'Cabbage Rice',
      ingredients: [{ name: 'Cabbage', quantity: 1, unit: 'head' }, { name: 'Rice', quantity: 200, unit: 'g' }],
    });
    const res = await recommend([withTomato, without], [], ['Tired'], { useIngredientFirst: 'Tomato' });
    const names = namesOf(res);
    assert.ok(names.includes('Tomato Rice'));
    assert.ok(names.includes('Cabbage Rice')); // NOT a hard filter
    const tom = [...res.readyToCook, ...res.needsIngredients].find((x) => x.name === 'Tomato Rice');
    assert.ok(tom.reasons.some((r) => r.includes('Prioritized')));
  });

  await test('ingredient-first uses canonical identity (Capsicum -> Bell Pepper)', async () => {
    const pepper = mkRecipe({
      _id: 'pep', name: 'Pepper Rice',
      ingredients: [{ name: 'Bell Pepper', quantity: 1, unit: 'piece' }, { name: 'Rice', quantity: 200, unit: 'g' }],
    });
    const other = mkRecipe({ _id: 'oth', name: 'Plain Rice' });
    const res = await recommend([pepper, other], [], ['Tired'], { useIngredientFirst: 'Capsicum' });
    const pep = [...res.readyToCook, ...res.needsIngredients].find((x) => x.name === 'Pepper Rice');
    assert.ok(pep.reasons.some((r) => r.includes('Prioritized')));
  });

  await test('ingredient-first considers available quantity (sufficient > insufficient)', async () => {
    const recipe = mkRecipe({
      _id: 'qty', name: 'Tomato Dish',
      ingredients: [{ name: 'Tomato', quantity: 4, unit: 'pieces' }],
    });
    const plenty = [{ name: 'Tomato', quantity: 10, unit: 'pieces', expiryDate: future }];
    const scarce = [{ name: 'Tomato', quantity: 1, unit: 'pieces', expiryDate: future }];
    const resPlenty = await recommend([recipe], plenty, ['Tired'], { useIngredientFirst: 'Tomato' });
    const resScarce = await recommend([recipe], scarce, ['Tired'], { useIngredientFirst: 'Tomato' });
    const a = [...resPlenty.readyToCook, ...resPlenty.needsIngredients][0];
    const b = [...resScarce.readyToCook, ...resScarce.needsIngredients][0];
    assert.ok(a.breakdown.moodSuitability > b.breakdown.moodSuitability,
      `expected sufficient stock to outrank insufficient: ${a.breakdown.moodSuitability} vs ${b.breakdown.moodSuitability}`);
    assert.ok(a.reasons.some((r) => r.includes('enough in your pantry')));
  });

  await test('expiry proximity adds boost; expired items are ignored', async () => {
    const recipe = mkRecipe({
      _id: 'exp', name: 'Tomato Soup',
      ingredients: [{ name: 'Tomato', quantity: 2, unit: 'pieces' }],
    });
    const expiring = [{ name: 'Tomato', quantity: 10, unit: 'pieces', expiryDate: soon }];
    const expired = [{ name: 'Tomato', quantity: 10, unit: 'pieces', expiryDate: past }];
    const resSoon = await recommend([recipe], expiring, ['Tired'], { useIngredientFirst: 'Tomato' });
    const resOld = await recommend([recipe], expired, ['Tired'], { useIngredientFirst: 'Tomato' });
    const a = [...resSoon.readyToCook, ...resSoon.needsIngredients][0];
    const b = [...resOld.readyToCook, ...resOld.needsIngredients][0];
    assert.ok(a.breakdown.moodSuitability > b.breakdown.moodSuitability);
    assert.ok(a.reasons.some((r) => r.includes('expiring soon')));
    assert.ok(!b.reasons.some((r) => r.includes('expiring soon')));
  });

  await test('ingredient-first with no match returns others + explanation', async () => {
    const recipe = mkRecipe({ _id: 'none', name: 'Plain Dish' });
    const res = await recommend([recipe], [], ['Tired'], { useIngredientFirst: 'Durian' });
    assert.ok(namesOf(res).includes('Plain Dish'));
    assert.ok(res.ingredientFirstNote && res.ingredientFirstNote.includes('Durian'));
  });

  // ---------- Cooking Setup ----------
  await test('equipment filter requires selected equipment', async () => {
    const ovenDish = mkRecipe({ _id: 'ovn', name: 'Oven Bake', equipment: ['baking tray'], method: 'oven' });
    const stoveDish = mkRecipe({ _id: 'stv', name: 'Stovetop Fry', equipment: ['pan'], method: 'stovetop' });
    const res = await recommend([ovenDish, stoveDish], [], ['Tired'], { equipment: ['Stove'] });
    assert.ok(namesOf(res).includes('Stovetop Fry'));
    assert.ok(!namesOf(res).includes('Oven Bake'));
  });

  await test('multi-equipment recipes need ALL equipment', async () => {
    const both = mkRecipe({ _id: 'both', name: 'Oven then Pan', equipment: ['baking tray', 'pan'], method: 'mixed' });
    const resPartial = await recommend([both], [], ['Tired'], { equipment: ['Oven'] });
    const resFull = await recommend([both], [], ['Tired'], { equipment: ['Oven', 'Stove'] });
    assert.strictEqual(namesOf(resPartial).length, 0);
    assert.ok(namesOf(resFull).includes('Oven then Pan'));
  });

  await test('method implies equipment (stovetop method needs Stove)', async () => {
    const r = mkRecipe({ _id: 'impl', name: 'Implied Stove', equipment: [], method: 'stovetop' });
    const res = await recommend([r], [], ['Tired'], { equipment: ['Microwave'] });
    assert.strictEqual(namesOf(res).length, 0);
    const res2 = await recommend([r], [], ['Tired'], { equipment: ['Stove'] });
    assert.ok(namesOf(res2).includes('Implied Stove'));
  });

  await test('equipment names normalize (wok->stove, cutting board ignored)', async () => {
    assert.strictEqual(canonicalEquipment('Wok'), 'stove');
    assert.strictEqual(canonicalEquipment('baking tray'), 'oven');
    assert.strictEqual(canonicalEquipment('cutting board'), null);
    assert.strictEqual(canonicalEquipment('Air Fryer'), 'air fryer');
  });

  await test('no-cook toggle only returns no-cook methods', async () => {
    const noCook = mkRecipe({ _id: 'nc', name: 'No Cook Salad', method: 'no-cook', cookingTime: 5, equipment: ['bowl'] });
    const cooked = mkRecipe({ _id: 'ck', name: 'Cooked Dish', method: 'stovetop' });
    const res = await recommend([noCook, cooked], [], ['Tired'], { noCookOnly: true });
    assert.ok(namesOf(res).includes('No Cook Salad'));
    assert.ok(!namesOf(res).includes('Cooked Dish'));
  });

  await test('requiredEquipmentFor combines equipment + method', () => {
    const r = mkRecipe({ equipment: ['blender'], method: 'stovetop' });
    const req = requiredEquipmentFor(r);
    assert.ok(req.has('blender') && req.has('stove'));
    const set = normalizeEquipmentSet(['Stove', 'No-cook', 'Blender']);
    assert.ok(set.has('stove') && set.has('blender') && set.size === 2);
  });

  // ---------- Combined filters ----------
  await test('all four filters work together', async () => {
    const good = mkRecipe({
      _id: 'good', name: 'Good Match', cookingTime: 20, servings: 2,
      ingredients: [{ name: 'Tomato', quantity: 1, unit: 'piece' }],
      equipment: ['pan'], method: 'stovetop',
    });
    const tooSlow = mkRecipe({ _id: 'slow3', name: 'Too Slow', cookingTime: 60, equipment: ['pan'], method: 'stovetop' });
    const wrongEq = mkRecipe({ _id: 'wrong', name: 'Oven Dish', cookingTime: 20, equipment: ['baking tray'], method: 'oven' });
    const res = await recommend([good, tooSlow, wrongEq], [], ['Tired'], {
      timeAvailable: '30 minutes',
      selectedServings: 2,
      useIngredientFirst: 'Tomato',
      equipment: ['Stove'],
    });
    const names = namesOf(res);
    assert.ok(names.includes('Good Match'));
    assert.ok(!names.includes('Too Slow'));
    assert.ok(!names.includes('Oven Dish'));
    const out = [...res.readyToCook, ...res.needsIngredients].find((x) => x.name === 'Good Match');
    assert.strictEqual(out.servings, 2);
    assert.ok(out.reasons.some((r) => r.includes('Prioritized')));
  });

  await test('allergy hard filter still enforced alongside filters', async () => {
    const allergicUser = { ...user, allergies: ['Eggs'] };
    const eggDish = mkRecipe({ _id: 'egg', name: 'Egg Dish', ingredients: [{ name: 'Eggs', quantity: 2, unit: 'pieces' }] });
    const res = await getMoodRecommendations([eggDish], [], allergicUser, ['Tired'], {}, emptyContext);
    assert.strictEqual(namesOf(res).length, 0);
  });

  // ---------- DB integration (demo user + pantry) ----------
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
    const Recipe = require('../models/Recipe');
    const FoodItem = require('../models/FoodItem');
    const User = require('../models/User');

    await test('demo user: time filter returns only qualifying recipes', async () => {
      const demo = await User.findOne({ email: 'demo@moodmeal.com' }).lean();
      const recipes = await Recipe.find().lean();
      const inventory = await FoodItem.find({ userId: demo._id }).lean();
      const res = await getMoodRecommendations(recipes, inventory, demo, ['Tired'], { timeAvailable: '15 minutes' }, {
        cookedHistory: [], feedbackByRecipe: new Map(), substitutions: [],
      });
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.ok(all.length > 0, 'expected some <=15min recipes');
      for (const r of all) assert.ok((r.totalTime || r.cookingTime) <= 15, `${r.name} exceeds 15 min`);
    });

    await test('demo user: ingredient-first changes ranking', async () => {
      const demo = await User.findOne({ email: 'demo@moodmeal.com' }).lean();
      const recipes = await Recipe.find().lean();
      const inventory = await FoodItem.find({ userId: demo._id }).lean();
      const withPref = await getMoodRecommendations(recipes, inventory, demo, ['Hungry'], { useIngredientFirst: 'Chicken' }, {
        cookedHistory: [], feedbackByRecipe: new Map(), substitutions: [],
      });
      const all = [...withPref.readyToCook, ...withPref.needsIngredients];
      assert.ok(all.length > 0, 'expected recommendations');
      const prioritized = all.filter((r) => (r.reasons || []).some((x) => x.includes('Prioritized')));
      const usesChicken = all.some((r) => (r.ingredients || []).some((i) => /chicken/i.test(i.name)));
      assert.ok(prioritized.length > 0 || usesChicken || withPref.ingredientFirstNote,
        'chicken preference should prioritize matching recipes or explain');
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
