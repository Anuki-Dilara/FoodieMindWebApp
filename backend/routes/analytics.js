const express = require('express');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const FoodItem = require('../models/FoodItem');
const CookedRecipe = require('../models/CookedRecipe');
const Budget = require('../models/Budget');
const { auth } = require('../middleware/auth');
const { getExpiryStatus } = require('../utils/expiryHelper');

const router = express.Router();

router.use(auth);

router.get('/summary', async (req, res) => {
  try {
    const userId = req.userId;
    const inventory = await FoodItem.find({ userId });
    const consumption = await ConsumptionRecord.find({ userId }).sort({ consumedDate: -1 }).limit(50);
    const cooked = await CookedRecipe.find({ userId }).sort({ cookedDate: -1 }).limit(20);

    const now = new Date();
    const budget = await Budget.findOne({ userId, month: now.getMonth() + 1, year: now.getFullYear() });

    const categoryBreakdown = {};
    inventory.forEach((item) => {
      categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + 1;
    });

    let expiringSoon = 0;
    let expired = 0;
    inventory.forEach((item) => {
      const { status } = getExpiryStatus(item.expiryDate);
      if (status === 'Use Soon') expiringSoon++;
      if (status === 'Expired') expired++;
    });

    const consumedMap = {};
    consumption.forEach((c) => {
      consumedMap[c.foodName] = (consumedMap[c.foodName] || 0) + 1;
    });
    const mostConsumed = Object.entries(consumedMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    res.json({
      totalInventory: inventory.length,
      expiringSoon,
      expired,
      categoryBreakdown,
      mostConsumed,
      recentConsumption: consumption.slice(0, 10),
      cookedRecipes: cooked,
      budget: budget || { monthlyBudget: 0, totalSpent: 0, remainingBudget: 0, wastedFoodCost: 0 },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch analytics summary.' });
  }
});

router.get('/consumption', async (req, res) => {
  try {
    const records = await ConsumptionRecord.find({ userId: req.userId }).sort({ consumedDate: -1 });
    const byMonth = {};
    records.forEach((r) => {
      const key = `${r.consumedDate.getFullYear()}-${r.consumedDate.getMonth() + 1}`;
      byMonth[key] = (byMonth[key] || 0) + 1;
    });
    res.json({ records, byMonth });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch consumption data.' });
  }
});

router.get('/waste', async (req, res) => {
  try {
    const items = await FoodItem.find({ userId: req.userId });
    const wasted = items.filter((item) => getExpiryStatus(item.expiryDate).status === 'Expired');
    const wasteByCategory = {};
    wasted.forEach((item) => {
      wasteByCategory[item.category] = (wasteByCategory[item.category] || 0) + (item.price || 0);
    });
    res.json({
      wastedItems: wasted.map((i) => ({ name: i.name, price: i.price, expiryDate: i.expiryDate })),
      totalWasteValue: wasted.reduce((s, i) => s + (i.price || 0), 0),
      wasteByCategory,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch waste data.' });
  }
});

router.get('/budget', async (req, res) => {
  try {
    const budgets = await Budget.find({ userId: req.userId }).sort({ year: -1, month: -1 });
    res.json({ budgets });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch budget analytics.' });
  }
});

module.exports = router;
