const express = require('express');
const axios = require('axios');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const CookedRecipe = require('../models/CookedRecipe');
const ShoppingListItem = require('../models/ShoppingListItem');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const { auth } = require('../middleware/auth');
const { recommendRecipes, ingredientMatchesInventory, ingredientExactMatch } = require('../utils/recipeEngine');
const { deductQuantity, convertToBase, canConvert } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const recipes = await Recipe.find().sort({ name: 1 });
    res.json({ recipes });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch recipes.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const recipe = await Recipe.create(req.body);
    res.status(201).json({ message: 'Recipe created!', recipe });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create recipe.' });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const { mood, ingredient } = req.query;
    const inventory = await FoodItem.find({ userId: req.userId });
    let recipes = await Recipe.find();

    // Optional: fetch from Spoonacular API if key is set
    if (process.env.SPOONACULAR_API_KEY && process.env.SPOONACULAR_API_KEY !== 'your_spoonacular_api_key') {
      try {
        const ingredients = inventory.map((i) => i.name).join(',');
        const response = await axios.get('https://api.spoonacular.com/recipes/findByIngredients', {
          params: {
            ingredients,
            number: 5,
            apiKey: process.env.SPOONACULAR_API_KEY,
          },
          timeout: 5000,
        });
        // Spoonacular results can supplement local recipes (future AI integration point)
        if (response.data?.length) {
          console.log(`Spoonacular returned ${response.data.length} recipes`);
        }
      } catch (apiErr) {
        // Fallback to local/TheMealDB-style rule-based engine
        console.log('Spoonacular unavailable, using local recommendations');
      }
    }

    const recommendations = recommendRecipes(recipes, inventory, req.user, mood || null, ingredient || null);
    res.json({ recommendations, source: 'rule-based' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get recommendations.', error: error.message });
  }
});

router.get('/:id/ingredient-check', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    const inventory = await FoodItem.find({ userId: req.userId });
    const ingredientCheck = [];

    for (const ing of recipe.ingredients) {
      const invItem = inventory.find((item) => ingredientExactMatch(ing.name, item.name));
      
      if (!invItem) {
        ingredientCheck.push({
          name: ing.name,
          required: ing.quantity,
          unit: ing.unit,
          available: 0,
          unitAvailable: '',
          hasEnough: false,
          status: 'missing'
        });
      } else {
        // Check if item is expired
        const { status } = getExpiryStatus(invItem.expiryDate);
        if (status === 'Expired') {
          ingredientCheck.push({
            name: ing.name,
            required: ing.quantity,
            unit: ing.unit,
            available: 0,
            unitAvailable: invItem.unit,
            hasEnough: false,
            status: 'expired'
          });
        } else {
          // Check quantity compatibility
          try {
            if (canConvert(invItem.unit, ing.unit)) {
              const result = deductQuantity(invItem.quantity, invItem.unit, ing.quantity, ing.unit);
              ingredientCheck.push({
                name: ing.name,
                required: ing.quantity,
                unit: ing.unit,
                available: invItem.quantity,
                unitAvailable: invItem.unit,
                hasEnough: !result.isEmpty,
                status: result.isEmpty ? 'insufficient' : 'available'
              });
            } else {
              // Incompatible units
              ingredientCheck.push({
                name: ing.name,
                required: ing.quantity,
                unit: ing.unit,
                available: invItem.quantity,
                unitAvailable: invItem.unit,
                hasEnough: false,
                status: 'incompatible'
              });
            }
          } catch (error) {
            ingredientCheck.push({
              name: ing.name,
              required: ing.quantity,
              unit: ing.unit,
              available: invItem.quantity,
              unitAvailable: invItem.unit,
              hasEnough: false,
              status: 'error'
            });
          }
        }
      }
    }

    res.json({ ingredients: ingredientCheck });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check ingredients.', error: error.message });
  }
});

router.post('/:id/cooked', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    const inventory = await FoodItem.find({ userId: req.userId });
    const ingredientsUsed = [];
    const addedToShoppingList = [];

    for (const ing of recipe.ingredients) {
      const invItem = inventory.find((item) => ingredientExactMatch(ing.name, item.name));
      if (!invItem) {
        // Add missing ingredient to shopping list
        const existing = await ShoppingListItem.findOne({
          userId: req.userId,
          name: { $regex: new RegExp(`^${ing.name}$`, 'i') },
          status: 'Pending',
        });
        if (!existing) {
          await ShoppingListItem.create({
            userId: req.userId,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            source: 'recipe',
            priority: 'Medium',
          });
          addedToShoppingList.push(ing.name);
        }
        continue;
      }

      // Check if item is expired
      const { status } = getExpiryStatus(invItem.expiryDate);
      if (status === 'Expired') {
        // Add expired item to shopping list
        const existing = await ShoppingListItem.findOne({
          userId: req.userId,
          name: { $regex: new RegExp(`^${ing.name}$`, 'i') },
          status: 'Pending',
        });
        if (!existing) {
          await ShoppingListItem.create({
            userId: req.userId,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            source: 'recipe',
            priority: 'Medium',
          });
          addedToShoppingList.push(ing.name);
        }
        continue;
      }

      try {
        const result = deductQuantity(invItem.quantity, invItem.unit, ing.quantity, ing.unit);
        ingredientsUsed.push({ name: ing.name, quantity: ing.quantity, unit: ing.unit });

        const consumedBase = convertToBase(ing.quantity, ing.unit);
        const pricePerBase = invItem.baseQuantity > 0 ? invItem.price / invItem.baseQuantity : 0;

        await ConsumptionRecord.create({
          userId: req.userId,
          foodId: invItem._id,
          foodName: invItem.name,
          consumedQuantity: ing.quantity,
          consumedUnit: ing.unit,
          priceValue: Math.round(pricePerBase * consumedBase.quantity * 100) / 100,
        });

        if (result.isEmpty) {
          await FoodItem.findByIdAndDelete(invItem._id);
          const existing = await ShoppingListItem.findOne({
            userId: req.userId,
            name: { $regex: new RegExp(`^${invItem.name}$`, 'i') },
            status: 'Pending',
          });
          if (!existing) {
            await ShoppingListItem.create({
              userId: req.userId,
              name: invItem.name,
              quantity: 1,
              unit: invItem.unit,
              source: 'consumed',
              priority: 'Medium',
            });
            addedToShoppingList.push(invItem.name);
          }
        } else {
          invItem.quantity = result.quantity;
          invItem.unit = result.unit;
          invItem.baseQuantity = result.baseQuantity;
          invItem.baseUnit = result.baseUnit;
          await invItem.save();
        }
      } catch (e) {
        // Add incompatible unit items to shopping list
        const existing = await ShoppingListItem.findOne({
          userId: req.userId,
          name: { $regex: new RegExp(`^${ing.name}$`, 'i') },
          status: 'Pending',
        });
        if (!existing) {
          await ShoppingListItem.create({
            userId: req.userId,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            source: 'recipe',
            priority: 'Medium',
          });
          addedToShoppingList.push(ing.name);
        }
      }
    }

    await CookedRecipe.create({
      userId: req.userId,
      recipeId: recipe._id,
      recipeName: recipe.name,
      ingredientsUsed,
    });

    res.json({
      message: 'Yay! Recipe cooked and pantry updated.',
      ingredientsUsed,
      addedToShoppingList,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark recipe as cooked.', error: error.message });
  }
});

module.exports = router;
