const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/register',
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validate,
  async (req, res) => {
    try {
      const { fullName, email, password, phone, profileImage } = req.body;

      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({ message: 'An account with this email already exists.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        fullName,
        email: email.toLowerCase(),
        passwordHash,
        phone: phone || '',
        profileImage: profileImage || '',
      });

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({ message: 'Welcome to FoodieMind!', token, user: user.toJSON() });
    } catch (error) {
      res.status(500).json({ message: 'Registration failed. Please try again.', error: error.message });
    }
  }
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({ message: 'Welcome back!', token, user: user.toJSON() });
    } catch (error) {
      res.status(500).json({ message: 'Login failed. Please try again.' });
    }
  }
);

router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

module.exports = router;
