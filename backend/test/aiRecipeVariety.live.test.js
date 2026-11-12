// LIVE variety test — real Ollama qwen3.5:2b, two consecutive generations for
// the same user/pantry must produce meaningfully different recipes.
// Run manually: node test/aiRecipeVariety.live.test.js

require('dotenv').config();
process.env.AI_PANTRY_EXPLORER_ENABLED = 'true';
process.env.AI_MAX_GENERATION_ATTEMPTS = '2';

const assert = require('assert');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { generatePantryRecipes } = require('../services/pantryExplorerService');
const { resetProvider } = require('../services/aiProvider');
const { AIRecipeGeneration } = require('../models/AIRecipeGeneration');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');

const FUTURE = new Date(Date.now() + 10 * 86400000);
const TEST_EMAIL = 'ai-variety-live@example.com';

async function main() {
  console.log('== AI Recipe Variety LIVE test (real Ollama) ==');
  console.log(`Model: ${process.env.OLLAMA_MODEL || 'qwen3.5:2b'} @ ${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}`);
  resetProvider();

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 8000 });
  await FoodItem.init(); await User.init(); await AIRecipeGeneration.init();

  const stale = await User.findOne({ email: TEST_EMAIL });
  if (stale) {
    await FoodItem.deleteMany({ userId: stale._id });
    await AIRecipeGeneration.deleteMany({ userId: stale._id });
    await User.deleteOne({ _id: stale._id });
  }
  const user = await User.create({
    fullName: 'AI Variety Live', email: TEST_EMAIL,
    passwordHash: await bcrypt.hash('TestPass123!', 10), role: 'user',
  });

  const pantry = [
    ['Rice', 500, 'g'], ['Eggs', 5, 'pieces'], ['Tomatoes', 4, 'pieces'],
    ['Onions', 3, 'pieces'], ['Carrots', 2, 'pieces'], ['Green chillies', 5, 'pieces'],
    ['Potatoes', 4, 'pieces'], ['Coconut', 1, 'whole'],
  ];
  for (const [name, quantity, unit] of pantry) {
    await FoodItem.create({
      userId: user._id, name, category: 'Other',
      quantity, unit, baseQuantity: quantity, baseUnit: unit,
      purchaseDate: new Date(), expiryDate: FUTURE, status: 'Fresh',
    });
  }

  const filters = { timeAvailable: '30 minutes', selectedServings: 2 };
  const batches = [];
  try {
    for (let round = 1; round <= 2; round++) {
      console.log(`\n--- Generation round ${round} (mood: Hungry) ---`);
      const started = Date.now();
      const out = await generatePantryRecipes({
        userId: user._id, moods: ['Hungry'], filters, FoodItem, User,
      });
      console.log(`  ${((Date.now() - started) / 1000).toFixed(0)}s | recipes: ${out.recipes.length} | exhausted: ${out.exhausted}`);
      out.recipes.forEach((r) => {
        console.log(`  • ${r.name} [${r.method}/${r.mealType}] fp=${r.fingerprint} similar=${r.similarToPrevious} tags=${(r.varietyTags || []).join(',')}`);
        console.log(`    ings: ${r.ingredients.map((i) => i.name).join(', ')}`);
      });
      if (out.rejections.length) console.log(`  rejections: ${out.rejections.length}`);
      batches.push(out.recipes);
    }

    const fp1 = new Set(batches[0].map((r) => r.fingerprint));
    const freshInRound2 = batches[1].filter((r) => !fp1.has(r.fingerprint));
    console.log(`\nRound-2 recipes with new fingerprints: ${freshInRound2.length}/${batches[1].length}`);

    assert.ok(batches[0].length >= 1, 'round 1 should produce recipes');
    assert.ok(
      batches[1].length === 0 || freshInRound2.length >= 1 || batches[1].every((r) => r.similarToPrevious),
      'round 2 must differ from round 1 or honestly report similarity'
    );
    if (batches[1].length && !batches[1].every((r) => r.similarToPrevious)) {
      assert.ok(freshInRound2.length >= 1, 'round 2 should contain at least one new recipe');
    }

    const histCount = await AIRecipeGeneration.countDocuments({ userId: user._id });
    console.log(`History entries recorded: ${histCount}`);
    assert.ok(histCount >= batches[0].length + batches[1].length, 'every returned recipe must be fingerprinted');

    console.log('\nVARIETY LIVE TEST PASSED');
  } finally {
    await FoodItem.deleteMany({ userId: user._id });
    await AIRecipeGeneration.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }
}

main().catch((e) => { console.error('LIVE TEST FAILED:', e.message); process.exit(1); });
