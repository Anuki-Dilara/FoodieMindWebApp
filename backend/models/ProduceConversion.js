const mongoose = require('mongoose');

// Admin-manageable produce conversion profile. The `data` field stores the
// full profile object (same shape as data/produceProfiles.js). `adminModified`
// protects admin edits from being overwritten by re-seeding.
const produceConversionSchema = new mongoose.Schema({
  canonicalName: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, enum: ['vegetable', 'fruit', 'herb', 'bakery', 'dairy'], default: 'vegetable' },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  enabled: { type: Boolean, default: true },
  adminModified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

produceConversionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

produceConversionSchema.index({ category: 1 });
produceConversionSchema.index({ name: 'text' });

module.exports = mongoose.model('ProduceConversion', produceConversionSchema);
