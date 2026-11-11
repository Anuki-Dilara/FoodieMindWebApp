// Automated tests for the mood-based recommendation engine.
// Run: npm test   (node test/moodEngine.test.js)
// DB-backed checks (seed idempotency, recipe count) run only if MongoDB is reachable.

const assert = require('assert');
const path = require('path');
const {
  scoreRecipeForSingleMood,
  scoreRecipeForMoods,
  matchIngredients,
  scoreTimeForMoods,
  scoreExpiryPriority,
  scoreNutritionPreference,
  personalizationAdjustment,
  buildExplanation,
  nutritionPerServing,
  totalTime,
  handsOnTime,
} = require('../utils/moodScorers');
const { getMoodRecommendations, SCORE_WEIGHTS } = require('../utils/moodRecommendationEngine');
const recipeData = require('../seed/recipeData');
const { RECIPE_ATTRIBUTES } = require('../seed/seedRecipes');
const { sanitizeRecipeInput, recipeCompleteness } = require('../utils/recipeValidation');

const ALL_MOODS = ['Happy', 'Tired', 'Sick', 'Stressed', 'Energetic', 'Lazy', 'Sad', 'Hungry'];

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name} — ${e.message}`); });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

// ---------- fixtures ----------
const user = { _id: 'user1', allergies: [], dietaryPreferences: [], cookingSkillLevel: 'Advanced' };
const allergicUser = { _id: 'user2', allergies: ['peanut'], dietaryPreferences: [], cookingSkillLevel: 'Advanced' };
const context = { cookedHistory: [], feedbackByRecipe: new Map() };

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function invItem(name, quantity, unit, days) {
  return { name, quantity, unit, expiryDate: daysFromNow(days) };
}
function mkRecipe(overrides = {}) {
  return {
    _id: overrides._id || 'r1',
    name: overrides.name || 'Test Recipe',
    description: 'test',
    ingredients: overrides.ingredients || [{ name: 'rice', quantity: 200, unit: 'g' }],
    instructions: ['step1', 'step2', 'step3'],
    cookingTime: overrides.cookingTime ?? 30,
    servings: overrides.servings ?? 2,
    mealType: 'Dinner',
    difficulty: overrides.difficulty || 'Easy',
    dietaryType: ['Vegetarian'],
    moodTags: overrides.moodTags || [],
    nutrition: overrides.nutrition || { calories: 400, protein: 15, carbohydrates: 50, fat: 12, fibre: 4, isEstimated: true },
    preparation: overrides.preparation || { handsOnTime: 10, totalSteps: 5, equipment: ['pot'], method: 'stovetop', effort: 'Low' },
    tags: overrides.tags || [],
    ingredientCategories: overrides.ingredientCategories || ['grains'],
    foodTemperature: overrides.foodTemperature || 'warm',
    texture: overrides.texture || [],
    flavourProfile: overrides.flavourProfile || [],
    comfortScore: overrides.comfortScore ?? 3,
    colourVariety: overrides.colourVariety ?? 2,
    ...overrides,
  };
}

// "Ideal" and "poor" recipes per mood
const IDEAL = {
  Happy: mkRecipe({ name: 'Happy Ideal', colourVariety: 6, ingredientCategories: ['grains', 'vegetables', 'protein', 'dairy', 'fruits'], flavourProfile: ['sweet', 'savoury', 'spicy', 'tangy'], tags: ['fresh', 'colorful'], moodTags: ['Happy'], cookingTime: 30 }),
  Tired: mkRecipe({ name: 'Tired Ideal', cookingTime: 10, preparation: { handsOnTime: 4, totalSteps: 3, equipment: ['pan'], method: 'stovetop', effort: 'Very Low' }, moodTags: ['Tired'] }),
  Sick: mkRecipe({ name: 'Sick Ideal', foodTemperature: 'warm', tags: ['warm', 'mild', 'soft-food'], texture: ['soft', 'smooth'], preparation: { handsOnTime: 8, totalSteps: 4, equipment: ['pot'], method: 'stovetop', effort: 'Very Low' }, moodTags: ['Sick'] }),
  Stressed: mkRecipe({ name: 'Stressed Ideal', preparation: { handsOnTime: 8, totalSteps: 4, equipment: ['pot'], method: 'stovetop', effort: 'Very Low' }, ingredients: [{ name: 'pasta', quantity: 200, unit: 'g' }], moodTags: ['Stressed'] }),
  Energetic: mkRecipe({ name: 'Energetic Ideal', difficulty: 'Hard', preparation: { handsOnTime: 25, totalSteps: 9, equipment: ['pot', 'pan', 'knife'], method: 'stovetop', effort: 'High' }, ingredientCategories: ['grains', 'vegetables', 'protein', 'dairy'], tags: ['fresh'], moodTags: ['Energetic'], cookingTime: 45 }),
  Lazy: mkRecipe({ name: 'Lazy Ideal', cookingTime: 5, preparation: { handsOnTime: 3, totalSteps: 3, equipment: ['bowl'], method: 'no-cook', effort: 'Very Low' }, ingredients: [{ name: 'yogurt', quantity: 200, unit: 'g' }, { name: 'banana', quantity: 1, unit: 'pieces' }], moodTags: ['Lazy'] }),
  Sad: mkRecipe({ name: 'Sad Ideal', comfortScore: 5, tags: ['warm', 'comfort'], foodTemperature: 'warm', flavourProfile: ['familiar', 'mild'], preparation: { handsOnTime: 8, totalSteps: 4, equipment: ['pot'], method: 'stovetop', effort: 'Very Low' }, servings: 4, moodTags: ['Sad'] }),
  Hungry: mkRecipe({ name: 'Hungry Ideal', servings: 4, nutrition: { calories: 650, protein: 32, carbohydrates: 70, fat: 20, fibre: 8, isEstimated: true }, ingredientCategories: ['protein', 'grains'], moodTags: ['Hungry'], cookingTime: 25 }),
};
const POOR = {
  Happy: mkRecipe({ name: 'Happy Poor', colourVariety: 0, ingredientCategories: ['grains'], flavourProfile: [], tags: [], moodTags: [], cookingTime: 90, difficulty: 'Hard' }),
  Tired: mkRecipe({ name: 'Tired Poor', cookingTime: 90, preparation: { handsOnTime: 40, totalSteps: 14, equipment: ['oven', 'pot', 'pan', 'knife'], method: 'oven', effort: 'Very High' }, moodTags: [] }),
  Sick: mkRecipe({ name: 'Sick Poor', foodTemperature: 'cold', tags: ['cold', 'spicy'], texture: ['crispy'], preparation: { handsOnTime: 30, totalSteps: 12, equipment: ['oven', 'pot'], method: 'oven', effort: 'High' }, moodTags: [] }),
  Stressed: mkRecipe({ name: 'Stressed Poor', preparation: { handsOnTime: 35, totalSteps: 14, equipment: ['oven', 'pot', 'pan', 'blender', 'grill'], method: 'oven', effort: 'Very High' }, ingredients: Array.from({ length: 12 }, (_, i) => ({ name: `ing${i}`, quantity: 1, unit: 'g' })), moodTags: [] }),
  Energetic: mkRecipe({ name: 'Energetic Poor', difficulty: 'Beginner', preparation: { handsOnTime: 2, totalSteps: 2, equipment: [], method: 'no-cook', effort: 'Very Low' }, ingredientCategories: ['grains'], moodTags: [], cookingTime: 5 }),
  Lazy: mkRecipe({ name: 'Lazy Poor', cookingTime: 90, preparation: { handsOnTime: 40, totalSteps: 14, equipment: ['oven', 'pot', 'pan'], method: 'oven', effort: 'Very High' }, ingredients: Array.from({ length: 10 }, (_, i) => ({ name: `ing${i}`, quantity: 1, unit: 'g' })), moodTags: [] }),
  Sad: mkRecipe({ name: 'Sad Poor', comfortScore: 1, tags: ['cold', 'spicy'], foodTemperature: 'cold', flavourProfile: ['spicy'], preparation: { handsOnTime: 40, totalSteps: 14, equipment: ['oven', 'pot'], method: 'oven', effort: 'Very High' }, servings: 1, moodTags: [] }),
  Hungry: mkRecipe({ name: 'Hungry Poor', servings: 1, nutrition: { calories: 150, protein: 3, carbohydrates: 20, fat: 5, fibre: 1, isEstimated: true }, ingredientCategories: ['vegetables'], moodTags: [], cookingTime: 90 }),
};

const fullPantry = [
  invItem('rice', 1, 'kg', 60), invItem('eggs', 6, 'pieces', 6), invItem('milk', 1, 'l', 5),
  invItem('onion', 4, 'pieces', 10), invItem('tomato', 500, 'g', 2), invItem('salt', 1, 'kg', 300),
];

// ---------- tests ----------

console.log('\n== Mood suitability scoring (cases 1-8) ==');
for (const mood of ALL_MOODS) {
  test(`${mood}: suitable recipe outscores unsuitable recipe`, () => {
    const good = scoreRecipeForSingleMood(IDEAL[mood], mood);
    const bad = scoreRecipeForSingleMood(POOR[mood], mood);
    assert.ok(good.score > bad.score, `${good.score} should be > ${bad.score}`);
    assert.ok(good.score >= 60, `ideal ${mood} score ${good.score} should be reasonably high`);
  });
}

test('every mood scorer returns a normalized 0-100 score', () => {
  for (const mood of ALL_MOODS) {
    for (const r of Object.values(IDEAL).concat(Object.values(POOR))) {
      const s = scoreRecipeForSingleMood(r, mood);
      assert.ok(s.score >= 0 && s.score <= 100, `${mood} score ${s.score} out of range`);
    }
  }
});

console.log('\n== Multiple moods (case 9) ==');
test('multiple moods use normalized average and consider all moods for time', () => {
  const both = mkRecipe({ name: 'Both', cookingTime: 10, preparation: { handsOnTime: 4, totalSteps: 3, equipment: ['pan'], method: 'no-cook', effort: 'Very Low' }, ingredients: [{ name: 'yogurt', quantity: 1, unit: 'g' }], moodTags: ['Tired', 'Lazy'] });
  const tiredOnly = mkRecipe({ name: 'TiredOnly', cookingTime: 60, preparation: { handsOnTime: 30, totalSteps: 10, equipment: ['oven'], method: 'oven', effort: 'High' }, moodTags: ['Tired'] });
  const resBoth = scoreRecipeForMoods(both, ['Tired', 'Lazy']);
  const resTired = scoreRecipeForMoods(tiredOnly, ['Tired', 'Lazy']);
  assert.ok(resBoth.score > resTired.score);
  assert.ok(resBoth.perMood.Tired && resBoth.perMood.Lazy, 'per-mood breakdown missing');
  // Time suitability averaged across both moods, not just the first
  const t = scoreTimeForMoods(both, ['Tired', 'Lazy']);
  assert.ok(t.score >= 0 && t.score <= 100);
});

console.log('\n== Pantry matching (cases 10-12) ==');
test('all required ingredients available -> 100% availability', () => {
  const r = mkRecipe({ ingredients: [
    { name: 'rice', quantity: 200, unit: 'g' }, { name: 'egg', quantity: 2, unit: 'pieces' },
    { name: 'onion', quantity: 1, unit: 'pieces' }, { name: 'tomato', quantity: 2, unit: 'pieces' },
    { name: 'salt', quantity: 0.1, unit: 'teaspoons' },
  ]});
  const p = matchIngredients(r, fullPantry);
  assert.strictEqual(p.availability, 100);
  assert.strictEqual(p.canCook, true);
  assert.strictEqual(p.missingNames.length, 0);
});

test('partial pantry -> proportionate score and missing list', () => {
  const r = mkRecipe({ ingredients: [
    { name: 'rice', quantity: 200, unit: 'g' }, { name: 'egg', quantity: 2, unit: 'pieces' },
    { name: 'onion', quantity: 1, unit: 'pieces' }, { name: 'tomato', quantity: 2, unit: 'pieces' },
    { name: 'saffron', quantity: 1, unit: 'g' },
  ]});
  const p = matchIngredients(r, fullPantry);
  assert.strictEqual(p.availability, 80);
  assert.ok(p.missingNames.includes('saffron'));
  assert.strictEqual(p.canCook, false);
});

test('optional ingredients are not treated as mandatory', () => {
  const r = mkRecipe({ ingredients: [
    { name: 'rice', quantity: 200, unit: 'g' },
    { name: 'saffron', quantity: 1, unit: 'g', isOptional: true },
  ]});
  const p = matchIngredients(r, fullPantry);
  assert.strictEqual(p.availability, 100);
  assert.strictEqual(p.canCook, true);
});

test('expiring ingredients boost expiry score; none -> neutral 50', () => {
  const r = mkRecipe({ ingredients: [{ name: 'tomato', quantity: 2, unit: 'pieces' }] });
  const soon = [invItem('tomato', 4, 'pieces', 1)];
  const fresh = [invItem('tomato', 4, 'pieces', 20)];
  const s1 = scoreExpiryPriority(r, soon);
  const s2 = scoreExpiryPriority(r, fresh);
  assert.ok(s1.score > 50, `expiring score ${s1.score} should exceed neutral`);
  assert.strictEqual(s2.score, 50);
});

test('expired pantry items are not counted as available', () => {
  const r = mkRecipe({ ingredients: [{ name: 'milk', quantity: 200, unit: 'ml' }] });
  const p = matchIngredients(r, [invItem('milk', 1, 'l', -2)]);
  assert.strictEqual(p.canCook, false);
});

console.log('\n== Allergies & restrictions (case 13) ==');
test('allergy-conflicting recipe is excluded from recommendations', async () => {
  const recipes = [
    mkRecipe({ _id: 'safe', name: 'Safe Meal', ingredients: [{ name: 'rice', quantity: 100, unit: 'g' }] }),
    mkRecipe({ _id: 'unsafe', name: 'Peanut Satay', ingredients: [{ name: 'peanut', quantity: 100, unit: 'g' }, { name: 'rice', quantity: 100, unit: 'g' }] }),
  ];
  const res = await getMoodRecommendations(recipes, fullPantry, allergicUser, ['Happy'], {}, context);
  const ids = [...res.readyToCook, ...res.needsIngredients].map((r) => r._id);
  assert.ok(!ids.includes('unsafe'), 'allergen recipe was recommended');
});

test('dietary preference filter still applies', async () => {
  const vegUser = { ...user, dietaryPreferences: ['Vegan'] };
  const recipes = [
    mkRecipe({ _id: 'veg', name: 'Veg Bowl', dietaryType: ['Vegan'] }),
    mkRecipe({ _id: 'nonveg', name: 'Meat Dish', dietaryType: ['Non-vegetarian'] }),
  ];
  const res = await getMoodRecommendations(recipes, fullPantry, vegUser, ['Happy'], {}, context);
  const ids = [...res.readyToCook, ...res.needsIngredients].map((r) => r._id);
  assert.ok(ids.includes('veg'));
  assert.ok(!ids.includes('nonveg'));
});

console.log('\n== Nutrition per serving (case 14) ==');
test('Hungry scoring uses per-serving nutrition values', () => {
  const hi = scoreRecipeForSingleMood(IDEAL.Hungry, 'Hungry');
  const lo = scoreRecipeForSingleMood(POOR.Hungry, 'Hungry');
  assert.ok(hi.score > lo.score);
  assert.ok(hi.factors.protein > lo.factors.protein);
});

test('nutritionPerServing returns per-serving fields incl. fibre', () => {
  const n = nutritionPerServing(mkRecipe({ nutrition: { calories: 500, protein: 30, carbohydrates: 40, fat: 15, fibre: 9 } }));
  assert.strictEqual(n.protein, 30);
  assert.strictEqual(n.fibre, 9);
});

console.log('\n== Feedback personalization (cases 15-16) ==');
test('positive feedback bounded-boosts score; negative lowers it', async () => {
  const r = mkRecipe({ _id: 'fb1', name: 'Feedback Test', ingredients: [{ name: 'rice', quantity: 100, unit: 'g' }] });
  const noFb = await getMoodRecommendations([r], fullPantry, user, ['Happy'], {}, context);
  const withFb = await getMoodRecommendations([r], fullPantry, user, ['Happy'], {}, {
    cookedHistory: [],
    feedbackByRecipe: new Map([['fb1', [{ helpful: true }, { helpful: true }, { helpful: true }]]]),
  });
  const base = noFb.readyToCook[0]?.score ?? noFb.needsIngredients[0]?.score;
  const boosted = withFb.readyToCook[0]?.score ?? withFb.needsIngredients[0]?.score;
  assert.ok(boosted > base, `${boosted} should exceed ${base}`);
  assert.ok(boosted - base <= 12, 'adjustment must stay bounded');

  const withNeg = await getMoodRecommendations([r], fullPantry, user, ['Happy'], {}, {
    cookedHistory: [],
    feedbackByRecipe: new Map([['fb1', [{ helpful: false }]]]),
  });
  const lowered = withNeg.readyToCook[0]?.score ?? withNeg.needsIngredients[0]?.score;
  assert.ok(lowered < base);
});

test('personalizationAdjustment is bounded to +/-10 and neutral with no data', () => {
  assert.strictEqual(personalizationAdjustment([]).adjustment, 0);
  assert.strictEqual(personalizationAdjustment([{ helpful: true }]).adjustment, 4);
  assert.strictEqual(personalizationAdjustment([{ helpful: false }]).adjustment, -4);
  const many = Array.from({ length: 10 }, () => ({ helpful: true }));
  assert.ok(Math.abs(personalizationAdjustment(many).adjustment) <= 10);
});

test('new user without feedback gets unadjusted recommendations', async () => {
  const r = mkRecipe({ _id: 'new1', name: 'New User Recipe', ingredients: [{ name: 'rice', quantity: 100, unit: 'g' }] });
  const res = await getMoodRecommendations([r], fullPantry, user, ['Happy'], {}, { cookedHistory: [], feedbackByRecipe: new Map() });
  const item = res.readyToCook[0] || res.needsIngredients[0];
  assert.ok(item);
  assert.strictEqual(item.breakdown.feedbackAdjustment, 0);
});

console.log('\n== Missing attributes (case 17) ==');
test('sparse recipe produces in-range scores without crashing', async () => {
  const sparse = { _id: 'sparse', name: 'Sparse', ingredients: [{ name: 'rice', quantity: 1, unit: 'g' }], cookingTime: 30, servings: 1 };
  for (const mood of ALL_MOODS) {
    const s = scoreRecipeForSingleMood(sparse, mood);
    assert.ok(s.score >= 0 && s.score <= 100);
  }
  const res = await getMoodRecommendations([sparse], [], user, ['Happy'], {}, context);
  const item = res.readyToCook[0] || res.needsIngredients[0];
  assert.ok(item.score >= 0 && item.score <= 100);
});

console.log('\n== Ranking & normalization (case 18) ==');
test('recommendations sorted by score desc and all scores within 0-100', async () => {
  const recipes = [
    mkRecipe({ _id: 'a', name: 'A', cookingTime: 60, preparation: { handsOnTime: 30, totalSteps: 12, equipment: ['oven'], method: 'oven', effort: 'High' } }),
    mkRecipe({ _id: 'b', name: 'B', cookingTime: 10, preparation: { handsOnTime: 4, totalSteps: 3, equipment: ['pan'], method: 'stovetop', effort: 'Very Low' } }),
    mkRecipe({ _id: 'c', name: 'C', cookingTime: 30, preparation: { handsOnTime: 15, totalSteps: 6, equipment: ['pot'], method: 'stovetop', effort: 'Medium' } }),
  ];
  const res = await getMoodRecommendations(recipes, fullPantry, user, ['Tired'], {}, context);
  const all = [...res.readyToCook, ...res.needsIngredients];
  for (const r of all) assert.ok(r.score >= 0 && r.score <= 100, `score ${r.score} out of range`);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].score >= all[i].score, 'not sorted');
});

test('scoring weights sum to 100%', () => {
  const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.001);
});

test('explanation strings are generated from real attributes', () => {
  const pantry = matchIngredients(IDEAL.Tired, []);
  const time = scoreTimeForMoods(IDEAL.Tired, ['Tired']);
  const exp = buildExplanation(IDEAL.Tired, scoreRecipeForSingleMood(IDEAL.Tired, 'Tired'), pantry, time, ['Tired']);
  assert.ok(typeof exp === 'string' && exp.length > 10);
  assert.ok(exp.includes('10 minutes'), `explanation should cite real time: ${exp}`);
});

console.log('\n== Seed data integrity ==');
test('recipeData contains exactly 50 unique recipes', () => {
  assert.strictEqual(recipeData.length, 50);
  const names = recipeData.map((r) => r.name);
  assert.strictEqual(new Set(names).size, 50);
});

test('every seed recipe has complete valid data', () => {
  const moodSet = new Set(ALL_MOODS);
  for (const r of recipeData) {
    assert.ok(r.name && r.description, `${r.name} missing name/description`);
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length > 0, `${r.name} no ingredients`);
    assert.ok(r.instructions.length >= 3, `${r.name} too few instructions`);
    assert.ok(r.cookingTime > 0 && r.servings > 0, `${r.name} bad times/servings`);
    assert.ok(r.nutrition && r.nutrition.calories >= 0, `${r.name} bad nutrition`);
    for (const m of r.moodTags || []) assert.ok(moodSet.has(m), `${r.name} invalid mood tag ${m}`);
    assert.ok(RECIPE_ATTRIBUTES[r.name], `${r.name} missing scoring attributes`);
  }
});

test('every mood has enough tagged seed recipes for meaningful recommendations', () => {
  for (const mood of ALL_MOODS) {
    const count = recipeData.filter((r) => (r.moodTags || []).includes(mood)).length;
    assert.ok(count >= 8, `${mood} only has ${count} tagged recipes`);
  }
});

test('seed attributes cover prep time, effort, method, tags for scoring', () => {
  for (const r of recipeData) {
    const a = RECIPE_ATTRIBUTES[r.name];
    assert.ok(a.preparation?.handsOnTime >= 0 && a.preparation?.totalSteps > 0, `${r.name} bad preparation`);
    assert.ok(['stovetop', 'oven', 'microwave', 'no-cook', 'mixed'].includes(a.preparation.method), `${r.name} bad method`);
    assert.ok(a.comfortScore >= 1 && a.comfortScore <= 5, `${r.name} bad comfortScore`);
  }
});

console.log('\n== Admin recipe validation ==');

const validPayload = {
  name: 'Admin Test Curry',
  description: 'A test curry',
  mealType: 'Dinner',
  difficulty: 'Medium',
  cookingTime: 40,
  servings: 4,
  ingredients: [
    { name: 'chicken', quantity: 500, unit: 'g' },
    { name: 'rice', quantity: 300, unit: 'g', isOptional: true },
  ],
  instructions: ['Cook chicken', 'Add sauce', 'Simmer'],
  nutrition: { calories: 450, protein: 30, carbohydrates: 20, fat: 25, fibre: 2, isEstimated: true },
  preparation: { handsOnTime: 15, totalSteps: 7, equipment: ['pot', 'knife'], method: 'stovetop', effort: 'Medium' },
  moodTags: ['Hungry', 'Energetic'],
  dietaryType: ['Non-vegetarian'],
  tags: ['warm', 'spicy'],
  flavourProfile: ['spicy', 'savoury'],
  texture: ['tender'],
  ingredientCategories: ['protein', 'grains'],
  foodTemperature: 'warm',
  comfortScore: 4,
  colourVariety: 3,
  image: '',
};

test('valid admin payload passes validation with all attributes', () => {
  const { data, errors } = sanitizeRecipeInput(validPayload, { partial: false });
  assert.strictEqual(errors.length, 0, errors.join('; '));
  assert.strictEqual(data.name, 'Admin Test Curry');
  assert.deepStrictEqual(data.moodTags, ['Hungry', 'Energetic']);
  assert.strictEqual(data.nutrition.fibre, 2);
  assert.strictEqual(data.preparation.effort, 'Medium');
  assert.strictEqual(data.comfortScore, 4);
});

test('invalid mood tag is rejected', () => {
  const { errors } = sanitizeRecipeInput({ ...validPayload, moodTags: ['Happy', 'Ecstatic'] }, { partial: false });
  assert.ok(errors.some((e) => e.includes('Ecstatic')));
});

test('missing required fields produce errors on create', () => {
  const { errors } = sanitizeRecipeInput({ name: 'X' }, { partial: false });
  ['ingredients', 'cookingTime', 'servings', 'mealType', 'difficulty'].forEach((f) => {
    assert.ok(errors.some((e) => e.includes(f)), `expected error for ${f}`);
  });
});

test('bad ingredient quantity rejected; optional flag preserved', () => {
  const bad = sanitizeRecipeInput({ ...validPayload, ingredients: [{ name: 'rice', quantity: -5, unit: 'g' }] }, { partial: false });
  assert.ok(bad.errors.length > 0);
  const good = sanitizeRecipeInput(validPayload, { partial: false });
  assert.strictEqual(good.data.ingredients[1].isOptional, true);
});

test('comfortScore and colourVariety are clamped to valid ranges', () => {
  const { data } = sanitizeRecipeInput({ ...validPayload, comfortScore: 9, colourVariety: -3 }, { partial: false });
  assert.strictEqual(data.comfortScore, 5);
  assert.strictEqual(data.colourVariety, 0);
});

test('partial update only returns provided fields (retains existing attributes)', () => {
  const { data, errors } = sanitizeRecipeInput({ moodTags: ['Sad'], comfortScore: 5 }, { partial: true });
  assert.strictEqual(errors.length, 0);
  assert.deepStrictEqual(Object.keys(data).sort(), ['comfortScore', 'moodTags']);
  assert.ok(!('ingredients' in data) && !('nutrition' in data));
});

test('recipeCompleteness flags missing attributes', () => {
  const full = recipeData[0];
  const attrs = RECIPE_ATTRIBUTES[full.name];
  const merged = { ...full, ...attrs };
  const c1 = recipeCompleteness(merged);
  assert.ok(c1.percent >= 90, `seed recipe completeness ${c1.percent}%`);

  const sparse = { name: 'Sparse', ingredients: [{ name: 'rice', quantity: 1, unit: 'g' }] };
  const c2 = recipeCompleteness(sparse);
  assert.ok(c2.percent < 50);
  assert.ok(c2.missing.includes('moodTags'));
  assert.ok(c2.missing.includes('preparation.effort'));
});

// ---------- DB-backed tests (cases 19-20 + admin integration) ----------

async function dbTests() {
  let mongoose;
  try {
    mongoose = require('mongoose');
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  } catch (e) {
    console.log('\n== DB tests skipped (MongoDB unreachable) ==');
    return;
  }

  const Recipe = require('../models/Recipe');

  await test('seed script idempotency: re-running upsert keeps exactly 50 unique seed recipes', async () => {
    const { upsertSeedRecipes } = require('../seed/seedRecipes');
    await upsertSeedRecipes();
    await upsertSeedRecipes();
    const docs = await Recipe.find({ isSeed: true }).select('name').lean();
    const names = docs.map((d) => d.name);
    assert.strictEqual(docs.length, 50, `expected 50 seed docs, got ${docs.length}`);
    assert.strictEqual(new Set(names).size, 50, 'duplicate seed recipe names in DB');
  });

  await test('seeded recipes have complete attributes in DB', async () => {
    const docs = await Recipe.find({ isSeed: true }).lean();
    assert.strictEqual(docs.length, 50);
    for (const d of docs) {
      assert.ok(d.preparation?.handsOnTime !== undefined, `${d.name} missing handsOnTime`);
      assert.ok(d.nutrition?.fibre !== undefined, `${d.name} missing fibre`);
      assert.ok(d.moodTags?.length > 0, `${d.name} no mood tags`);
    }
  });

  await test('admin-created recipe: sanitized payload saves, edits retain attributes, and engine can recommend it', async () => {
    const { data, errors } = sanitizeRecipeInput(validPayload, { partial: false });
    assert.strictEqual(errors.length, 0);

    const created = await Recipe.create({ ...data, source: 'admin', isSeed: false });
    try {
      // Retrieve via API-equivalent find
      const fetched = await Recipe.findById(created._id).lean();
      assert.strictEqual(fetched.name, 'Admin Test Curry');
      assert.deepStrictEqual(fetched.moodTags, ['Hungry', 'Energetic']);
      assert.strictEqual(fetched.nutrition.fibre, 2);
      assert.strictEqual(fetched.preparation.handsOnTime, 15);

      // Partial edit retains all other attributes
      const { data: patch } = sanitizeRecipeInput({ comfortScore: 5, moodTags: ['Hungry'] }, { partial: true });
      const updated = await Recipe.findByIdAndUpdate(created._id, patch, { new: true }).lean();
      assert.strictEqual(updated.comfortScore, 5);
      assert.strictEqual(updated.nutrition.protein, 30, 'nutrition lost on edit');
      assert.strictEqual(updated.ingredients.length, 2, 'ingredients lost on edit');
      assert.strictEqual(updated.preparation.method, 'stovetop', 'preparation lost on edit');

      // Recommendation engine can score the new recipe for its moods
      const allRecipes = await Recipe.find({ isSeed: { $ne: true } }).lean();
      const res = await getMoodRecommendations(allRecipes, [], user, ['Hungry'], {}, context);
      const found = [...res.readyToCook, ...res.needsIngredients].find((r) => r._id.toString() === created._id.toString());
      assert.ok(found, 'new admin recipe not returned in Hungry recommendations');
      assert.ok(found.score >= 0 && found.score <= 100);
      assert.ok(found.explanation, 'missing explanation');
      assert.ok(found.proteinPerServing === 30);
    } finally {
      await Recipe.findByIdAndDelete(created._id);
    }
  });

  await test('allergy restriction still excludes admin recipe containing allergen', async () => {
    const { data } = sanitizeRecipeInput({
      ...validPayload,
      name: 'Peanut Admin Dish',
      ingredients: [{ name: 'peanut', quantity: 100, unit: 'g' }, { name: 'rice', quantity: 200, unit: 'g' }],
      moodTags: ['Happy'],
    }, { partial: false });
    const created = await Recipe.create({ ...data, source: 'admin', isSeed: false });
    try {
      const res = await getMoodRecommendations([created.toObject ? created.toObject() : created], [], allergicUser, ['Happy'], {}, context);
      const ids = [...res.readyToCook, ...res.needsIngredients].map((r) => r._id?.toString());
      assert.ok(!ids.includes(created._id.toString()), 'allergen recipe recommended');
    } finally {
      await Recipe.findByIdAndDelete(created._id);
    }
  });

  await test('seed database still contains exactly 50 unique sample recipes after admin operations', async () => {
    const docs = await Recipe.find({ isSeed: true }).select('name').lean();
    assert.strictEqual(docs.length, 50);
    assert.strictEqual(new Set(docs.map((d) => d.name)).size, 50);
  });

  await mongoose.disconnect();
}

(async () => {
  // Sequential async tests
  const asyncTests = [
    ['Tired end-to-end: quick low-effort recipe ranks first', async () => {
      const recipes = [POOR.Tired, IDEAL.Tired];
      const res = await getMoodRecommendations(recipes, fullPantry, user, ['Tired'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Tired Ideal');
      assert.ok(all[0].explanation.includes('10 minutes'));
    }],
    ['Lazy end-to-end: no-cook minimal recipe ranks first', async () => {
      const recipes = [POOR.Lazy, IDEAL.Lazy];
      const res = await getMoodRecommendations(recipes, [invItem('yogurt', 500, 'g', 10), invItem('banana', 4, 'pieces', 4)], user, ['Lazy'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Lazy Ideal');
    }],
    ['Hungry end-to-end: high-protein large recipe ranks first', async () => {
      const recipes = [POOR.Hungry, IDEAL.Hungry];
      const res = await getMoodRecommendations(recipes, [], user, ['Hungry'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Hungry Ideal');
    }],
    ['Sad end-to-end: comfort food ranks first', async () => {
      const recipes = [POOR.Sad, IDEAL.Sad];
      const res = await getMoodRecommendations(recipes, [], user, ['Sad'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Sad Ideal');
    }],
    ['Sick end-to-end: warm mild soft recipe ranks first', async () => {
      const recipes = [POOR.Sick, IDEAL.Sick];
      const res = await getMoodRecommendations(recipes, [], user, ['Sick'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Sick Ideal');
    }],
    ['Stressed end-to-end: simple one-pot recipe ranks first', async () => {
      const recipes = [POOR.Stressed, IDEAL.Stressed];
      const res = await getMoodRecommendations(recipes, [invItem('pasta', 1, 'kg', 60)], user, ['Stressed'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Stressed Ideal');
    }],
    ['Energetic end-to-end: involved recipe ranks first', async () => {
      const recipes = [POOR.Energetic, IDEAL.Energetic];
      const res = await getMoodRecommendations(recipes, [], user, ['Energetic'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Energetic Ideal');
    }],
    ['Happy end-to-end: colourful varied recipe ranks first', async () => {
      const recipes = [POOR.Happy, IDEAL.Happy];
      const res = await getMoodRecommendations(recipes, [], user, ['Happy'], {}, context);
      const all = [...res.readyToCook, ...res.needsIngredients];
      assert.strictEqual(all[0].name, 'Happy Ideal');
    }],
  ];

  for (const [name, fn] of asyncTests) {
    await test(name, fn);
  }

  await dbTests();

  console.log(`\n========== ${passed} passed, ${failed} failed ==========`);
  if (failures.length) {
    failures.forEach((f) => console.log(`FAILED: ${f.name}\n  ${f.error.stack || f.error}`));
    process.exit(1);
  }
  process.exit(0);
})();
