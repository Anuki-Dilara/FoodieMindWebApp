// LIVE integration test — calls the real local Ollama qwen3.5:2b model.
// Requires Ollama running at OLLAMA_BASE_URL with OLLAMA_MODEL pulled.
// Run manually: node test/aiPantryExplorer.live.test.js
// NOT part of `npm test` (depends on local hardware/service).

require('dotenv').config();
process.env.AI_PANTRY_EXPLORER_ENABLED = 'true';
process.env.AI_MAX_GENERATION_ATTEMPTS = '2';

const assert = require('assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { generatePantryRecipes } = require('../services/pantryExplorerService');
const { resetProvider } = require('../services/aiProvider');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');
const { getExpiryStatus } = require('../utils/expiryHelper');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');

const FUTURE = new Date(Date.now() + 10 * 86400000);
const TEST_EMAIL = 'ai-live-test@example.com';

async function main() {
  console.log('== AI Pantry Explorer LIVE test (real Ollama) ==');
  console.log(`Provider: ollama | Model: ${process.env.OLLAMA_MODEL || 'qwen3.5:2b'} | URL: ${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}`);

  resetProvider(); // ensure the real OllamaProvider is used

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 8000 });
  await FoodItem.init(); await User.init();

  // Idempotent fixture: the spec's example pantry.
  const stale = await User.findOne({ email: TEST_EMAIL });
  if (stale) {
    await FoodItem.deleteMany({ userId: stale._id });
    await User.deleteOne({ _id: stale._id });
  }
  const user = await User.create({
    fullName: 'AI Live Test', email: TEST_EMAIL,
    passwordHash: await bcrypt.hash('TestPass123!', 10), role: 'user',
  });

  const pantry = [
    ['Rice', 500, 'g'], ['Eggs', 5, 'pieces'], ['Tomatoes', 4, 'pieces'],
    ['Onions', 3, 'pieces'], ['Carrots', 2, 'pieces'], ['Green chillies', 5, 'pieces'],
  ];
  for (const [name, quantity, unit] of pantry) {
    await FoodItem.create({
      userId: user._id, name, category: 'Other',
      quantity, unit, baseQuantity: quantity, baseUnit: unit,
      purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
    });
  }

  try {
    console.log('\nPantry:', pantry.map(([n, q, u]) => `${n} ${q}${u}`).join(', '));
    console.log('Mood: Hungry | Time: 30 min | Servings: 2\n');

    const started = Date.now();
    const out = await generatePantryRecipes({
      userId: user._id,
      moods: ['Hungry'],
      filters: { timeAvailable: '30 minutes', selectedServings: 2 },
      FoodItem, User,
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`Approved ingredients sent to model: ${out.approvedCount}`);
    console.log(`Generation+validation time: ${secs}s`);
    console.log(`Validated recipes: ${out.recipes.length}`);
    if (out.rejections.length) {
      console.log(`Rejections (${out.rejections.length}):`);
      out.rejections.slice(0, 6).forEach((r) => console.log(`  - ${r}`));
    }

    assert.ok(out.recipes.length >= 1, 'live model should produce at least one pantry-valid recipe');

    const inventory = await FoodItem.find({ userId: user._id }).lean();
    for (const r of out.recipes) {
      console.log(`\n• ${r.name} (${r.totalTime} min, serves ${r.servings}, ${r.difficulty})`);
      console.log(`  ${r.description}`);
      console.log(`  Ingredients: ${r.ingredients.map((i) => `${i.quantity}${i.unit} ${i.name}${i.staple ? ' (staple)' : ''}`).join(', ')}`);
      // Independent re-verification through the real matcher.
      const check = matchIngredientRequirements(
        { name: r.name, ingredients: r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, size: i.size, form: i.form })) },
        inventory.filter((i) => getExpiryStatus(i.expiryDate).status !== 'Expired')
      );
      assert.strictEqual(check.canCook, true, `${r.name} must be pantry-complete`);
      assert.ok(!check.missingNames.includes('Water'), 'water must never be missing');
      console.log(`  Matcher re-check: canCook=true, missing=[${check.missingNames.join(', ') || 'none'}]`);
      console.log(`  Nutrition (est.): ${r.nutrition.calories} kcal, ${r.nutrition.protein}g protein`);
      console.log(`  Why: ${r.explanation}`);
    }

    console.log('\nLIVE TEST PASSED');
  } finally {
    await FoodItem.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }
}

main().catch((e) => { console.error('LIVE TEST FAILED:', e.message); process.exit(1); });
