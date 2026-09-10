const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  monthlyBudget: { type: Number, default: 30000, min: 0 },
  totalSpent: { type: Number, default: 0, min: 0 },
  remainingBudget: { type: Number, default: 30000 },
  wastedFoodCost: { type: Number, default: 0, min: 0 },
});

budgetSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
