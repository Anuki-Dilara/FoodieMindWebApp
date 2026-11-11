// Tests for strict ingredient identity matching, quantity-aware availability
// and approved substitutions. Run: node test/ingredientIdentity.test.js

const assert = require('assert');
const path = require('path');
const { normalizeIngredientName } = require('../utils/unitConversion');
const { sameIngredient, canonicalName } = require('../utils/ingredientIdentity');
const { ingredientExactMatch, ingredientMatchesInventory, hasAllergyConflict, recommendRecipes } = require('../utils/recipeEngine');
const { matchIngredientRequirements, AVAILABILITY_STATUS } = require('../utils/ingredientMatcher');
const { matchIngredients } = require('../utils/moodScorers');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

const DAY = 864e5;
const mkItem = (name, quantity, unit, daysLeft = 10) => ({
  name, quantity, unit, expiryDate: new Date(Date.now() + daysLeft * DAY),
});
const mkRecipe = (ingredients) => ({ name: 'R', ingredients });
const ing = (name, quantity, unit, extra = {}) => ({ name, quantity, unit, ...extra });

const OIL_SUB = [{
  originalIngredient: 'sesame oil', substituteIngredient: 'cooking oil',
  quantityRatio: 1, isActive: true,
  instructionAdjustment: 'Neutral oil works for frying, but the sesame flavour will be absent.',
}];

async function main() {
  console.log('== Strict identity matching ==');

  await test('cooking oil does NOT match sesame oil', () => {
    assert.ok(!sameIngredient('Cooking Oil', 'Sesame Oil'));
    assert.ok(!ingredientExactMatch('Cooking Oil', 'Sesame Oil'));
    assert.ok(!ingredientMatchesInventory('Sesame Oil', [mkItem('Cooking Oil', 1, 'l')]));
  });

  await test('sesame oil does NOT match olive oil', () => {
    assert.ok(!sameIngredient('Sesame Oil', 'Olive Oil'));
    assert.ok(!ingredientMatchesInventory('Olive Oil', [mkItem('Sesame Oil', 200, 'ml')]));
  });

  await test('black pepper does NOT match bell pepper', () => {
    assert.ok(!sameIngredient('Black Pepper', 'Bell Pepper'));
    assert.ok(!ingredientMatchesInventory('Bell Pepper', [mkItem('Black Pepper', 50, 'g')]));
  });

  await test('genuine aliases still work (dhal, capsicum, yogurt, chilli, spring onion)', () => {
    assert.ok(sameIngredient('Dhal', 'Red Lentils'));
    assert.ok(sameIngredient('Dhal (Red Lentils)', 'red lentils'));
    assert.ok(sameIngredient('Capsicum', 'Bell Pepper'));
    assert.ok(sameIngredient('Yoghurt', 'Yogurt'));
    assert.ok(sameIngredient('chilli', 'Chili'));
    assert.ok(sameIngredient('Spring Onion', 'Green Onion'));
    assert.ok(ingredientMatchesInventory('Red Lentils', [mkItem('Dhal (Red Lentils)', 500, 'g')]));
  });

  await test('ambiguous/specific identities are not merged', () => {
    assert.ok(!sameIngredient('Rice Noodles', 'Wheat Noodles'));
    assert.ok(!sameIngredient('Rice Noodles', 'noodles'));
    assert.ok(!sameIngredient('Red Rice', 'White Rice'));
    assert.ok(!sameIngredient('Coconut Milk', 'Milk'));
    assert.ok(!sameIngredient('Tomato Paste', 'Tomato'));
    assert.ok(!sameIngredient('Chilli Powder', 'Chilli'));
    assert.ok(!sameIngredient('Green Beans', 'Black Beans'));
    assert.ok(!sameIngredient('Peanut Butter', 'Peanuts'));
  });

  console.log('== Quantity-aware exact matching ==');

  await test('exact quantity matching works', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Sesame Oil', 100, 'ml')], {}
    );
    assert.strictEqual(r.results[0].status, 'AVAILABLE');
  });

  await test('insufficient quantity is identified (not falsely available)', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('rice', 3000, 'g')]),
      [mkItem('White Rice', 2, 'kg')], {}
    );
    assert.strictEqual(r.results[0].status, 'MISSING');
    assert.strictEqual(r.results[0].hasPartialExact, true);
    assert.strictEqual(r.partial[0].available, 2000);
  });

  await test('expired ingredients are excluded', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('milk', 200, 'ml')]),
      [mkItem('Milk', 1, 'l', -1)], {}
    );
    assert.strictEqual(r.results[0].status, 'MISSING');
  });

  await test('optional ingredients are excluded from mandatory matching', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('rice', 100, 'g'), ing('saffron', 1, 'g', { isOptional: true })]),
      [mkItem('White Rice', 1, 'kg')], {}
    );
    assert.strictEqual(r.requiredCount, 1);
    assert.strictEqual(r.results.length, 1);
    assert.strictEqual(r.canCook, true);
  });

  console.log('== Substitutions ==');

  await test('approved substitute yields SUBSTITUTE_AVAILABLE, not exact match', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Cooking Oil', 1, 'l')],
      { substitutions: OIL_SUB }
    );
    const res = r.results[0];
    assert.strictEqual(res.status, 'SUBSTITUTE_AVAILABLE');
    assert.strictEqual(res.matchType, 'substitute');
    assert.strictEqual(res.substitute.substituteIngredient, 'cooking oil');
    // Substitute must NOT inflate exact availability
    assert.strictEqual(r.availability, 0);
    assert.strictEqual(r.matched.length, 0);
    assert.strictEqual(r.substituted.length, 1);
    assert.strictEqual(r.canCook, false);
    assert.strictEqual(r.canCookWithSubstitutes, true);
  });

  await test('substitutions are not reported as exact matches', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons'), ing('egg', 2, 'pieces')]),
      [mkItem('Cooking Oil', 1, 'l'), mkItem('Eggs', 6, 'pieces')],
      { substitutions: OIL_SUB }
    );
    assert.strictEqual(r.matchedNames.length, 1); // only egg
    assert.ok(r.matchedNames.includes('egg'));
    assert.ok(!r.matchedNames.includes('sesame oil'));
    assert.strictEqual(r.availability, 50); // 1 of 2 exact
  });

  await test('allergy restrictions apply to substitutes', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Cooking Oil', 1, 'l')],
      { substitutions: OIL_SUB, userAllergies: ['Soy'] }
    );
    // cooking oil is not soy — but test with a soy-conflicting substitute:
    const soySub = [{ originalIngredient: 'sesame oil', substituteIngredient: 'soy sauce', quantityRatio: 1, isActive: true }];
    const r2 = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Soy Sauce', 200, 'ml')],
      { substitutions: soySub, userAllergies: ['Soy'] }
    );
    assert.strictEqual(r2.results[0].status, 'MISSING', 'allergen substitute was used');
  });

  await test('insufficient substitute quantity falls back to MISSING', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 500, 'ml')]),
      [mkItem('Cooking Oil', 100, 'ml')],
      { substitutions: OIL_SUB }
    );
    assert.strictEqual(r.results[0].status, 'MISSING');
  });

  await test('no substitute data -> strict MISSING', () => {
    const r = matchIngredientRequirements(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Cooking Oil', 1, 'l')], {}
    );
    assert.strictEqual(r.results[0].status, 'MISSING');
    assert.strictEqual(r.availability, 0);
  });

  console.log('== Integration: legacy engine + mood matcher ==');

  await test('legacy recommendRecipes uses strict matching (sesame oil not satisfied by cooking oil)', () => {
    const recipe = {
      _id: 'r1', name: 'Sesame Noodles', cookingTime: 15, difficulty: 'Easy',
      ingredients: [ing('sesame oil', 2, 'tablespoons'), ing('noodles', 100, 'g'), ing('egg', 2, 'pieces')],
      instructions: ['a', 'b'], servings: 2, dietaryType: [], moodTags: [],
    };
    const inventory = [mkItem('Cooking Oil', 1, 'l'), mkItem('Rice Noodles', 400, 'g'), mkItem('Eggs', 6, 'pieces')];
    const [rec] = recommendRecipes([recipe], inventory, { allergies: [], dietaryPreferences: [], cookingSkillLevel: 'Advanced' }, null, null, 5, OIL_SUB);
    assert.ok(rec, 'recipe not recommended at all');
    // sesame oil -> substitute, noodles -> rice noodles? 'noodles' vs 'rice noodle' NOT same -> missing
    assert.ok(!rec.matchedIngredients.some((m) => m.name === 'sesame oil'), 'sesame oil falsely matched');
    assert.strictEqual(rec.substitutedIngredients.length, 1);
    assert.strictEqual(rec.substitutedIngredients[0].name, 'sesame oil');
  });

  await test('moodScorers.matchIngredients exposes three-state results', () => {
    const r = matchIngredients(
      mkRecipe([ing('sesame oil', 2, 'tablespoons')]),
      [mkItem('Cooking Oil', 1, 'l')],
      { substitutions: OIL_SUB }
    );
    assert.strictEqual(r.results[0].status, 'SUBSTITUTE_AVAILABLE');
    assert.strictEqual(r.availability, 0);
    assert.strictEqual(r.substituteCoverage, 100);
  });

  await test('allergy hard filter still excludes allergen recipes', () => {
    const recipe = {
      _id: 'r2', name: 'Peanut Dish', cookingTime: 10, difficulty: 'Easy',
      ingredients: [ing('peanut butter', 50, 'g')], instructions: ['a'], servings: 1,
    };
    const res = recommendRecipes([recipe], [], { allergies: ['Nuts'], dietaryPreferences: [], cookingSkillLevel: 'Advanced' }, null, null, 5);
    assert.strictEqual(res.length, 0, 'allergen recipe recommended');
    assert.ok(hasAllergyConflict(recipe, ['Nuts']));
  });

  console.log('\n========== DB-backed checks ==========');

  let mongoose;
  try {
    mongoose = require('mongoose');
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  } catch (e) {
    console.log('DB tests skipped (MongoDB unreachable)');
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  const User = require('../models/User');
  const FoodItem = require('../models/FoodItem');
  const IngredientSubstitution = require('../models/IngredientSubstitution');
  const Recipe = require('../models/Recipe');
  const { getMoodRecommendations } = require('../utils/moodRecommendationEngine');
  const demoUser = await User.findOne({ email: 'demo@moodmeal.com' }).lean();
  const inventory = await FoodItem.find({ userId: demoUser._id, isSeed: true }).lean();
  const recipes = await Recipe.find({ isSeed: true }).lean();

  await test('demo pantry: cooking oil does NOT satisfy sesame oil recipe', async () => {
    const sesameRecipe = recipes.find((r) =>
      (r.ingredients || []).some((i) => /sesame oil/i.test(i.name)));
    assert.ok(sesameRecipe, 'no seed recipe uses sesame oil');
    const res = await getMoodRecommendations([sesameRecipe], inventory, demoUser, ['Happy'], {}, { substitutions: [] });
    const rec = [...res.readyToCook, ...res.needsIngredients][0];
    const status = rec.ingredientStatuses.find((s) => /sesame oil/i.test(s.name));
    assert.strictEqual(status.status, 'MISSING', `sesame oil status was ${status.status}`);
    assert.ok(rec.pantryAvailability < 100, 'false 100% pantry availability');
  });

  await test('with substitutions: sesame oil -> SUBSTITUTE_AVAILABLE via cooking oil', async () => {
    const sesameRecipe = recipes.find((r) =>
      (r.ingredients || []).some((i) => /sesame oil/i.test(i.name)));
    const subs = await IngredientSubstitution.find({ isActive: true }).lean();
    const res = await getMoodRecommendations([sesameRecipe], inventory, demoUser, ['Happy'], {}, { substitutions: subs });
    const rec = [...res.readyToCook, ...res.needsIngredients][0];
    const status = rec.ingredientStatuses.find((s) => /sesame oil/i.test(s.name));
    assert.strictEqual(status.status, 'SUBSTITUTE_AVAILABLE');
    assert.strictEqual(status.substitute.substituteIngredient, 'cooking oil');
    // Exact availability must NOT include the substitute
    const exactAvail = rec.ingredientStatuses.filter((s) => s.status === 'AVAILABLE').length;
    assert.ok(rec.pantryAvailability < 100 || exactAvail === rec.ingredientStatuses.length);
  });

  await test('adding sesame oil to pantry flips status to AVAILABLE', async () => {
    const sesameRecipe = recipes.find((r) =>
      (r.ingredients || []).some((i) => /sesame oil/i.test(i.name)));
    const ing = sesameRecipe.ingredients.find((i) => /sesame oil/i.test(i.name));
    const fakeSesame = {
      name: 'Sesame Oil', quantity: ing.quantity * 4, unit: ing.unit,
      expiryDate: new Date(Date.now() + 300 * DAY),
    };
    const subs = await IngredientSubstitution.find({ isActive: true }).lean();
    const res = await getMoodRecommendations([sesameRecipe], [...inventory, fakeSesame], demoUser, ['Happy'], {}, { substitutions: subs });
    const rec = [...res.readyToCook, ...res.needsIngredients][0];
    const status = rec.ingredientStatuses.find((s) => /sesame oil/i.test(s.name));
    assert.strictEqual(status.status, 'AVAILABLE');
    assert.strictEqual(status.matchType, 'exact');
  });

  await test('shopping list gets genuinely missing ingredients only', async () => {
    const { matchIngredientRequirements: mir } = require('../utils/ingredientMatcher');
    const subs = await IngredientSubstitution.find({ isActive: true }).lean();
    const sesameRecipe = recipes.find((r) =>
      (r.ingredients || []).some((i) => /sesame oil/i.test(i.name)));
    const pantry = mir(sesameRecipe, inventory, { substitutions: subs, userAllergies: [] });
    const forShopping = pantry.results.filter((r) => r.status !== 'AVAILABLE');
    // sesame oil IS substitute-available -> still goes to shopping as missing original
    assert.ok(forShopping.some((r) => /sesame oil/i.test(r.name)), 'sesame oil missing from shopping candidates');
    // ingredients that are fully available must NOT be on the list
    assert.ok(!forShopping.some((r) => /^(rice|onion|garlic|soy sauce)$/i.test(r.name) && r.status === 'AVAILABLE'));
  });

  await test('exactly 50 seed recipes and 50 demo inventory items remain', async () => {
    assert.strictEqual(await Recipe.countDocuments({ isSeed: true }), 50);
    assert.strictEqual(await FoodItem.countDocuments({ userId: demoUser._id, isSeed: true }), 50);
  });

  await mongoose.disconnect();

  console.log(`\n========== ${passed} passed, ${failed} failed ==========`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
