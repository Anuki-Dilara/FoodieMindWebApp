const express = require('express');
const User = require('../models/User');
const Recipe = require('../models/Recipe');
const Notification = require('../models/Notification');
const FoodItem = require('../models/FoodItem');
const MealPlan = require('../models/MealPlan');
const ShoppingListItem = require('../models/ShoppingListItem');
const Budget = require('../models/Budget');
const { adminAuth } = require('../middleware/auth');

const router = express.Router();

router.use(adminAuth);

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ users, count: users.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [userCount, recipeCount, foodCount, mealCount, notifCount] = await Promise.all([
      User.countDocuments(),
      Recipe.countDocuments(),
      FoodItem.countDocuments(),
      MealPlan.countDocuments(),
      Notification.countDocuments(),
    ]);
    res.json({ userCount, recipeCount, foodCount, mealCount, notifCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

router.post('/recipes', async (req, res) => {
  try {
    const recipe = await Recipe.create(req.body);
    res.status(201).json({ recipe });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create recipe.' });
  }
});

router.put('/recipes/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });
    res.json({ recipe });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update recipe.' });
  }
});

router.delete('/recipes/:id', async (req, res) => {
  try {
    await Recipe.findByIdAndDelete(req.params.id);
    res.json({ message: 'Recipe deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete recipe.' });
  }
});

router.get('/recipes', async (req, res) => {
  try {
    const recipes = await Recipe.find().sort({ name: 1 });
    res.json({ recipes });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch recipes.' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(100);
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user.' });
  }
});

module.exports = router;
