const Notification = require('../models/Notification');
const FoodItem = require('../models/FoodItem');
const MealPlan = require('../models/MealPlan');
const Recipe = require('../models/Recipe');
const Budget = require('../models/Budget');
const ShoppingListItem = require('../models/ShoppingListItem');
const { getExpiryStatus } = require('./expiryHelper');
const { ingredientMatchesInventory } = require('./recipeEngine');

async function createNotification(userId, title, message, type = 'general') {
  return Notification.create({ userId, title, message, type });
}

async function checkExpiringFood(userId) {
  const items = await FoodItem.find({ userId });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const item of items) {
    const { status, daysLeft } = getExpiryStatus(item.expiryDate);
    item.status = status;
    await item.save();

    const existingNotif = await Notification.findOne({
      userId,
      type: status === 'Expired' ? 'expired' : 'expiring_soon',
      message: { $regex: item.name, $options: 'i' },
      createdAt: { $gte: today },
    });

    if (existingNotif) continue;

    if (status === 'Expired') {
      await createNotification(
        userId,
        `${item.name} has expired!`,
        `Your ${item.name} expired ${Math.abs(daysLeft)} day(s) ago. Consider removing it from your pantry.`,
        'expired'
      );
    } else if (status === 'Use Soon') {
      await createNotification(
        userId,
        `${item.name} expiring soon!`,
        `Use your ${item.name} within ${daysLeft} day(s) before it expires.`,
        'expiring_soon'
      );
    }
  }
}

async function checkMissingIngredientsForTomorrow(userId) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const plannedMeals = await MealPlan.find({
    userId,
    date: { $gte: tomorrow, $lt: dayAfter },
  }).populate('recipeId');

  if (plannedMeals.length === 0) return;

  const inventory = await FoodItem.find({ userId });
  const allMissing = [];

  for (const meal of plannedMeals) {
    const recipe = meal.recipeId || await Recipe.findById(meal.recipeId);
    if (!recipe) continue;

    const missing = [];
    recipe.ingredients.forEach((ing) => {
      if (!ingredientMatchesInventory(ing.name, inventory)) {
        missing.push(ing.name);
      }
    });

    if (missing.length > 0) {
      allMissing.push(...missing);
      meal.missingIngredients = missing;
      await meal.save();

      for (const ing of missing) {
        const exists = await ShoppingListItem.findOne({
          userId,
          name: { $regex: new RegExp(`^${ing}$`, 'i') },
          status: 'Pending',
        });
        if (!exists) {
          await ShoppingListItem.create({
            userId,
            name: ing,
            quantity: 1,
            unit: 'pieces',
            source: 'meal-plan',
            priority: 'High',
          });
        }
      }
    }
  }

  if (allMissing.length > 0) {
    const unique = [...new Set(allMissing)];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await Notification.findOne({
      userId,
      type: 'missing_ingredients',
      createdAt: { $gte: today },
    });

    if (!existing) {
      await createNotification(
        userId,
        'Missing ingredients for tomorrow!',
        `You do not have ${unique.join(' and ')} needed to cook tomorrow's planned meal.`,
        'missing_ingredients'
      );
    }
  }
}

async function checkBudgetWarning(userId) {
  const now = new Date();
  const budget = await Budget.findOne({ userId, month: now.getMonth() + 1, year: now.getFullYear() });
  if (!budget || budget.monthlyBudget === 0) return;

  const usagePercent = ((budget.totalSpent / budget.monthlyBudget) * 100);
  if (usagePercent >= 80) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await Notification.findOne({
      userId,
      type: 'budget_warning',
      createdAt: { $gte: today },
    });
    if (!existing) {
      await createNotification(
        userId,
        'Budget alert!',
        `You've used ${Math.round(usagePercent)}% of your monthly grocery budget. Remaining: LKR ${budget.remainingBudget.toLocaleString()}.`,
        'budget_warning'
      );
    }
  }
}

async function runDailyChecks(userId) {
  await checkExpiringFood(userId);
  await checkMissingIngredientsForTomorrow(userId);
  await checkBudgetWarning(userId);
}

module.exports = {
  createNotification,
  checkExpiringFood,
  checkMissingIngredientsForTomorrow,
  checkBudgetWarning,
  runDailyChecks,
};
