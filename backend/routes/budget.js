const express = require('express');
const Budget = require('../models/Budget');
const FoodItem = require('../models/FoodItem');
const ShoppingListItem = require('../models/ShoppingListItem');
const { auth } = require('../middleware/auth');
const { getExpiryStatus } = require('../utils/expiryHelper');

const router = express.Router();

router.use(auth);

async function getOrCreateBudget(userId) {
  const now = new Date();
  let budget = await Budget.findOne({ userId, month: now.getMonth() + 1, year: now.getFullYear() });
  if (!budget) {
    budget = await Budget.create({
      userId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      monthlyBudget: 30000,
      totalSpent: 0,
      remainingBudget: 30000,
      wastedFoodCost: 0,
    });
  }
  return budget;
}

router.get('/', async (req, res) => {
  try {
    const budget = await getOrCreateBudget(req.userId);
    res.json({ budget });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch budget.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const budget = await getOrCreateBudget(req.userId);
    if (req.body.monthlyBudget !== undefined) {
      budget.monthlyBudget = req.body.monthlyBudget;
      budget.remainingBudget = budget.monthlyBudget - budget.totalSpent;
    }
    await budget.save();
    res.json({ message: 'Budget set successfully!', budget });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set budget.' });
  }
});

router.put('/', async (req, res) => {
  try {
    const budget = await getOrCreateBudget(req.userId);
    if (req.body.monthlyBudget !== undefined) {
      budget.monthlyBudget = req.body.monthlyBudget;
      budget.remainingBudget = budget.monthlyBudget - budget.totalSpent;
    }
    if (req.body.totalSpent !== undefined) budget.totalSpent = req.body.totalSpent;
    if (req.body.wastedFoodCost !== undefined) budget.wastedFoodCost = req.body.wastedFoodCost;
    budget.remainingBudget = budget.monthlyBudget - budget.totalSpent;
    await budget.save();
    res.json({ message: 'Budget updated!', budget });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update budget.' });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const budget = await getOrCreateBudget(req.userId);

    const shoppingItems = await ShoppingListItem.find({ userId: req.userId, status: 'Pending' });
    const shoppingListEstimate = shoppingItems.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);

    const expiredItems = await FoodItem.find({ userId: req.userId });
    let wastedValue = 0;
    expiredItems.forEach((item) => {
      const { status } = getExpiryStatus(item.expiryDate);
      if (status === 'Expired') wastedValue += item.price || 0;
    });

    budget.wastedFoodCost = wastedValue;
    await budget.save();

    const usagePercent = budget.monthlyBudget > 0
      ? Math.round((budget.totalSpent / budget.monthlyBudget) * 100)
      : 0;

    res.json({
      monthlyBudget: budget.monthlyBudget,
      totalSpent: budget.totalSpent,
      remainingBudget: budget.remainingBudget,
      shoppingListEstimate,
      wastedFoodCost: wastedValue,
      usagePercent,
      budgetWarning: usagePercent >= 80,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch budget summary.' });
  }
});

module.exports = router;
