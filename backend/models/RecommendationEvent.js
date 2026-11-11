const mongoose = require('mongoose');

const recommendationEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventType: {
    type: String,
    required: true,
    enum: ['recommendations_shown', 'recipe_opened', 'recipe_cooked', 'feedback_given'],
  },
  moods: [{ type: String }], // Selected moods
  filters: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }, // Applied filters (timeAvailable, mealSize, cravingFlavor, etc.)
  recipeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }], // Recipes shown
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' }, // Specific recipe for opened/cooked/feedback
  recipeName: { type: String }, // Recipe name at time of event
  helpful: { type: Boolean }, // For feedback events
  servings: { type: Number }, // Servings selected
  substitutionsUsed: [{
    originalIngredient: String,
    substituteIngredient: String,
  }], // Substitutions used when cooked
  timestamp: { type: Date, default: Date.now },
});

// Index for querying user's recommendation history
recommendationEventSchema.index({ userId: 1, timestamp: -1 });
recommendationEventSchema.index({ eventType: 1, timestamp: -1 });
recommendationEventSchema.index({ recipeId: 1, timestamp: -1 });

module.exports = mongoose.model('RecommendationEvent', recommendationEventSchema);
