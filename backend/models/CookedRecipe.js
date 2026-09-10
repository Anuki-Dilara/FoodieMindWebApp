const mongoose = require('mongoose');

const cookedRecipeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' },
  recipeName: { type: String, required: true },
  recipeSource: {
    type: String,
    enum: ['local', 'admin', 'spoonacular', 'themealdb', 'ai-generated'],
    default: 'local',
  },
  isAIGenerated: { type: Boolean, default: false },
  cookedDate: { type: Date, default: Date.now },
  ingredientsUsed: [{ name: String, quantity: Number, unit: String }],
  recipeSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  servings: { type: Number, default: null }, // Track custom serving count
  substitutionsUsed: [{
    originalIngredient: String,
    substituteIngredient: String,
    substitutionId: mongoose.Schema.Types.ObjectId,
  }], // Track substitutions used
});

module.exports = mongoose.model('CookedRecipe', cookedRecipeSchema);
