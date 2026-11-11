// Backwards-compatible entry point: delegates to the idempotent recipe seeder.
// Run with: npm run update-recipes  (or  npm run seed:recipes)
require('dotenv').config();
const { seedRecipes } = require('./seedRecipes');

seedRecipes().catch((err) => {
  console.error('Recipe update failed:', err);
  process.exit(1);
});
