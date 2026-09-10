// Migration script to load ingredient substitutions
const IngredientSubstitution = require('../models/IngredientSubstitution');
const connectDB = require('../config/db');
const substitutions = require('./substitutionData');

async function loadSubstitutions() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    let loaded = 0;
    let updated = 0;

    for (const sub of substitutions) {
      const existing = await IngredientSubstitution.findOne({
        originalIngredient: sub.originalIngredient,
        substituteIngredient: sub.substituteIngredient,
      });

      if (existing) {
        await IngredientSubstitution.findByIdAndUpdate(existing._id, sub, { new: true });
        console.log(`✓ Updated: ${sub.originalIngredient} → ${sub.substituteIngredient}`);
        updated++;
      } else {
        await IngredientSubstitution.create(sub);
        console.log(`✓ Loaded: ${sub.originalIngredient} → ${sub.substituteIngredient}`);
        loaded++;
      }
    }

    console.log('\n=== Substitution Load Complete ===');
    console.log(`Loaded: ${loaded} new substitutions`);
    console.log(`Updated: ${updated} existing substitutions`);
    console.log(`Total: ${loaded + updated} substitutions in database`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

loadSubstitutions();
