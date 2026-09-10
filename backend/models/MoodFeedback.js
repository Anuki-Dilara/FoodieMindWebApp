const mongoose = require('mongoose');

const moodFeedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
  mood: { type: String, required: true, enum: ['Happy', 'Tired', 'Sick', 'Stressed', 'Energetic', 'Lazy', 'Sad', 'Hungry'] },
  helpful: { type: Boolean, required: true }, // true = thumbs up, false = thumbs down
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Ensure one feedback per user, recipe, and mood combination
moodFeedbackSchema.index({ userId: 1, recipeId: 1, mood: 1 }, { unique: true });

moodFeedbackSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('MoodFeedback', moodFeedbackSchema);
