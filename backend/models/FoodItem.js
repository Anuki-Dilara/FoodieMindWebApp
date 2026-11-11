const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: [
      'Dairy', 'Fruits', 'Vegetables', 'Meat', 'Fish', 'Bakery',
      'Grains', 'Canned food', 'Snacks', 'Drinks', 'Spices', 'Other',
      // Extended categories for the demo pantry / recipe matching
      'Grains and Cereals', 'Legumes', 'Herbs and Spices',
      'Nuts and Seeds', 'Cooking Essentials', 'Canned and Packaged Foods',
      'Protein',
    ],
    default: 'Other',
  },
  quantity: { type: Number, required: true, min: 0 },
  baseQuantity: { type: Number, required: true },
  unit: {
    type: String,
    enum: ['ml', 'l', 'g', 'kg', 'pieces', 'packets', 'cups', 'tablespoons', 'teaspoons', 'tbsp', 'tsp',
      'bunch', 'bulb', 'loaf', 'can', 'head', 'clove', 'stalk', 'ear', 'cob',
      'wedge', 'slice', 'segment', 'pod', 'sprig', 'whole', 'cube'],
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
  // For bread items held in 'loaf' unit: how many slices this specific loaf
  // contains. Overrides the conversion profile default; null = use profile
  // default or leave loaf<->slice conversion unavailable.
  slicesPerLoaf: { type: Number, default: null, min: 0 },
  // For sliced cheese (and similar) items: package label info —
  // { weightGrams: net package weight, slices: slices in that package }.
  // Overrides the profile's standard slice weight for this item only.
  slicePack: {
    weightGrams: { type: Number, default: null, min: 0 },
    slices: { type: Number, default: null, min: 0 },
  },
  purchaseDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, required: true },
  storageLocation: { type: String, default: 'Pantry' },
  price: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '' },
  status: { type: String, enum: ['Fresh', 'Use Soon', 'Expired'], default: 'Fresh' },
  isSeed: { type: Boolean, default: false }, // marks built-in demo pantry items
  // Idempotency key for quantity-merge operations — a retried merge request
  // with the same id is a no-op instead of double-adding stock.
  mergeRequestId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

foodItemSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('FoodItem', foodItemSchema);
