const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unit: { type: String, default: 'pieces' },
}, { _id: false });

const recipeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  ingredients: [ingredientSchema],
  instructions: [{ type: String }],
  cookingTime: { type: Number, default: 30 },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner',
  },
  dietaryType: [{ type: String }],
  moodTags: [{ type: String }],
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

recipeSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Recipe', recipeSchema);
