const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'expiring_soon', 'expired', 'missing_ingredients', 'budget_warning',
      'shopping_reminder', 'recipe_suggestion', 'pantry_empty', 'general',
    ],
    default: 'general',
  },
  link: { type: String, default: '' },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Notification', notificationSchema);
