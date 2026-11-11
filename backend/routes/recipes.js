const express = require('express');
const axios = require('axios');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const CookedRecipe = require('../models/CookedRecipe');
const ShoppingListItem = require('../models/ShoppingListItem');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const User = require('../models/User');
const RecommendationEvent = require('../models/RecommendationEvent');
const { auth } = require('../middleware/auth');
const { recommendRecipes, ingredientMatchesInventory, ingredientExactMatch } = require('../utils/recipeEngine');
const { deductQuantity, convertToBase, convertFromBase, canConvert, convertQuantity, normalizeUnit, formatConversionDisplay } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');
const { findSubstitutions, applySubstitution } = require('../services/substitutionService');
const IngredientSubstitution = require('../models/IngredientSubstitution');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');

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

    const substitutions = await IngredientSubstitution.find({ isActive: true }).lean();
    const recommendations = recommendRecipes(recipes, inventory, req.user, mood || null, ingredient || null, 20, substitutions);
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
      // Skip optional ingredients for requirement checking
      if (ing.isOptional) {
        ingredientCheck.push({
          name: ing.name,
          required: ing.quantity,
          unit: ing.unit,
          available: 0,
          unitAvailable: '',
          hasEnough: true,
          status: 'optional',
          isOptional: true
        });
        continue;
      }

      // Find all matching inventory items (not just the first one)
      const matchingItems = inventory.filter((item) => ingredientExactMatch(ing.name, item.name));
      
      // Filter out expired items and sort by expiry date (earliest first)
      const usableItems = matchingItems
        .filter((item) => {
          const { status } = getExpiryStatus(item.expiryDate);
          return status !== 'Expired';
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

      if (usableItems.length === 0) {
        ingredientCheck.push({
          name: ing.name,
          required: ing.quantity,
          unit: ing.unit,
          available: 0,
          unitAvailable: '',
          hasEnough: false,
          status: 'missing',
          missing: ing.quantity,
          conversionInfo: null
        });
        continue;
      }

      // Handle package content (e.g., bread packets)
      let effectiveUsableItems = usableItems;
      for (const item of usableItems) {
        if (item.unit === 'packets' && item.packageContent && item.packageContent.quantity) {
          // Create virtual item with unpacked quantity
          effectiveUsableItems = effectiveUsableItems.filter(i => i._id.toString() !== item._id.toString());
          effectiveUsableItems.push({
            ...item.toObject(),
            quantity: item.quantity * item.packageContent.quantity,
            unit: item.packageContent.unit,
            isVirtual: true,
            originalItemId: item._id
          });
        }
      }

      // Try to combine quantities from all usable items
      let totalAvailable = 0;
      let availableUnit = ing.unit; // Default to recipe unit
      let canCombine = true;
      let conversionInfo = null;
      let missingInfo = null;

      // Check if we can convert all items to recipe unit
      for (const item of effectiveUsableItems) {
        try {
          const normalizedItemUnit = normalizeUnit(item.unit);
          const normalizedRecipeUnit = normalizeUnit(ing.unit);
          
          // Try to convert item quantity to recipe unit
          const conversion = convertQuantity(item.quantity, normalizedItemUnit, normalizedRecipeUnit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack });
          
          if (!conversion.success) {
            canCombine = false;
            missingInfo = conversion.message;
            break;
          }
          
          totalAvailable += conversion.quantity;
          
          // Track conversion info for display
          if (conversion.isEstimate) {
            conversionInfo = {
              isEstimate: true,
              source: conversion.source,
              originalUnit: normalizedItemUnit,
              convertedUnit: normalizedRecipeUnit
            };
          }
        } catch (error) {
          canCombine = false;
          missingInfo = error.message;
          break;
        }
      }

      if (!canCombine) {
        ingredientCheck.push({
          name: ing.name,
          required: ing.quantity,
          unit: ing.unit,
          available: effectiveUsableItems[0].quantity,
          unitAvailable: effectiveUsableItems[0].unit,
          hasEnough: false,
          status: 'conversion_needed',
          missing: ing.quantity,
          conversionInfo: null,
          missingInfo
        });
        continue;
      }

      // Compare with required amount
      const hasEnough = totalAvailable >= ing.quantity;
      const missing = hasEnough ? 0 : ing.quantity - totalAvailable;

      // Calculate what will remain after cooking
      const remaining = hasEnough ? totalAvailable - ing.quantity : 0;

      // Build conversion display info for frontend
      let conversionDisplay = null;
      let requiredInOriginalUnit = null;
      if (conversionInfo && conversionInfo.isEstimate) {
        // Show original unit equivalent if it's a mass-volume conversion
        const originalItem = effectiveUsableItems[0];
        if (originalItem && originalItem.unit !== ing.unit) {
          const conversion = convertQuantity(ing.quantity, ing.unit, originalItem.unit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: originalItem.slicesPerLoaf, slicePack: originalItem.slicePack });
          if (conversion.success) {
            requiredInOriginalUnit = {
              quantity: Math.round(conversion.quantity * 1000) / 1000,
              unit: originalItem.unit
            };
            conversionDisplay = {
              isEstimate: true,
              source: conversionInfo.source,
              originalQuantity: originalItem.quantity,
              originalUnit: originalItem.unit,
              convertedQuantity: Math.round(totalAvailable * 100) / 100,
              convertedUnit: ing.unit
            };
          }
        }
      }

      ingredientCheck.push({
        name: ing.name,
        required: ing.quantity,
        unit: ing.unit,
        requiredInOriginalUnit,
        available: Math.round(totalAvailable * 100) / 100,
        unitAvailable: ing.unit,
        hasEnough,
        status: hasEnough ? 'available' : 'insufficient',
        missing: Math.round(missing * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        conversionInfo: conversionDisplay,
        missingInfo: null
      });
    }

    res.json({ ingredients: ingredientCheck });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check ingredients.', error: error.message });
  }
});

router.post('/:id/opened', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    // Track recipe opened event
    await RecommendationEvent.create({
      userId: req.userId,
      eventType: 'recipe_opened',
      recipeId: recipe._id,
      recipeName: recipe.name,
    });

    res.json({ message: 'Recipe open tracked' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to track recipe open.' });
  }
});

router.post('/:id/cooked', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    // Get custom servings and substitutions from request body
    const selectedServings = req.body.servings || recipe.servings;
    const acceptedSubstitutions = req.body.substitutions || [];
    const scaleFactor = selectedServings / recipe.servings;

    // Validate serving count is reasonable
    if (selectedServings < 1 || selectedServings > 50) {
      return res.status(400).json({ message: 'Invalid serving count. Must be between 1 and 50.' });
    }

    // Validate substitutions format
    if (acceptedSubstitutions && !Array.isArray(acceptedSubstitutions)) {
      return res.status(400).json({ message: 'Invalid substitutions format.' });
    }

    // Apply substitutions to recipe if any
    let workingRecipe = recipe;
    const substitutionResults = [];
    for (const sub of acceptedSubstitutions) {
      const IngredientSubstitution = require('../models/IngredientSubstitution');
      const substitution = await IngredientSubstitution.findById(sub.substitutionId);
      if (substitution) {
        const user = await User.findById(req.userId);
        const result = await applySubstitution(workingRecipe, substitution, user);
        if (result.success) {
          workingRecipe = result.updatedRecipe;
          substitutionResults.push({
            originalIngredient: sub.originalIngredient,
            substituteIngredient: sub.substituteIngredient,
            success: true
          });
        } else {
          // If substitution fails, include in response but don't block cooking
          substitutionResults.push({
            originalIngredient: sub.originalIngredient,
            substituteIngredient: sub.substituteIngredient,
            success: false,
            reason: result.reason
          });
        }
      }
    }

    // Reload inventory to get latest state
    const inventory = await FoodItem.find({ userId: req.userId });
    const shortages = [];

    // First pass: validate all ingredients are available in sufficient quantities
    for (const ing of workingRecipe.ingredients) {
      // Scale ingredient quantity based on custom servings
      const scaledQuantity = ing.quantity * scaleFactor;
      // Skip optional ingredients
      if (ing.isOptional) continue;

      const matchingItems = inventory.filter((item) => ingredientExactMatch(ing.name, item.name));
      const usableItems = matchingItems
        .filter((item) => {
          const { status } = getExpiryStatus(item.expiryDate);
          return status !== 'Expired';
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

      if (usableItems.length === 0) {
        shortages.push({
          ingredient: ing.name,
          required: scaledQuantity,
          unit: ing.unit,
          available: 0,
          reason: 'missing'
        });
        continue;
      }

      // Handle package content
      let effectiveUsableItems = usableItems;
      for (const item of usableItems) {
        if (item.unit === 'packets' && item.packageContent && item.packageContent.quantity) {
          effectiveUsableItems = effectiveUsableItems.filter(i => i._id.toString() !== item._id.toString());
          effectiveUsableItems.push({
            ...item.toObject(),
            quantity: item.quantity * item.packageContent.quantity,
            unit: item.packageContent.unit,
            isVirtual: true,
            originalItemId: item._id
          });
        }
      }

      // Check conversion and combine quantities
      let totalAvailable = 0;
      let hasConversionError = false;

      for (const item of effectiveUsableItems) {
        try {
          const normalizedItemUnit = normalizeUnit(item.unit);
          const normalizedRecipeUnit = normalizeUnit(ing.unit);
          const conversion = convertQuantity(item.quantity, normalizedItemUnit, normalizedRecipeUnit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack });
          
          if (!conversion.success) {
            hasConversionError = true;
            shortages.push({
              ingredient: ing.name,
              required: ing.quantity,
              unit: ing.unit,
              available: item.quantity,
              unitAvailable: item.unit,
              reason: 'conversion_needed',
              missingInfo: conversion.message
            });
            break;
          }
          
          totalAvailable += conversion.quantity;
        } catch (error) {
          hasConversionError = true;
          shortages.push({
            ingredient: ing.name,
            required: ing.quantity,
            unit: ing.unit,
            available: item.quantity,
            unitAvailable: item.unit,
            reason: 'conversion_error',
            missingInfo: error.message
          });
          break;
        }
      }

      if (hasConversionError) continue;

      // Compare with required amount
      if (totalAvailable < scaledQuantity) {
        shortages.push({
          ingredient: ing.name,
          required: scaledQuantity,
          unit: ing.unit,
          available: Math.round(totalAvailable * 100) / 100,
          unitAvailable: ing.unit,
          missing: Math.round((scaledQuantity - totalAvailable) * 100) / 100,
          reason: 'insufficient'
        });
      }
    }

    // If any shortages found, reject cooking
    if (shortages.length > 0) {
      return res.status(400).json({
        message: 'Insufficient ingredients to cook this recipe.',
        shortages,
        canCook: false
      });
    }

    // Second pass: actually deduct the ingredients (all are available)
    const ingredientsUsed = [];
    const addedToShoppingList = [];

    for (const ing of workingRecipe.ingredients) {
      // Skip optional ingredients
      if (ing.isOptional) continue;

      // Scale ingredient quantity based on custom servings
      const scaledQuantity = ing.quantity * scaleFactor;

      const matchingItems = inventory.filter((item) => ingredientExactMatch(ing.name, item.name));
      const usableItems = matchingItems
        .filter((item) => {
          const { status } = getExpiryStatus(item.expiryDate);
          return status !== 'Expired';
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

      // Handle package content
      let effectiveUsableItems = usableItems;
      for (const item of usableItems) {
        if (item.unit === 'packets' && item.packageContent && item.packageContent.quantity) {
          effectiveUsableItems = effectiveUsableItems.filter(i => i._id.toString() !== item._id.toString());
          effectiveUsableItems.push({
            ...item.toObject(),
            quantity: item.quantity * item.packageContent.quantity,
            unit: item.packageContent.unit,
            isVirtual: true,
            originalItemId: item._id
          });
        }
      }

      let remainingToDeduct = scaledQuantity;
      
      for (const item of effectiveUsableItems) {
        if (remainingToDeduct <= 0) break;

        try {
          const normalizedItemUnit = normalizeUnit(item.unit);
          const normalizedRecipeUnit = normalizeUnit(ing.unit);
          
          // Convert what we can deduct from this item
          const conversion = convertQuantity(item.quantity, normalizedItemUnit, normalizedRecipeUnit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack });
          if (!conversion.success) continue;
          
          const availableInRecipeUnit = conversion.quantity;
          const deductAmount = Math.min(remainingToDeduct, availableInRecipeUnit);
          
          // Convert back to item's unit for deduction
          const reverseConversion = convertQuantity(deductAmount, normalizedRecipeUnit, normalizedItemUnit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack });
          if (!reverseConversion.success) continue;
          
          const deductInItemUnit = reverseConversion.quantity;
          const result = deductQuantity(item.quantity, normalizedItemUnit, deductInItemUnit, normalizedItemUnit, ing.name, { size: ing.size, form: ing.form, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack });
          
          // Handle virtual items (from package content)
          if (item.isVirtual) {
            const originalItem = await FoodItem.findById(item.originalItemId);
            if (originalItem) {
              // Calculate how many packets were used
              const packetsUsed = Math.ceil(deductInItemUnit / item.packageContent.quantity);
              const remainingPackets = originalItem.quantity - packetsUsed;
              
              if (remainingPackets <= 0) {
                await FoodItem.findByIdAndDelete(originalItem._id);
                const existing = await ShoppingListItem.findOne({
                  userId: req.userId,
                  name: { $regex: new RegExp(`^${originalItem.name}$`, 'i') },
                  status: 'Pending',
                });
                if (!existing) {
                  await ShoppingListItem.create({
                    userId: req.userId,
                    name: originalItem.name,
                    quantity: 1,
                    unit: originalItem.unit,
                    source: 'consumed',
                    priority: 'Medium',
                  });
                  addedToShoppingList.push(originalItem.name);
                }
              } else {
                originalItem.quantity = remainingPackets;
                await originalItem.save();
              }
            }
          } else {
            // Regular item deduction
            if (result.isEmpty) {
              await FoodItem.findByIdAndDelete(item._id);
              const existing = await ShoppingListItem.findOne({
                userId: req.userId,
                name: { $regex: new RegExp(`^${item.name}$`, 'i') },
                status: 'Pending',
              });
              if (!existing) {
                await ShoppingListItem.create({
                  userId: req.userId,
                  name: item.name,
                  quantity: 1,
                  unit: item.unit,
                  source: 'consumed',
                  priority: 'Medium',
                });
                addedToShoppingList.push(item.name);
              }
            } else {
              item.quantity = result.quantity;
              await item.save();
            }
          }

          ingredientsUsed.push({ name: item.name, quantity: deductAmount, unit: ing.unit });

          // Record consumption
          const consumedBase = convertToBase(deductAmount, ing.unit);
          const pricePerBase = item.baseQuantity > 0 ? item.price / item.baseQuantity : 0;

          await ConsumptionRecord.create({
            userId: req.userId,
            foodId: item._id,
            foodName: item.name,
            consumedQuantity: deductAmount,
            consumedUnit: ing.unit,
            priceValue: Math.round(pricePerBase * consumedBase.quantity * 100) / 100,
          });

          remainingToDeduct -= deductAmount;
        } catch (e) {
          console.error('Error deducting ingredient:', e);
        }
      }
    }

    await CookedRecipe.create({
      userId: req.userId,
      recipeId: recipe._id,
      recipeName: recipe.name,
      recipeSource: recipe.source,
      isAIGenerated: recipe.isAIGenerated,
      ingredientsUsed,
      recipeSnapshot: {
        name: workingRecipe.name,
        mealType: workingRecipe.mealType,
        ingredients: workingRecipe.ingredients,
        preparation: workingRecipe.preparation,
        dietaryType: workingRecipe.dietaryType,
        cookingTime: workingRecipe.cookingTime,
        difficulty: workingRecipe.difficulty,
      },
      servings: selectedServings,
      substitutionsUsed: acceptedSubstitutions.map(sub => ({
        originalIngredient: sub.originalIngredient,
        substituteIngredient: sub.substituteIngredient,
        substitutionId: sub.substitutionId,
      })),
    });

    // Track recipe cooked event
    await RecommendationEvent.create({
      userId: req.userId,
      eventType: 'recipe_cooked',
      recipeId: recipe._id,
      recipeName: recipe.name,
      servings: selectedServings,
      substitutionsUsed: acceptedSubstitutions.map(sub => ({
        originalIngredient: sub.originalIngredient,
        substituteIngredient: sub.substituteIngredient,
      })),
    });

    res.json({
      message: 'Yay! Recipe cooked and pantry updated.',
      ingredientsUsed,
      addedToShoppingList,
      canCook: true,
      substitutions: substitutionResults,
      servingsCooked: selectedServings,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark recipe as cooked.', error: error.message });
  }
});

// Substitution endpoints
router.get('/:id/substitutions', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    const inventory = await FoodItem.find({ userId: req.userId });
    const user = await User.findById(req.userId).lean();
    const substitutions = await IngredientSubstitution.find({ isActive: true }).lean();

    // Quantity-aware three-state matching: only genuinely MISSING ingredients
    // need substitution suggestions.
    const pantry = matchIngredientRequirements(recipe, inventory, {
      substitutions,
      userAllergies: user?.allergies || [],
    });
    const missingIngredients = pantry.results
      .filter((r) => r.status === 'MISSING')
      .map((r) => ({ name: r.name, quantity: r.required, unit: r.unit }));

    const substitutionOptions = await findSubstitutions(missingIngredients, inventory, recipe.mealType);

    res.json({
      missingIngredients,
      substitutions: substitutionOptions,
      ingredientStatuses: pantry.results,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to find substitutions.', error: error.message });
  }
});

router.post('/:id/apply-substitution', async (req, res) => {
  try {
    const { substitutionId } = req.body;
    const recipe = await Recipe.findById(req.params.id);
    const user = await User.findById(req.userId);
    
    if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });

    const IngredientSubstitution = require('../models/IngredientSubstitution');
    const substitution = await IngredientSubstitution.findById(substitutionId);
    
    if (!substitution) {
      return res.status(404).json({ message: 'Substitution not found.' });
    }

    const result = await applySubstitution(recipe, substitution, user);

    if (!result.success) {
      return res.status(400).json({ message: result.reason });
    }

    res.json({
      message: 'Substitution applied successfully',
      updatedRecipe: result.updatedRecipe,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to apply substitution.', error: error.message });
  }
});

module.exports = router;
