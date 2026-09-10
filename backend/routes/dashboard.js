const express = require('express');
const FoodItem = require('../models/FoodItem');
const ShoppingListItem = require('../models/ShoppingListItem');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const Recipe = require('../models/Recipe');
const MealPlan = require('../models/MealPlan');
const { auth } = require('../middleware/auth');
const { getExpiryStatus } = require('../utils/expiryHelper');
const { recommendRecipes } = require('../utils/recipeEngine');
const { runDailyChecks } = require('../utils/notificationService');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    await runDailyChecks(req.userId);

    const [inventory, shoppingItems, budgetDoc, notifications, recipes] = await Promise.all([
      FoodItem.find({ userId: req.userId }).sort({ expiryDate: 1 }),
      ShoppingListItem.find({ userId: req.userId, status: 'Pending' }),
      Budget.findOne({ userId: req.userId, month: new Date().getMonth() + 1, year: new Date().getFullYear() }),
      Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(5),
      Recipe.find(),
    ]);

    const enriched = inventory.map((item) => {
      const { status, daysLeft } = getExpiryStatus(item.expiryDate);
      return { ...item.toObject(), status, daysLeft };
    });

    const expiringSoon = enriched.filter((i) => i.status === 'Use Soon' || i.status === 'Expired');
    const expired = enriched.filter((i) => i.status === 'Expired');
    const fresh = enriched.filter((i) => i.status === 'Fresh');

    const recommendations = recommendRecipes(recipes, inventory, req.user, null, 5);

    let wastedValue = 0;
    expired.forEach((i) => { wastedValue += i.price || 0; });

    const budget = budgetDoc || {
      monthlyBudget: 30000,
      totalSpent: 0,
      remainingBudget: 30000,
      wastedFoodCost: wastedValue,
    };

    const shoppingEstimate = shoppingItems.reduce((s, i) => s + (i.estimatedPrice || 0), 0);

    res.json({
      welcomeMessage: `Your pantry looks happy today, ${req.user.fullName.split(' ')[0]}!`,
      summary: {
        totalInventory: inventory.length,
        expiringSoon: enriched.filter((i) => i.status === 'Use Soon').length,
        expired: expired.length,
        shoppingListItems: shoppingItems.length,
        monthlyBudget: budget.monthlyBudget,
        remainingBudget: budget.remainingBudget,
        wastedFoodCost: wastedValue,
        shoppingEstimate,
      },
      soonUse: expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft),
      topRecommendations: recommendations,
      latestNotifications: notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
      wasteChart: {
        consumed: enriched.length - expired.length,
        wasted: expired.length,
        fresh: fresh.length,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load dashboard.', error: error.message });
  }
});

module.exports = router;
