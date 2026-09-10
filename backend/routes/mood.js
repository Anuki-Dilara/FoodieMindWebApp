const express = require('express');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const { auth } = require('../middleware/auth');
const { recommendRecipes } = require('../utils/recipeEngine');

const router = express.Router();

router.use(auth);

router.post('/recommendations', async (req, res) => {
  try {
    const { mood } = req.body;
    if (!mood) {
      return res.status(400).json({ message: 'Please select a mood.' });
    }

    const inventory = await FoodItem.find({ userId: req.userId });
    const recipes = await Recipe.find();
    const recommendations = recommendRecipes(recipes, inventory, req.user, mood);

    res.json({
      mood,
      recommendations,
      message: `Here are meals perfect for when you're feeling ${mood.toLowerCase()}!`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get mood recommendations.' });
  }
});

module.exports = router;
