require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const { upsertSeedRecipes } = require('./seedRecipes');
const { upsertSeedInventory } = require('./seedInventory');
const { upsertSeedSubstitutions } = require('./seedSubstitutions');
const { upsertProduceProfiles } = require('../utils/produceConversionService');

// Non-destructive demo seeder:
// - Upserts demo/admin users by email (never deletes accounts).
// - Upserts the 50 built-in seed recipes (never deletes user recipes).
// - Only creates sample pantry/budget/notifications when absent.
// Safe to run multiple times.

async function seed() {
  await connectDB();

  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 12);

  const demoUser = await User.findOneAndUpdate(
    { email: 'demo@moodmeal.com' },
    {
      $setOnInsert: {
        fullName: 'Demo User',
        passwordHash,
        phone: '+94771234567',
        allergies: ['Nuts'],
        dietaryPreferences: ['Healthy meals', 'Quick meals'],
        cookingSkillLevel: 'Intermediate',
        role: 'user',
      },
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { email: process.env.ADMIN_EMAIL || 'admin@moodmeal.com' },
    {
      $setOnInsert: {
        fullName: 'Admin User',
        passwordHash: adminHash,
        role: 'admin',
        cookingSkillLevel: 'Advanced',
      },
    },
    { upsert: true, new: true }
  );

  // Seed the 50 built-in recipes (idempotent)
  await upsertSeedRecipes();

  // Seed the 50-item demo pantry (idempotent, demo user only)
  await upsertSeedInventory(demoUser);

  // Seed approved ingredient substitutions (idempotent)
  await upsertSeedSubstitutions();

  // Seed produce unit-conversion profiles (idempotent, preserves admin edits)
  await upsertProduceProfiles();

  const existingBudget = await Budget.findOne({
    userId: demoUser._id,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });
  if (!existingBudget) {
    await Budget.create({
      userId: demoUser._id,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      monthlyBudget: 30000,
      totalSpent: 2840,
      remainingBudget: 27160,
      wastedFoodCost: 0,
    });
  }

  const existingNotifications = await Notification.countDocuments({ userId: demoUser._id });
  if (existingNotifications === 0) {
    await Notification.create({
      userId: demoUser._id,
      title: 'Welcome to FoodieMind!',
      message: 'Your pantry is set up with sample items. Start exploring recipes!',
      type: 'general',
    });
    await Notification.create({
      userId: demoUser._id,
      title: 'Bread expiring soon!',
      message: 'Use your Bread within 1 day before it expires.',
      type: 'expiring_soon',
    });
  }

  console.log('Seed completed (non-destructive, safe to re-run).');
  console.log('Demo user: demo@moodmeal.com / Demo123!');
  console.log('Admin user: admin@moodmeal.com / Admin123!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
