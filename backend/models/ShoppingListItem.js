const mongoose = require('mongoose');

const shoppingListItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 1, min: 0 },
  unit: { type: String, default: 'pieces' },
  estimatedPrice: { type: Number, default: 0, min: 0 },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  source: { type: String, enum: ['manual', 'consumed', 'meal-plan', 'suggested'], default: 'manual' },
  status: { type: String, enum: ['Pending', 'Bought'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ShoppingListItem', shoppingListItemSchema);
