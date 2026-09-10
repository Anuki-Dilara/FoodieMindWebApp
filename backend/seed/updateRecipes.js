require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Recipe = require('../models/Recipe');
const completeRecipes = require('./recipeData');

async function updateRecipes() {
  await connectDB();

  console.log('Starting recipe update...');
  console.log(`Processing ${completeRecipes.length} recipes...`);

  let updated = 0;
  let created = 0;
  let unchanged = 0;

  for (const recipeData of completeRecipes) {
    try {
      const existing = await Recipe.findOne({ name: recipeData.name });
      
      if (existing) {
        // Update existing recipe, preserving _id
        await Recipe.findByIdAndUpdate(existing._id, recipeData, { new: true });
        console.log(`✓ Updated: ${recipeData.name}`);
        updated++;
      } else {
        // Create new recipe
        await Recipe.create(recipeData);
        console.log(`✓ Created: ${recipeData.name}`);
        created++;
      }
    } catch (error) {
      console.error(`✗ Error processing ${recipeData.name}:`, error.message);
    }
  }

  console.log('\n=== Recipe Update Complete ===');
  console.log(`Created: ${created} recipes`);
  console.log(`Updated: ${updated} recipes`);
  console.log(`Total: ${created + updated} recipes in database`);
  console.log('\nUser data, inventory, budgets, and shopping lists were preserved.');
  
  process.exit(0);
}

updateRecipes().catch((err) => {
  console.error('Recipe update failed:', err);
  process.exit(1);
});