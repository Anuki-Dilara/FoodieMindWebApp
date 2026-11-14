const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  allergies: [{ type: String }],
  dietaryPreferences: [{ type: String }],
  cookingSkillLevel: {
    type: String,
    enum: ['Beginner', 'Intermediate', 'Advanced'],
    default: 'Beginner',
  },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  // Password-reset state. Only the SHA-256 hash of the reset token is stored —
  // the raw token exists only in the emailed link. A new request overwrites
  // these fields, invalidating any previous outstanding token.
  resetPasswordTokenHash: { type: String, default: null, index: true },
  resetPasswordExpires: { type: Date, default: null },
  resetPasswordRequestedAt: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
  // Set while an empty-pantry notification has been sent for the current
  // empty period; reset automatically when usable stock returns.
  pantryEmptyAlerted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetPasswordTokenHash;
  delete obj.resetPasswordExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
