const mongoose = require('mongoose');

const consumptionRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  foodId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
  foodName: { type: String, required: true },
  consumedQuantity: { type: Number, required: true },
  consumedUnit: { type: String, required: true },
  consumedDate: { type: Date, default: Date.now },
  priceValue: { type: Number, default: 0 },
});

module.exports = mongoose.model('ConsumptionRecord', consumptionRecordSchema);
