const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const FoodItem = require('../models/FoodItem');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const { getMoodRecommendations } = require('../utils/moodRecommendationEngine');
const { generatePantryRecipes } = require('../services/pantryExplorerService');
const { getProvider, isExplorerEnabled } = require('../services/aiProvider');

router.use(auth);

// In-flight generation guard — one AI request per user at a time.
const inFlight = new Map(); // userId -> Promise

const MOOD_IDS = ['Happy', 'Tired', 'Sick', 'Stressed', 'Energetic', 'Lazy', 'Sad', 'Hungry'];

function aiErrorStatus(code) {
  if (code === 'AI_DISABLED' || code === 'AI_UNAVAILABLE') return 503;
  if (code === 'AI_TIMEOUT') return 504;
  return 500;
}

// POST /api/ai/pantry-explorer
// Body: { moods: ['Hungry'], filters: {...same shape as /mood/recommendations} }
// Runs the existing mood engine first; AI only activates when NO existing
// recipe is pantry-complete for the selected mood(s).
router.post('/pantry-explorer', async (req, res) => {
  try {
    const { moods = [], filters = {} } = req.body || {};
    if (!Array.isArray(moods) || moods.length === 0) {
      return res.status(400).json({ message: 'Please select at least one mood.' });
    }
    if (moods.length > 2) {
      return res.status(400).json({ message: 'You can select up to 2 moods.' });
    }
    const bad = moods.find((m) => !MOOD_IDS.includes(m));
    if (bad) return res.status(400).json({ message: `Unknown mood: ${bad}` });

    if (!isExplorerEnabled()) {
      return res.status(503).json({
        code: 'AI_DISABLED',
        message: 'AI Pantry Explorer is not enabled on this server.',
      });
    }

    // Duplicate-generation prevention: same user already generating.
    if (inFlight.has(req.userId.toString())) {
      return res.status(409).json({
        code: 'GENERATION_IN_PROGRESS',
        message: 'A pantry exploration is already running. Please wait for it to finish.',
      });
    }

    const run = (async () => {
      // STEP 2-5: real pantry + existing engine — AI is a fallback only.
      const inventory = await FoodItem.find({ userId: req.userId });
      const recipes = await Recipe.find();
      const existing = await getMoodRecommendations(recipes, inventory, req.user, moods, filters || {});
      const pantryComplete = (existing.readyToCook || []).length;

      if (pantryComplete > 0) {
        return {
          activated: false,
          reason: 'existing-recipes',
          readyToCookCount: pantryComplete,
          message: 'Existing recipes already match your mood and pantry.',
        };
      }

      const result = await generatePantryRecipes({
        userId: req.userId,
        moods,
        filters: filters || {},
        FoodItem,
        User,
      });

      const provider = getProvider();
      return {
        activated: true,
        provider: provider.name,
        model: process.env.OLLAMA_MODEL || 'qwen3.5:2b',
        recipes: result.recipes,
        rejections: result.rejections,
        approvedIngredientCount: result.approvedCount,
        exhausted: result.exhausted === true,
        message: result.message || (result.recipes.length
          ? `AI explored ${result.approvedCount} pantry ingredients and created ${result.recipes.length} pantry-verified recipe(s).`
          : 'AI could not produce a pantry-valid recipe this time.'),
      };
    })();

    inFlight.set(req.userId.toString(), run);
    try {
      const out = await run;
      res.json(out);
    } finally {
      inFlight.delete(req.userId.toString());
    }
  } catch (error) {
    console.error('AI pantry explorer error:', error.code || '', error.message);
    const status = aiErrorStatus(error.code);
    res.status(status).json({
      code: error.code || 'AI_ERROR',
      message: error.message || 'AI Pantry Explorer failed.',
    });
  }
});

// POST /api/ai/pantry-explorer/save
// Persist a generated recipe for the authenticated user only.
router.post('/pantry-explorer/save', async (req, res) => {
  try {
    const { recipe } = req.body || {};
    if (!recipe || typeof recipe !== 'object' || !recipe.name) {
      return res.status(400).json({ message: 'Recipe payload is required.' });
    }

    const VALID_FORMS = ['whole', 'chopped', 'diced', 'sliced', 'grated', 'shredded', 'mashed'];
    const VALID_SIZES = ['xs', 's', 'm', 'l', 'xl'];

    const doc = await Recipe.create({
      name: String(recipe.name).slice(0, 80),
      description: String(recipe.description || '').slice(0, 500),
      ingredients: (recipe.ingredients || []).slice(0, 12).map((i) => ({
        name: String(i.name || '').slice(0, 80),
        quantity: Number(i.quantity) || 1,
        unit: String(i.unit || 'pieces').slice(0, 20),
        size: VALID_SIZES.includes(i.size) ? i.size : null,
        form: VALID_FORMS.includes(i.form) ? i.form : null,
        isOptional: false,
      })),
      instructions: (recipe.instructions || []).map((s) => String(s).slice(0, 400)).slice(0, 10),
      cookingTime: Math.max(1, Math.round(Number(recipe.cookingTime ?? recipe.totalTime) || 30)),
      servings: Math.max(1, Math.round(Number(recipe.servings) || 2)),
      mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'].includes(recipe.mealType) ? recipe.mealType : 'Dinner',
      difficulty: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'].includes(recipe.difficulty) ? recipe.difficulty : 'Easy',
      preparation: recipe.preparation || {},
      nutrition: recipe.nutrition || {},
      dietaryType: [],
      moodTags: [String(recipe.selectedMood || recipe.mood || '')].filter(Boolean),
      tags: [String(recipe.selectedMood || '').toLowerCase(), 'ai-generated'].filter(Boolean),
      source: 'ai-generated',
      isAIGenerated: true,
      createdBy: req.userId,
      image: '',
      aiGeneration: {
        mood: recipe.selectedMood || recipe.mood || null,
        generatedAt: new Date(),
        fingerprint: recipe.fingerprint || null,
      },
    });

    // Mark the matching generation-history entry as saved (user liked it).
    if (recipe.fingerprint) {
      const { AIRecipeGeneration } = require('../models/AIRecipeGeneration');
      await AIRecipeGeneration.updateMany(
        { userId: req.userId, fingerprint: recipe.fingerprint, saved: { $ne: true } },
        { $set: { saved: true } }
      ).catch(() => {});
    }

    res.status(201).json({ message: 'Recipe saved to your collection.', recipe: doc });
  } catch (error) {
    console.error('AI recipe save error:', error.message);
    res.status(500).json({ message: 'Failed to save generated recipe.' });
  }
});

module.exports = router;
