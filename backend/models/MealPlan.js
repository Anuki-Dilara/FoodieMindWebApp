const mongoose = require('mongoose');

const mealPlanSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', default: null },
  recipeName: { type: String, required: true },
  recipeSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  recipeSource: { type: String, default: 'local' },
  date: { type: Date, required: true },
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'], required: true },
  missingIngredients: [{ type: String }],
  estimatedCost: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MealPlan', mealPlanSchema);
