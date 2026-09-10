require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Recipe = require('../models/Recipe');
const completeRecipes = require('./recipeData');

// Recipe metadata for mood recommendations
const recipeMetadata = {
  'French Toast': {
    preparation: {
      handsOnTime: 10,
      totalSteps: 5,
      equipment: ['pan', 'bowl', 'whisk'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['grains', 'dairy', 'protein', 'fruits']
  },
  'Egg Sandwich': {
    preparation: {
      handsOnTime: 8,
      totalSteps: 6,
      equipment: ['pan', 'toaster', 'knife'],
      method: 'stovetop',
      effort: 'Very Low'
    },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'dairy', 'protein']
  },
  'Pancakes': {
    preparation: {
      handsOnTime: 15,
      totalSteps: 7,
      equipment: ['pan', 'bowl', 'whisk', 'griddle'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['grains', 'dairy', 'protein']
  },
  'Vegetable Fried Rice': {
    preparation: {
      handsOnTime: 20,
      totalSteps: 7,
      equipment: ['wok', 'pan', 'knife'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'savoury', 'spicy'],
    ingredientCategories: ['grains', 'vegetables', 'protein']
  },
  'Milk Rice': {
    preparation: {
      handsOnTime: 15,
      totalSteps: 8,
      equipment: ['pot', 'spatula', 'tray'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'comfort', 'soft-food', 'mild'],
    ingredientCategories: ['grains', 'dairy']
  },
  'Chicken Curry': {
    preparation: {
      handsOnTime: 25,
      totalSteps: 9,
      equipment: ['pot', 'knife', 'cutting board'],
      method: 'stovetop',
      effort: 'High'
    },
    tags: ['warm', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['protein', 'vegetables', 'dairy']
  },
  'Vegetable Soup': {
    preparation: {
      handsOnTime: 15,
      totalSteps: 7,
      equipment: ['pot', 'knife', 'cutting board'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'mild', 'soft-food'],
    ingredientCategories: ['vegetables']
  },
  'Fruit Smoothie': {
    preparation: {
      handsOnTime: 3,
      totalSteps: 4,
      equipment: ['blender', 'knife'],
      method: 'no-cook',
      effort: 'Very Low'
    },
    tags: ['cold', 'mild', 'sweet'],
    ingredientCategories: ['fruits', 'dairy']
  },
  'Omelette': {
    preparation: {
      handsOnTime: 8,
      totalSteps: 8,
      equipment: ['pan', 'bowl', 'whisk', 'knife'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'soft-food', 'savoury'],
    ingredientCategories: ['protein', 'vegetables']
  },
  'Pasta with Tomato Sauce': {
    preparation: {
      handsOnTime: 20,
      totalSteps: 9,
      equipment: ['pot', 'pan', 'knife', 'colander'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'comfort', 'savoury'],
    ingredientCategories: ['grains', 'vegetables']
  },
  'Banana Pancakes': {
    preparation: {
      handsOnTime: 12,
      totalSteps: 7,
      equipment: ['pan', 'bowl', 'whisk', 'fork'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'comfort', 'sweet'],
    ingredientCategories: ['fruits', 'grains', 'dairy', 'protein']
  },
  'Banana Oatmeal': {
    preparation: {
      handsOnTime: 5,
      totalSteps: 6,
      equipment: ['pot', 'bowl', 'knife', 'spoon'],
      method: 'stovetop',
      effort: 'Very Low'
    },
    tags: ['warm', 'mild', 'soft-food', 'comfort', 'sweet'],
    ingredientCategories: ['fruits', 'grains', 'dairy']
  },
  'Banana Yogurt Bowl': {
    preparation: {
      handsOnTime: 3,
      totalSteps: 5,
      equipment: ['bowl', 'knife', 'spoon'],
      method: 'no-cook',
      effort: 'Very Low'
    },
    tags: ['cold', 'mild', 'sweet'],
    ingredientCategories: ['fruits', 'dairy']
  },
  'Tomato Soup': {
    preparation: {
      handsOnTime: 18,
      totalSteps: 8,
      equipment: ['pot', 'knife', 'immersion blender'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'mild', 'soft-food', 'comfort'],
    ingredientCategories: ['vegetables', 'dairy']
  },
  'Tomato and Cucumber Salad': {
    preparation: {
      handsOnTime: 8,
      totalSteps: 7,
      equipment: ['bowl', 'knife', 'cutting board'],
      method: 'no-cook',
      effort: 'Very Low'
    },
    tags: ['cold', 'mild'],
    ingredientCategories: ['vegetables']
  },
  'Tomato Egg Stir-Fry': {
    preparation: {
      handsOnTime: 12,
      totalSteps: 8,
      equipment: ['wok', 'pan', 'bowl', 'knife'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'savoury'],
    ingredientCategories: ['vegetables', 'protein']
  },
  'Sri Lankan Dhal Curry': {
    preparation: {
      handsOnTime: 15,
      totalSteps: 8,
      equipment: ['pot', 'knife', 'cutting board'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['protein', 'vegetables', 'dairy']
  },
  'Coconut Roti': {
    preparation: {
      handsOnTime: 20,
      totalSteps: 8,
      equipment: ['pan', 'bowl', 'rolling pin'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm'],
    ingredientCategories: ['grains']
  },
  'Potato Curry': {
    preparation: {
      handsOnTime: 18,
      totalSteps:  8,
      equipment: ['pot', 'knife', 'cutting board'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'soft-food', 'comfort', 'spicy', 'savoury'],
    ingredientCategories: ['vegetables', 'dairy']
  },
  'Vegetable Noodles': {
    preparation: {
      handsOnTime: 15,
      totalSteps: 7,
      equipment: ['wok', 'pan', 'knife', 'colander'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'savoury', 'spicy'],
    ingredientCategories: ['grains', 'vegetables']
  }
};

async function updateRecipes() {
  await connectDB();

  console.log('Starting recipe update...');
  console.log(`Processing ${completeRecipes.length} recipes...`);

  let updated = 0;
  let created = 0;
  let metadataAdded = 0;

  for (const recipeData of completeRecipes) {
    try {
      const existing = await Recipe.findOne({ name: recipeData.name });
      
      // Add metadata to recipe data
      const enrichedData = {
        ...recipeData,
        ...(recipeMetadata[recipeData.name] || {})
      };
      
      if (existing) {
        // Update existing recipe, preserving _id
        // Only add new fields if they don't exist
        const updateData = {};
        
        for (const key in enrichedData) {
          if (!existing[key] || (Array.isArray(existing[key]) && existing[key].length === 0)) {
            updateData[key] = enrichedData[key];
          }
        }
        
        if (Object.keys(updateData).length > 0) {
          await Recipe.findByIdAndUpdate(existing._id, updateData, { new: true });
          console.log(`✓ Updated: ${recipeData.name}`);
          updated++;
        } else {
          console.log(`⊘ Skipped (already has all data): ${recipeData.name}`);
        }
      } else {
        // Create new recipe with metadata
        await Recipe.create(enrichedData);
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