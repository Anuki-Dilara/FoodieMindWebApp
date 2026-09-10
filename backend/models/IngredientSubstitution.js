const mongoose = require('mongoose');

const substitutionSchema = new mongoose.Schema({
  originalIngredient: { type: String, required: true }, // e.g., "butter"
  originalForm: { type: String, default: 'any' }, // e.g., "solid", "melted"
  substituteIngredient: { type: String, required: true }, // e.g., "coconut oil"
  substituteForm: { type: String, default: 'any' }, // e.g., "solid", "liquid"
  quantityRatio: { type: Number, required: true }, // e.g., 0.8 (use 80% of original)
  conversionRule: { type: String, default: null }, // e.g., "use 3/4 of original amount"
  suitableRecipeTypes: [{ type: String }], // e.g., ["baking", "cooking"]
  unsuitableRecipeTypes: [{ type: String }], // e.g., ["no-bake", "raw"]
  instructionAdjustment: { type: String, default: null }, // e.g., "melt before using"
  allergenInformation: { type: String, default: null }, // e.g., "contains nuts"
  dietaryNotes: { type: String, default: null }, // e.g., "vegan alternative"
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

substitutionSchema.index({ originalIngredient: 1, substituteIngredient: 1 });
substitutionSchema.index({ isActive: 1 });

substitutionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('IngredientSubstitution', substitutionSchema);
