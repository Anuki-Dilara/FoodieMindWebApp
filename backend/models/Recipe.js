const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unit: { type: String, default: 'pieces' },
  isOptional: { type: Boolean, default: false },
}, { _id: false });

const nutritionSchema = new mongoose.Schema({
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbohydrates: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  isEstimated: { type: Boolean, default: true },
}, { _id: false });

const preparationSchema = new mongoose.Schema({
  handsOnTime: { type: Number, default: 15 }, // minutes of active preparation
  totalSteps: { type: Number, default: 5 },
  equipment: [{ type: String }], // e.g., ['pan', 'knife', 'blender']
  method: { type: String, enum: ['stovetop', 'oven', 'microwave', 'no-cook', 'mixed'] },
  effort: { type: String, enum: ['Very Low', 'Low', 'Medium', 'High', 'Very High'], default: 'Medium' },
}, { _id: false });

const recipeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  ingredients: [ingredientSchema],
  instructions: [{ type: String }],
  cookingTime: { type: Number, default: 30 },
  servings: { type: Number, default: 2 },
  mealType: {
    type: String,
    enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'],
    default: 'Dinner',
  },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner',
  },
  dietaryType: [{ type: String }],
  moodTags: [{ type: String }],
  nutrition: nutritionSchema,
  preparation: preparationSchema,
  tags: [{ type: String }], // e.g., ['comfort', 'warm', 'mild', 'soft-food']
  ingredientCategories: [{ type: String }], // e.g., ['protein', 'vegetables', 'grains']
  image: { type: String, default: '' },
  source: {
    type: String,
    enum: ['local', 'admin', 'spoonacular', 'themealdb', 'ai-generated'],
    default: 'local',
  },
  externalId: { type: String, default: null },
  isAIGenerated: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

recipeSchema.index({ name: 'text', description: 'text' });
recipeSchema.index({ source: 1 });
recipeSchema.index({ difficulty: 1 });
recipeSchema.index({ mealType: 1 });

recipeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Recipe', recipeSchema);
