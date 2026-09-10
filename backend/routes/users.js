const express = require('express');
const { body } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/profile', auth, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

router.put(
  '/profile',
  auth,
  [
    body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
    body('email').optional().isEmail().withMessage('Please enter a valid email'),
    body('cookingSkillLevel').optional().isIn(['Beginner', 'Intermediate', 'Advanced']),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = [
        'fullName', 'email', 'phone', 'profileImage',
        'allergies', 'dietaryPreferences', 'cookingSkillLevel',
      ];

      allowed.forEach((field) => {
        if (req.body[field] !== undefined) {
          req.user[field] = req.body[field];
        }
      });

      if (req.body.email) {
        const existing = await User.findOne({
          email: req.body.email.toLowerCase(),
          _id: { $ne: req.user._id },
        });
        if (existing) {
          return res.status(400).json({ message: 'Email is already in use.' });
        }
        req.user.email = req.body.email.toLowerCase();
      }

      await req.user.save();
      res.json({ message: 'Profile updated successfully!', user: req.user.toJSON() });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update profile.' });
    }
  }
);

module.exports = router;
