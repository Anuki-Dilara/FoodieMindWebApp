const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: [
      'Dairy', 'Fruits', 'Vegetables', 'Meat', 'Fish', 'Bakery',
      'Grains', 'Canned food', 'Snacks', 'Drinks', 'Spices', 'Other',
    ],
    default: 'Other',
  },
  quantity: { type: Number, required: true, min: 0 },
  baseQuantity: { type: Number, required: true },
  unit: {
    type: String,
    enum: ['ml', 'l', 'g', 'kg', 'pieces', 'packets', 'cups', 'tablespoons', 'teaspoons', 'tbsp', 'tsp'],
    required: true,
  },
  baseUnit: { type: String, required: true },
  // Package content information for items like bread packets
  packageContent: {
    quantity: { type: Number, default: null },
    unit: {
      type: String,
      enum: ['pieces', 'g', 'ml'],
      default: 'pieces'
    }
  },
  purchaseDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  storageLocation: { type: String, default: 'Pantry' },
  price: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['Fresh', 'Use Soon', 'Expired'], default: 'Fresh' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

foodItemSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('FoodItem', foodItemSchema);
