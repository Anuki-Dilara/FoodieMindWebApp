const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unit: { type: String, default: 'pieces' },
  size: { type: String, enum: ['xs', 's', 'm', 'l', 'xl'], default: null },
  form: { type: String, enum: ['whole', 'chopped', 'diced', 'sliced', 'grated', 'shredded', 'mashed'], default: null },
  isOptional: { type: Boolean, default: false },
}, { _id: false });

const nutritionSchema = new mongoose.Schema({
  // All values are per serving
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  carbohydrates: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  fibre: { type: Number, default: 0 },
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
  tags: [{ type: String }], // e.g., ['comfort', 'warm', 'mild', 'soft-food', 'colorful', 'fresh']
  ingredientCategories: [{ type: String }], // e.g., ['protein', 'vegetables', 'grains']
  foodTemperature: {
    type: String,
    enum: ['warm', 'cold', 'room-temperature', 'any'],
    default: 'any',
  },
  texture: [{ type: String }], // e.g., ['soft', 'smooth', 'creamy', 'crisp', 'chewy']
  flavourProfile: [{ type: String }], // e.g., ['mild', 'sweet', 'savoury', 'spicy', 'tangy', 'familiar']
  comfortScore: { type: Number, min: 1, max: 5, default: 3 }, // 1-5 comfort-food suitability
  colourVariety: { type: Number, min: 0, default: 0 }, // distinct ingredient colours (0-6)
  isSeed: { type: Boolean, default: false }, // marks built-in sample recipes
  image: { type: String, default: '' },
  source: {
    type: String,
    enum: ['local', 'admin', 'spoonacular', 'themealdb', 'ai-generated'],
    default: 'local',
  },
  externalId: { type: String, default: null },
  isAIGenerated: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  aiGeneration: {
    mood: { type: String, default: null },
    generatedAt: { type: Date, default: null },
    fingerprint: { type: String, default: null },
  },
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
