const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const emailService = require('../utils/emailService');
const { rateLimit, resetRateLimits } = require('../utils/rateLimiter');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const GENERIC_RESET_MESSAGE = 'If an account exists for this email address, a password reset link will be sent.';

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// POST /forgot-password — always returns the same generic response so account
// existence is never revealed. Email delivery problems surface as honest
// errors rather than fake success.
router.post(
  '/forgot-password',
  [
    body('email').trim().isEmail().withMessage('Please enter a valid email'),
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 3,
      keyFn: (req) => `${req.ip}:${(req.body.email || '').toLowerCase().trim()}`,
      message: 'Too many reset requests. Please try again later.',
    }),
  ],
  validate,
  async (req, res) => {
    try {
      // If the mail transport is not configured at all, say so honestly —
      // before doing any user lookup so the response can't enumerate accounts.
      if (!emailService.isEmailConfigured() && process.env.EMAIL_TRANSPORT !== 'log') {
        return res.status(503).json({
          message: 'Password reset email is not configured on this server. Please contact support.',
          missingConfig: emailService.missingConfig(),
        });
      }

      const email = String(req.body.email).trim().toLowerCase();
      const user = await User.findOne({ email });

      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

        // Send FIRST, persist SECOND. If SMTP fails the previously stored
        // token (and its emailed link) must remain valid — saving the new
        // hash before a successful send would silently kill the old link.
        let mailInfo;
        try {
          mailInfo = await emailService.sendPasswordResetEmail(email, resetUrl, RESET_TOKEN_TTL_MS / 60000);
        } catch (mailError) {
          // Safe diagnostic — never log the token, link, or credentials.
          console.error(`[auth] Password reset email failed user=${user._id} at=${new Date().toISOString()} err=${mailError.message}`);
          return res.status(503).json({
            message: 'We could not send the reset email right now. Please try again in a few minutes.',
          });
        }

        user.resetPasswordTokenHash = hashResetToken(token);
        user.resetPasswordExpires = expiresAt;
        user.resetPasswordRequestedAt = new Date();
        await user.save();

        // Safe diagnostics only — no token, no reset URL.
        console.log(`[auth] Reset email accepted user=${user._id} at=${new Date().toISOString()} messageId=${mailInfo?.messageId || 'n/a'} expires=${expiresAt.toISOString()} origin=${frontendUrl}`);
      }

      res.json({ message: GENERIC_RESET_MESSAGE });
    } catch (error) {
      console.error('[auth] forgot-password error:', error.message);
      res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
  }
);

// GET /verify-reset-token?token=... — lets the reset page validate the link
// before showing the form. Never reveals which part failed beyond validity.
router.get('/verify-reset-token', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.json({ valid: false, reason: 'missing' });
    const user = await User.findOne({
      resetPasswordTokenHash: hashResetToken(token),
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      console.log(`[auth] verify-reset-token lookup failed at=${new Date().toISOString()}`);
      return res.json({ valid: false, reason: 'invalid-or-expired' });
    }
    console.log(`[auth] verify-reset-token lookup ok user=${user._id} at=${new Date().toISOString()}`);
    res.json({ valid: true });
  } catch (error) {
    res.status(500).json({ valid: false, reason: 'error' });
  }
});

// POST /reset-password — validates the token server-side, then updates the
// password with bcrypt and burns the token (single use).
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      keyFn: (req) => `reset:${req.ip}`,
      message: 'Too many attempts. Please try again later.',
    }),
  ],
  validate,
  async (req, res) => {
    try {
      const { token, password } = req.body;
      const user = await User.findOne({
        resetPasswordTokenHash: hashResetToken(token),
        resetPasswordExpires: { $gt: new Date() },
      });
      if (!user) {
        console.log(`[auth] reset-password rejected invalid/expired token at=${new Date().toISOString()}`);
        return res.status(400).json({
          message: 'This password reset link is invalid or has expired. Please request a new one.',
        });
      }

      user.passwordHash = await bcrypt.hash(password, 12);
      user.resetPasswordTokenHash = null;
      user.resetPasswordExpires = null;
      user.passwordChangedAt = new Date();
      await user.save();

      console.log(`[auth] password reset completed user=${user._id} at=${new Date().toISOString()}`);
      res.json({ message: 'Your password has been reset successfully! You can now log in with your new password.' });
    } catch (error) {
      console.error('[auth] reset-password error:', error.message);
      res.status(500).json({ message: 'Password reset failed. Please try again.' });
    }
  }
);

// Test hook — clears rate-limit buckets between test runs.
router._resetRateLimits = resetRateLimits;

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
