// Idempotent seeder for the 50 built-in sample recipes.
// - Upserts by recipe name; never deletes or overwrites user-created recipes.
// - Safe to run multiple times: re-running updates the same seed records only.
// - Marks every seeded recipe with isSeed: true.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Recipe = require('../models/Recipe');
const completeRecipes = require('./recipeData');

// Mood-scoring attributes for every seed recipe:
// preparation { handsOnTime, totalSteps, equipment, method, effort },
// tags, ingredientCategories, foodTemperature, texture, flavourProfile,
// comfortScore (1-5), colourVariety (0-6).
const RECIPE_ATTRIBUTES = {
  // ---------- original 20 ----------
  'French Toast': {
    preparation: { handsOnTime: 10, totalSteps: 5, equipment: ['pan', 'bowl', 'whisk'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['grains', 'dairy', 'protein', 'fruits'],
    foodTemperature: 'warm', texture: ['soft', 'crispy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 4, colourVariety: 3,
  },
  'Egg Sandwich': {
    preparation: { handsOnTime: 8, totalSteps: 6, equipment: ['pan', 'toaster', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'dairy', 'protein'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 4, colourVariety: 2,
  },
  'Pancakes': {
    preparation: { handsOnTime: 15, totalSteps: 7, equipment: ['pan', 'bowl', 'whisk', 'griddle'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['grains', 'dairy', 'protein'],
    foodTemperature: 'warm', texture: ['soft', 'fluffy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 4, colourVariety: 2,
  },
  'Vegetable Fried Rice': {
    preparation: { handsOnTime: 20, totalSteps: 7, equipment: ['wok', 'pan', 'knife'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'savoury', 'spicy', 'fresh', 'colorful'],
    ingredientCategories: ['grains', 'vegetables', 'protein'],
    foodTemperature: 'warm', texture: ['chewy'], flavourProfile: ['savoury', 'spicy'],
    comfortScore: 3, colourVariety: 5,
  },
  'Milk Rice': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['pot', 'spatula', 'tray'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'comfort', 'soft-food', 'mild'],
    ingredientCategories: ['grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft', 'creamy'], flavourProfile: ['mild', 'familiar'],
    comfortScore: 3, colourVariety: 1,
  },
  'Chicken Curry': {
    preparation: { handsOnTime: 25, totalSteps: 9, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'High' },
    tags: ['warm', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['protein', 'vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['tender'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 3,
  },
  'Vegetable Soup': {
    preparation: { handsOnTime: 15, totalSteps: 7, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'mild', 'soft-food'],
    ingredientCategories: ['vegetables'],
    foodTemperature: 'warm', texture: ['soft', 'smooth'], flavourProfile: ['mild'],
    comfortScore: 3, colourVariety: 4,
  },
  'Fruit Smoothie': {
    preparation: { handsOnTime: 3, totalSteps: 4, equipment: ['blender', 'knife'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'mild', 'sweet'],
    ingredientCategories: ['fruits', 'dairy'],
    foodTemperature: 'cold', texture: ['smooth'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 2, colourVariety: 3,
  },
  'Omelette': {
    preparation: { handsOnTime: 8, totalSteps: 8, equipment: ['pan', 'bowl', 'whisk', 'knife'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'soft-food', 'savoury'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 3, colourVariety: 3,
  },
  'Pasta with Tomato Sauce': {
    preparation: { handsOnTime: 20, totalSteps: 9, equipment: ['pot', 'pan', 'knife', 'colander'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['savoury', 'familiar'],
    comfortScore: 5, colourVariety: 3,
  },
  'Banana Pancakes': {
    preparation: { handsOnTime: 12, totalSteps: 7, equipment: ['pan', 'bowl', 'whisk', 'fork'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['fruits', 'grains', 'dairy', 'protein'],
    foodTemperature: 'warm', texture: ['soft', 'fluffy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 4, colourVariety: 2,
  },
  'Banana Oatmeal': {
    preparation: { handsOnTime: 5, totalSteps: 6, equipment: ['pot', 'bowl', 'knife', 'spoon'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'mild', 'soft-food', 'comfort', 'sweet'],
    ingredientCategories: ['fruits', 'grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft', 'creamy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 4, colourVariety: 2,
  },
  'Banana Yogurt Bowl': {
    preparation: { handsOnTime: 3, totalSteps: 5, equipment: ['bowl', 'knife', 'spoon'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'mild', 'sweet'],
    ingredientCategories: ['fruits', 'dairy'],
    foodTemperature: 'cold', texture: ['creamy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 2, colourVariety: 4,
  },
  'Tomato Soup': {
    preparation: { handsOnTime: 18, totalSteps: 8, equipment: ['pot', 'knife', 'immersion blender'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'mild', 'soft-food', 'comfort'],
    ingredientCategories: ['vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['smooth', 'creamy'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 4, colourVariety: 2,
  },
  'Tomato and Cucumber Salad': {
    preparation: { handsOnTime: 8, totalSteps: 7, equipment: ['bowl', 'knife', 'cutting board'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'mild', 'fresh'],
    ingredientCategories: ['vegetables'],
    foodTemperature: 'cold', texture: ['crisp'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 4,
  },
  'Tomato Egg Stir-Fry': {
    preparation: { handsOnTime: 12, totalSteps: 8, equipment: ['wok', 'pan', 'bowl', 'knife'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'savoury'],
    ingredientCategories: ['vegetables', 'protein'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 3, colourVariety: 3,
  },
  'Sri Lankan Dhal Curry': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['protein', 'vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['creamy', 'soft'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 3,
  },
  'Coconut Roti': {
    preparation: { handsOnTime: 20, totalSteps: 8, equipment: ['pan', 'bowl', 'rolling pin'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm'],
    ingredientCategories: ['grains'],
    foodTemperature: 'warm', texture: ['soft', 'chewy'], flavourProfile: ['mild', 'familiar'],
    comfortScore: 3, colourVariety: 1,
  },
  'Potato Curry': {
    preparation: { handsOnTime: 18, totalSteps: 8, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'soft-food', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 3,
  },
  'Vegetable Noodles': {
    preparation: { handsOnTime: 15, totalSteps: 7, equipment: ['wok', 'pan', 'knife', 'colander'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'savoury', 'spicy', 'colorful'],
    ingredientCategories: ['grains', 'vegetables'],
    foodTemperature: 'warm', texture: ['chewy'], flavourProfile: ['savoury', 'spicy'],
    comfortScore: 3, colourVariety: 4,
  },
  // ---------- new recipes ----------
  'Kottu Roti': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['wok', 'knife', 'cutting board'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'savoury', 'spicy', 'colorful'],
    ingredientCategories: ['protein', 'grains', 'vegetables'],
    foodTemperature: 'warm', texture: ['chewy'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 3, colourVariety: 4,
  },
  'String Hoppers': {
    preparation: { handsOnTime: 15, totalSteps: 6, equipment: ['pot', 'steamer', 'bowl'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'mild'],
    ingredientCategories: ['grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft', 'chewy'], flavourProfile: ['mild', 'familiar'],
    comfortScore: 3, colourVariety: 1,
  },
  'Pittu': {
    preparation: { handsOnTime: 12, totalSteps: 5, equipment: ['pot', 'steamer', 'bowl'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'mild'],
    ingredientCategories: ['grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['mild', 'familiar'],
    comfortScore: 3, colourVariety: 1,
  },
  'Fish Curry': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'spicy', 'savoury'],
    ingredientCategories: ['protein', 'dairy'],
    foodTemperature: 'warm', texture: ['tender'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 3, colourVariety: 3,
  },
  'Pol Sambol': {
    preparation: { handsOnTime: 5, totalSteps: 4, equipment: ['bowl', 'knife'], method: 'no-cook', effort: 'Very Low' },
    tags: ['spicy', 'fresh'],
    ingredientCategories: ['dairy', 'vegetables'],
    foodTemperature: 'room-temperature', texture: ['crumbly'], flavourProfile: ['spicy', 'tangy'],
    comfortScore: 2, colourVariety: 3,
  },
  'Chicken Biryani': {
    preparation: { handsOnTime: 30, totalSteps: 10, equipment: ['pot', 'pan', 'knife'], method: 'stovetop', effort: 'High' },
    tags: ['warm', 'comfort', 'spicy', 'savoury', 'colorful'],
    ingredientCategories: ['protein', 'grains', 'vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['fluffy', 'tender'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 5, colourVariety: 4,
  },
  'Beef Stir-Fry': {
    preparation: { handsOnTime: 12, totalSteps: 8, equipment: ['wok', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'savoury', 'fresh', 'colorful'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['tender'], flavourProfile: ['savoury', 'umami'],
    comfortScore: 3, colourVariety: 4,
  },
  'Grilled Chicken Salad': {
    preparation: { handsOnTime: 10, totalSteps: 6, equipment: ['pan', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['fresh', 'cold', 'colorful'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'cold', texture: ['crisp'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 5,
  },
  'Avocado Toast': {
    preparation: { handsOnTime: 5, totalSteps: 4, equipment: ['toaster', 'knife', 'bowl'], method: 'mixed', effort: 'Very Low' },
    tags: ['fresh', 'colorful'],
    ingredientCategories: ['grains', 'fruits'],
    foodTemperature: 'room-temperature', texture: ['creamy', 'crispy'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 4,
  },
  'Vegetable Ramen': {
    preparation: { handsOnTime: 12, totalSteps: 7, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft', 'chewy'], flavourProfile: ['savoury', 'umami'],
    comfortScore: 4, colourVariety: 4,
  },
  'Buddha Bowl': {
    preparation: { handsOnTime: 15, totalSteps: 6, equipment: ['pot', 'oven', 'bowl'], method: 'oven', effort: 'Low' },
    tags: ['fresh', 'colorful', 'healthy'],
    ingredientCategories: ['grains', 'protein', 'vegetables', 'fruits'],
    foodTemperature: 'warm', texture: ['chewy', 'creamy'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 6,
  },
  'Caesar Salad': {
    preparation: { handsOnTime: 10, totalSteps: 6, equipment: ['bowl', 'knife', 'pan'], method: 'no-cook', effort: 'Very Low' },
    tags: ['fresh', 'cold', 'colorful'],
    ingredientCategories: ['vegetables', 'dairy', 'grains'],
    foodTemperature: 'cold', texture: ['crisp'], flavourProfile: ['tangy', 'savoury'],
    comfortScore: 2, colourVariety: 4,
  },
  'Mushroom Risotto': {
    preparation: { handsOnTime: 20, totalSteps: 9, equipment: ['pan', 'knife'], method: 'stovetop', effort: 'High' },
    tags: ['warm', 'comfort', 'creamy'],
    ingredientCategories: ['grains', 'vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['creamy', 'soft'], flavourProfile: ['savoury', 'umami'],
    comfortScore: 5, colourVariety: 2,
  },
  'Lentil Soup': {
    preparation: { handsOnTime: 10, totalSteps: 6, equipment: ['pot', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'mild', 'soft-food', 'comfort', 'healthy'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['smooth', 'soft'], flavourProfile: ['mild', 'earthy'],
    comfortScore: 4, colourVariety: 3,
  },
  'Tuna Salad': {
    preparation: { handsOnTime: 5, totalSteps: 4, equipment: ['bowl', 'knife'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'fresh', 'protein'],
    ingredientCategories: ['protein', 'dairy', 'vegetables'],
    foodTemperature: 'cold', texture: ['flaky', 'creamy'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 3,
  },
  'Cheese Quesadilla': {
    preparation: { handsOnTime: 6, totalSteps: 5, equipment: ['pan', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'dairy', 'vegetables', 'protein'],
    foodTemperature: 'warm', texture: ['crispy', 'melty'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 4, colourVariety: 3,
  },
  'Shakshuka': {
    preparation: { handsOnTime: 12, totalSteps: 8, equipment: ['pan', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'comfort', 'spicy', 'colorful'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft', 'saucy'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 5,
  },
  'Overnight Oats': {
    preparation: { handsOnTime: 4, totalSteps: 3, equipment: ['jar', 'spoon'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'mild', 'sweet', 'healthy'],
    ingredientCategories: ['grains', 'dairy', 'fruits'],
    foodTemperature: 'cold', texture: ['creamy', 'chewy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 2, colourVariety: 3,
  },
  'Cottage Cheese Bowl': {
    preparation: { handsOnTime: 4, totalSteps: 3, equipment: ['bowl', 'knife'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'fresh', 'protein'],
    ingredientCategories: ['dairy', 'vegetables'],
    foodTemperature: 'cold', texture: ['creamy', 'crisp'], flavourProfile: ['mild', 'fresh'],
    comfortScore: 2, colourVariety: 3,
  },
  'Baked Salmon with Vegetables': {
    preparation: { handsOnTime: 10, totalSteps: 6, equipment: ['oven', 'baking tray', 'knife'], method: 'oven', effort: 'Low' },
    tags: ['warm', 'fresh', 'healthy', 'colorful'],
    ingredientCategories: ['protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['flaky', 'tender'], flavourProfile: ['mild', 'tangy'],
    comfortScore: 2, colourVariety: 4,
  },
  'Garlic Butter Pasta': {
    preparation: { handsOnTime: 8, totalSteps: 6, equipment: ['pot', 'pan', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 4, colourVariety: 2,
  },
  'Chicken Noodle Soup': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'mild', 'soft-food', 'comfort', 'healthy'],
    ingredientCategories: ['protein', 'grains', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft'], flavourProfile: ['mild', 'familiar'],
    comfortScore: 5, colourVariety: 4,
  },
  'Beef Tacos': {
    preparation: { handsOnTime: 10, totalSteps: 7, equipment: ['pan', 'knife', 'cutting board'], method: 'stovetop', effort: 'Low' },
    tags: ['warm', 'savoury', 'spicy', 'colorful'],
    ingredientCategories: ['protein', 'grains', 'vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['tender', 'crisp'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 5,
  },
  'Peanut Noodles': {
    preparation: { handsOnTime: 8, totalSteps: 5, equipment: ['pot', 'bowl', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['cold', 'savoury', 'colorful'],
    ingredientCategories: ['grains', 'protein', 'vegetables'],
    foodTemperature: 'cold', texture: ['chewy', 'creamy'], flavourProfile: ['savoury', 'tangy'],
    comfortScore: 3, colourVariety: 4,
  },
  'Congee': {
    preparation: { handsOnTime: 8, totalSteps: 5, equipment: ['pot', 'spoon'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'mild', 'soft-food', 'comfort'],
    ingredientCategories: ['grains'],
    foodTemperature: 'warm', texture: ['smooth', 'creamy'], flavourProfile: ['mild'],
    comfortScore: 4, colourVariety: 1,
  },
  'Smoothie Bowl': {
    preparation: { handsOnTime: 5, totalSteps: 4, equipment: ['blender', 'bowl', 'knife'], method: 'no-cook', effort: 'Very Low' },
    tags: ['cold', 'sweet', 'fresh', 'colorful'],
    ingredientCategories: ['fruits', 'dairy', 'grains'],
    foodTemperature: 'cold', texture: ['smooth', 'creamy'], flavourProfile: ['sweet', 'mild'],
    comfortScore: 2, colourVariety: 5,
  },
  'Grilled Cheese Sandwich': {
    preparation: { handsOnTime: 4, totalSteps: 4, equipment: ['pan', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'dairy'],
    foodTemperature: 'warm', texture: ['crispy', 'melty'], flavourProfile: ['savoury', 'mild'],
    comfortScore: 5, colourVariety: 2,
  },
  'Banana Bread': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['oven', 'bowl', 'whisk', 'loaf tin'], method: 'oven', effort: 'Medium' },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['fruits', 'grains', 'dairy'],
    foodTemperature: 'warm', texture: ['soft', 'moist'], flavourProfile: ['sweet', 'familiar'],
    comfortScore: 5, colourVariety: 2,
  },
  'Kitchari': {
    preparation: { handsOnTime: 10, totalSteps: 6, equipment: ['pot', 'knife'], method: 'stovetop', effort: 'Very Low' },
    tags: ['warm', 'mild', 'soft-food', 'comfort', 'healthy'],
    ingredientCategories: ['grains', 'protein', 'vegetables'],
    foodTemperature: 'warm', texture: ['soft', 'creamy'], flavourProfile: ['mild', 'earthy'],
    comfortScore: 4, colourVariety: 3,
  },
  'Vegetable Curry': {
    preparation: { handsOnTime: 15, totalSteps: 8, equipment: ['pot', 'knife', 'cutting board'], method: 'stovetop', effort: 'Medium' },
    tags: ['warm', 'comfort', 'spicy', 'colorful'],
    ingredientCategories: ['vegetables', 'dairy'],
    foodTemperature: 'warm', texture: ['tender', 'creamy'], flavourProfile: ['spicy', 'savoury'],
    comfortScore: 4, colourVariety: 5,
  },
};

// Upserts all seed recipes. Assumes the DB connection is already open.
// Does NOT delete anything and never overwrites non-seed (user) recipes.
async function upsertSeedRecipes() {
  if (completeRecipes.length !== 50) {
    console.warn(`Warning: expected 50 seed recipes, found ${completeRecipes.length}`);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const recipeData of completeRecipes) {
    try {
      const attrs = RECIPE_ATTRIBUTES[recipeData.name] || {};
      const data = {
        ...recipeData,
        ...attrs,
        isSeed: true,
        source: recipeData.source || 'local',
      };

      // Never overwrite a recipe explicitly owned by a user (createdBy set).
      // Legacy demo-seed records (createdBy null, source 'local') are adopted
      // as seed records so re-seeding enriches them instead of duplicating.
      const existing = await Recipe.findOne({ name: recipeData.name });
      if (existing && !existing.isSeed && existing.createdBy) {
        console.log(`⊘ Skipped (user recipe with same name exists): ${recipeData.name}`);
        skipped++;
        continue;
      }

      if (existing) {
        await Recipe.findByIdAndUpdate(existing._id, data, { new: true });
        updated++;
      } else {
        await Recipe.create(data);
        created++;
      }
    } catch (error) {
      console.error(`✗ Error processing ${recipeData.name}:`, error.message);
    }
  }

  const total = await Recipe.countDocuments({ isSeed: true });
  console.log('\n=== Recipe Seed Complete ===');
  console.log(`Created: ${created} | Updated: ${updated} | Skipped: ${skipped}`);
  console.log(`Total seeded recipes in database: ${total}`);
  return { created, updated, skipped, total };
}

async function seedRecipes() {
  await connectDB();
  const result = await upsertSeedRecipes();
  process.exit(0);
}

if (require.main === module) {
  seedRecipes().catch((err) => {
    console.error('Recipe seeding failed:', err);
    process.exit(1);
  });
}

module.exports = { seedRecipes, upsertSeedRecipes, RECIPE_ATTRIBUTES };
