// Mood-based recommendation scoring configuration
// Rule-based scoring system - not a trained machine learning model

const MOOD_RULES = {
  Happy: {
    priorities: ['variety', 'colorful', 'enjoyable'],
    weightAdjustments: {
      ingredientVariety: 1.2,
      colorfulIngredients: 1.3,
      preparationEnjoyment: 1.1,
    },
    description: 'Variety, colourful ingredients, and enjoyable preparation',
  },
  Tired: {
    priorities: ['quick', 'few steps'],
    weightAdjustments: {
      totalCookingTime: 1.5,
      totalSteps: 1.3,
      handsOnTime: 1.1,
    },
    targetCookingTime: 15, // minutes
    description: 'Quick meals, preferably around 15 minutes or less, with few steps',
  },
  Sick: {
    priorities: ['warm', 'mild', 'soft'],
    weightAdjustments: {
      warmFood: 1.5,
      mildFlavor: 1.4,
      softTexture: 1.3,
      nutritionalValue: 1.1,
    },
    description: 'Warm, mild, or soft food based on user preferences',
  },
  Stressed: {
    priorities: ['familiar', 'simple', 'few utensils'],
    weightAdjustments: {
      simplicity: 1.4,
      familiarIngredients: 1.2,
      minimalEquipment: 1.1,
    },
    description: 'Familiar meals, simple instructions, and fewer utensils',
  },
  Energetic: {
    priorities: ['involved', 'try something different'],
    weightAdjustments: {
      skillChallenge: 1.3,
      variety: 1.2,
      preparationComplexity: 1.1,
    },
    description: 'More involved recipes and opportunities to try something different',
  },
  Lazy: {
    priorities: ['minimal hands-on', 'few ingredients', 'little cleanup'],
    weightAdjustments: {
      handsOnTime: 1.5,
      ingredientCount: 1.3,
      cleanup: 1.2,
    },
    description: 'Minimal hands-on preparation, few ingredients, and little cleanup',
  },
  Sad: {
    priorities: ['comfort', 'manageable effort'],
    weightAdjustments: {
      comfortFood: 1.4,
      previousLike: 1.3,
      manageableEffort: 1.1,
    },
    description: 'Previously liked comfort meals with manageable preparation effort',
  },
  Hungry: {
    priorities: ['quick', 'substantial', 'protein'],
    weightAdjustments: {
      totalCookingTime: 1.2,
      servingSize: 1.3,
      proteinContent: 1.4,
    },
    description: 'Quick main meals with substantial serving and protein source',
  },
};

// Base scoring weights (sum to 1.0)
const BASE_WEIGHTS = {
  ingredientAvailability: 0.35,
  moodSuitability: 0.25,
  cookingTimeSuitability: 0.20,
  expiryPriority: 0.15,
  caloriePreference: 0.05,
};

// Effort levels for scoring
const EFFORT_LEVELS = {
  'Very Low': 1,
  'Low': 2,
  'Medium': 3,
  'High': 4,
  'Very High': 5,
};

// Meal size mappings
const MEAL_SIZE_CALORIES = {
  'Snack': { min: 0, max: 300 },
  'Light meal': { min: 300, max: 500 },
  'Full meal': { min: 500, max: 800 },
};

// Time filter mappings
const TIME_FILTERS = {
  '15 minutes': 15,
  '10 minutes': 10,
  '20 minutes': 20,
  '30 minutes': 30,
  '45 minutes': 45,
  '60 minutes': 60,
  'Any time': Infinity,
};

function getMoodRules(mood) {
  return MOOD_RULES[mood] || null;
}

function normalizeScore(score, min = 0, max = 100) {
  return Math.max(min, Math.min(max, score));
}

function calculateEffortScore(effort) {
  const level = EFFORT_LEVELS[effort] || 3;
  // Lower effort = higher score (1-5 scale inverted to 0-100)
  return ((5 - level) / 4) * 100;
}

function calculateTimeScore(cookingTime, targetTime, mood) {
  if (mood === 'Tired' && cookingTime <= targetTime) {
    return 100;
  }
  if (mood === 'Hungry' && cookingTime <= 20) {
    return 100;
  }
  // Score decreases as time exceeds target
  const ratio = targetTime / Math.max(cookingTime, 1);
  return Math.min(100, ratio * 100);
}

function calculateCalorieScore(calories, caloriePreference) {
  if (!caloriePreference || caloriePreference === 'No preference') {
    return 50; // Neutral score when no preference
  }

  const { min, max } = caloriePreference;
  if (calories >= min && calories <= max) {
    return 100;
  }
  // Penalize deviation from preferred range
  const deviation = Math.min(
    Math.abs(calories - min),
    Math.abs(calories - max)
  );
  return Math.max(0, 100 - (deviation / 10));
}

function getRecipeTags(recipe) {
  return {
    warm: recipe.tags?.includes('warm') || false,
    mild: recipe.tags?.includes('mild') || false,
    soft: recipe.tags?.includes('soft-food') || false,
    comfort: recipe.tags?.includes('comfort') || false,
    colorful: recipe.ingredientCategories?.includes('colorful') || false,
  };
}

module.exports = {
  MOOD_RULES,
  BASE_WEIGHTS,
  EFFORT_LEVELS,
  MEAL_SIZE_CALORIES,
  TIME_FILTERS,
  getMoodRules,
  normalizeScore,
  calculateEffortScore,
  calculateTimeScore,
  calculateCalorieScore,
  getRecipeTags,
};
