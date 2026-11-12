const express = require('express');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const MoodFeedback = require('../models/MoodFeedback');
const RecommendationEvent = require('../models/RecommendationEvent');
const { auth } = require('../middleware/auth');
const { getMoodRecommendations } = require('../utils/moodRecommendationEngine');

const router = express.Router();

router.use(auth);

router.post('/recommendations', async (req, res) => {
  try {
    const { moods, filters = {} } = req.body;
    if (!moods || moods.length === 0) {
      return res.status(400).json({ message: 'Please select at least one mood.' });
    }
    if (moods.length > 2) {
      return res.status(400).json({ message: 'You can select up to 2 moods.' });
    }

    const inventory = await FoodItem.find({ userId: req.userId });
    const recipes = await Recipe.find();

    const recommendations = await getMoodRecommendations(
      recipes,
      inventory,
      req.user,
      moods,
      filters
    );

    const moodText = moods.length === 1
      ? moods[0].toLowerCase()
      : `${moods[0].toLowerCase()} + ${moods[1].toLowerCase()}`;

    // Track recommendation event
    const allRecipeIds = [...recommendations.readyToCook, ...recommendations.needsIngredients].map(r => r._id);
    await RecommendationEvent.create({
      userId: req.userId,
      eventType: 'recommendations_shown',
      moods,
      filters,
      recipeIds: allRecipeIds,
    });

    res.json({
      moods,
      filters,
      ...recommendations,
      message: `Here are meals perfect for when you're feeling ${moodText}!`,
    });
  } catch (error) {
    console.error('Mood recommendations error:', error);
    res.status(500).json({ message: 'Failed to get mood recommendations.' });
  }
});

router.post('/feedback', async (req, res) => {
  try {
    const { recipeId, mood, helpful } = req.body;
    if (!recipeId || !mood || helpful === undefined) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Upsert feedback (update if exists, create if not)
    const feedback = await MoodFeedback.findOneAndUpdate(
      { userId: req.userId, recipeId, mood },
      { helpful, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    // AI-generated recipes: mirror feedback onto the generation-history entry
    // so future explorations can avoid (not-helpful) or prefer (helpful)
    // similar combinations — user-scoped, bounded, never permanent.
    try {
      const recipeDoc = await Recipe.findById(recipeId).lean();
      const fp = recipeDoc?.aiGeneration?.fingerprint;
      if (recipeDoc?.isAIGenerated && fp) {
        const { AIRecipeGeneration } = require('../models/AIRecipeGeneration');
        await AIRecipeGeneration.updateMany(
          { userId: req.userId, fingerprint: fp },
          { $set: { feedback: helpful ? 'helpful' : 'not-helpful' } }
        );
      }
    } catch (e) {
      console.error('AI feedback mirror failed:', e.message);
    }

    // Track feedback event
    await RecommendationEvent.create({
      userId: req.userId,
      eventType: 'feedback_given',
      moods: [mood],
      recipeId,
      recipeName: feedback.recipeName || '',
      helpful,
    });

    res.json({
      message: helpful ? 'Thanks for your feedback!' : 'Thanks for letting us know!',
      feedback,
    });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ message: 'Failed to save feedback.' });
  }
});

router.get('/feedback/:recipeId/:mood', async (req, res) => {
  try {
    const { recipeId, mood } = req.params;
    const feedback = await MoodFeedback.findOne({
      userId: req.userId,
      recipeId,
      mood,
    });

    res.json({ feedback });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get feedback.' });
  }
});

module.exports = router;
