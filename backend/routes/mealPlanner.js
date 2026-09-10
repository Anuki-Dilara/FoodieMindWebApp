const express = require('express');
const MealPlan = require('../models/MealPlan');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const ShoppingListItem = require('../models/ShoppingListItem');
const { auth } = require('../middleware/auth');
const { ingredientMatchesInventory } = require('../utils/recipeEngine');

const router = express.Router();

router.use(auth);

async function computeMissingIngredients(recipeId, userId) {
  const recipe = await Recipe.findById(recipeId);
  if (!recipe) return [];
  const inventory = await FoodItem.find({ userId });
  return recipe.ingredients
    .filter((ing) => !ingredientMatchesInventory(ing.name, inventory))
    .map((ing) => ing.name);
}

router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { userId: req.userId };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const meals = await MealPlan.find(filter).sort({ date: 1 });
    res.json({ meals });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch meal plans.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { recipeId, date, mealType } = req.body;
    const recipe = await Recipe.findById(recipeId);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    const missingIngredients = await computeMissingIngredients(recipeId, req.userId);
    const estimatedCost = missingIngredients.length * 200;

    const meal = await MealPlan.create({
      userId: req.userId,
      recipeId,
      recipeName: recipe.name,
      date: new Date(date),
      mealType,
      missingIngredients,
      estimatedCost,
    });

    for (const ing of missingIngredients) {
      const exists = await ShoppingListItem.findOne({
        userId: req.userId,
        name: { $regex: new RegExp(`^${ing}$`, 'i') },
        status: 'Pending',
      });
      if (!exists) {
        await ShoppingListItem.create({
          userId: req.userId,
          name: ing,
          quantity: 1,
          unit: 'pieces',
          source: 'meal-plan',
          priority: 'High',
        });
      }
    }

    res.status(201).json({ message: 'Meal planned!', meal });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create meal plan.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const meal = await MealPlan.findOne({ _id: req.params.id, userId: req.userId });
    if (!meal) return res.status(404).json({ message: 'Meal plan not found.' });

    if (req.body.date) meal.date = new Date(req.body.date);
    if (req.body.mealType) meal.mealType = req.body.mealType;
    if (req.body.recipeId) {
      meal.recipeId = req.body.recipeId;
      const recipe = await Recipe.findById(req.body.recipeId);
      if (recipe) meal.recipeName = recipe.name;
      meal.missingIngredients = await computeMissingIngredients(req.body.recipeId, req.userId);
    }

    await meal.save();
    res.json({ message: 'Meal plan updated!', meal });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update meal plan.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const meal = await MealPlan.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!meal) return res.status(404).json({ message: 'Meal plan not found.' });
    res.json({ message: 'Meal removed from planner.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete meal plan.' });
  }
});

router.get('/missing-ingredients', async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const meals = await MealPlan.find({
      userId: req.userId,
      date: { $gte: targetDate, $lt: nextDay },
    });

    const allMissing = [];
    for (const meal of meals) {
      allMissing.push(...(meal.missingIngredients || []));
    }

    res.json({ missingIngredients: [...new Set(allMissing)], meals });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check missing ingredients.' });
  }
});

module.exports = router;
