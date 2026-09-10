// Migration script to enrich existing recipes with mood recommendation metadata
const Recipe = require('../models/Recipe');
const connectDB = require('../config/db');

const recipeMetadata = {
  'French Toast': {
    preparation: {
      handsOnTime: 10,
      totalSteps: 5,
      equipment: ['pan', 'bowl', 'whisk'],
      method: 'stovetop',
      effort: 'Low'
    },
    tags: ['warm', 'comfort'],
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
    tags: ['warm', 'comfort'],
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
    tags: ['warm', 'comfort'],
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
    tags: ['warm'],
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
    tags: ['warm', 'comfort', 'soft-food'],
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
    tags: ['warm', 'comfort'],
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
    tags: ['mild'],
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
    tags: ['warm', 'soft-food'],
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
    tags: ['warm', 'comfort'],
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
    tags: ['warm', 'comfort'],
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
    tags: ['warm', 'mild', 'soft-food', 'comfort'],
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
    tags: ['mild'],
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
    tags: ['mild'],
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
    tags: ['warm'],
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
    tags: ['warm', 'comfort'],
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
      totalSteps: 8,
      equipment: ['pot', 'knife', 'cutting board'],
      method: 'stovetop',
      effort: 'Medium'
    },
    tags: ['warm', 'soft-food', 'comfort'],
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
    tags: ['warm'],
    ingredientCategories: ['grains', 'vegetables']
  }
};

async function enrichRecipes() {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    let updated = 0;
    let skipped = 0;

    for (const [recipeName, metadata] of Object.entries(recipeMetadata)) {
      const recipe = await Recipe.findOne({ name: recipeName });
      
      if (recipe) {
        // Only add new fields if they don't exist
        const updateData = {};
        
        if (!recipe.preparation) {
          updateData.preparation = metadata.preparation;
        }
        
        if (!recipe.tags || recipe.tags.length === 0) {
          updateData.tags = metadata.tags;
        }
        
        if (!recipe.ingredientCategories || recipe.ingredientCategories.length === 0) {
          updateData.ingredientCategories = metadata.ingredientCategories;
        }

        if (Object.keys(updateData).length > 0) {
          await Recipe.updateOne({ _id: recipe._id }, { $set: updateData });
          console.log(`✓ Updated: ${recipeName}`);
          updated++;
        } else {
          console.log(`⊘ Skipped (already has metadata): ${recipeName}`);
          skipped++;
        }
      } else {
        console.log(`✗ Not found: ${recipeName}`);
      }
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`Updated: ${updated} recipes`);
    console.log(`Skipped: ${skipped} recipes`);
    console.log(`Total processed: ${updated + skipped}`);

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

enrichRecipes();
