const mongoose = require('mongoose');
const IngredientSubstitution = require('../models/IngredientSubstitution');

// Approved ingredient substitutions. Only genuine, well-known cooking
// substitutions are seeded — substitutes are never treated as exact matches.
const SEED_SUBSTITUTIONS = [
  {
    originalIngredient: 'sesame oil',
    substituteIngredient: 'cooking oil',
    quantityRatio: 1,
    suitableRecipeTypes: ['cooking', 'stir-fry', 'sauté'],
    unsuitableRecipeTypes: ['no-cook', 'salad', 'dressing'],
    instructionAdjustment: 'Neutral oil works for frying, but the sesame flavour will be absent.',
    dietaryNotes: 'Adds no sesame flavour; suitable for most diets.',
  },
  {
    originalIngredient: 'olive oil',
    substituteIngredient: 'cooking oil',
    quantityRatio: 1,
    suitableRecipeTypes: ['cooking', 'stir-fry', 'sauté'],
    unsuitableRecipeTypes: ['no-cook', 'salad', 'dressing'],
    instructionAdjustment: 'Neutral oil has a milder flavour than olive oil.',
    dietaryNotes: 'Mild flavour difference only.',
  },
  {
    originalIngredient: 'cream',
    substituteIngredient: 'milk',
    quantityRatio: 0.9,
    suitableRecipeTypes: ['cooking', 'sauce'],
    unsuitableRecipeTypes: ['baking', 'dessert'],
    instructionAdjustment: 'Sauces may be slightly thinner; simmer a little longer to thicken.',
    dietaryNotes: 'Lower fat than cream.',
  },
  {
    originalIngredient: 'butter',
    substituteIngredient: 'cooking oil',
    quantityRatio: 0.8,
    suitableRecipeTypes: ['cooking', 'stir-fry', 'sauté'],
    unsuitableRecipeTypes: ['baking', 'pastry', 'spread'],
    instructionAdjustment: 'Oil cannot replace butter in baking or as a spread.',
    dietaryNotes: 'Different texture and flavour in baked goods.',
  },
  {
    originalIngredient: 'spring onion',
    substituteIngredient: 'onion',
    quantityRatio: 1,
    suitableRecipeTypes: ['cooking'],
    unsuitableRecipeTypes: ['garnish', 'salad'],
    instructionAdjustment: 'Regular onion has a stronger flavour; use a little less if possible.',
    dietaryNotes: 'Milder fresh-onion flavour lost.',
  },
];

async function upsertSeedSubstitutions() {
  let created = 0;
  let updated = 0;
  for (const sub of SEED_SUBSTITUTIONS) {
    const filter = { originalIngredient: sub.originalIngredient, substituteIngredient: sub.substituteIngredient };
    const existing = await IngredientSubstitution.findOne(filter);
    if (existing) {
      Object.assign(existing, sub, { isActive: true });
      await existing.save();
      updated++;
    } else {
      await IngredientSubstitution.create({ ...sub, isActive: true });
      created++;
    }
  }
  return { created, updated, total: await IngredientSubstitution.countDocuments({ isActive: true }) };
}

if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      const result = await upsertSeedSubstitutions();
      console.log('Substitutions seeded:', result);
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Substitution seeding failed:', err.message);
      process.exit(1);
    });
}

module.exports = { upsertSeedSubstitutions, SEED_SUBSTITUTIONS };
