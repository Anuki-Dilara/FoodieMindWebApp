/**
 * Recipe recommendation service — scoring, filtering, and merging local/external/AI recipes.
 */
const { normalizeIngredientName } = require('../utils/unitConversion');

const MOOD_KEYWORDS = {
  Happy: ['colorful', 'fun', 'smoothie', 'fruit', 'salad', 'pancake'],
  Tired: ['quick', 'easy', 'simple', 'sandwich', 'toast'],
  Sick: ['soup', 'warm', 'light', 'healthy', 'rice'],
  Stressed: ['comfort', 'curry', 'pasta', 'warm'],
  Energetic: ['protein', 'balanced', 'curry', 'rice', 'stir'],
  Lazy: ['simple', 'toast', 'sandwich', 'smoothie', 'egg'],
  Sad: ['comfort', 'toast', 'curry', 'pasta'],
  Hungry: ['filling', 'rice', 'curry', 'pasta', 'pancake', 'fried'],
};

const DIFFICULTY_NORMALIZE = {
  Beginner: 'Easy',
  Intermediate: 'Medium',
  Advanced: 'Hard',
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
};

const SKILL_TO_DIFFICULTY = {
  Beginner: ['Easy', 'Beginner'],
  Intermediate: ['Easy', 'Medium', 'Beginner', 'Intermediate'],
  Advanced: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'],
};

const SUITABLE_MATCH_THRESHOLD = 60;
const MIN_SUITABLE_COUNT = 3;

function normalizeDifficulty(difficulty) {
  return DIFFICULTY_NORMALIZE[difficulty] || difficulty || 'Easy';
}

function ingredientMatchesInventory(ingredientName, inventoryItems) {
  const normalized = normalizeIngredientName(ingredientName);
  return inventoryItems.find((item) => {
    const itemName = normalizeIngredientName(item.name);
    return itemName === normalized || itemName.includes(normalized) || normalized.includes(itemName);
  });
}

function calculateIngredientMatch(recipe, inventoryItems) {
  const matched = [];
  const missing = [];
  let expiringCount = 0;
  const expiringNames = [];

  (recipe.ingredients || []).forEach((ing) => {
    const invItem = ingredientMatchesInventory(ing.name, inventoryItems);
    if (invItem) {
      matched.push({
        name: ing.name,
        inventoryItem: invItem.name,
        quantity: ing.quantity,
        unit: ing.unit,
      });
      const daysLeft = Math.ceil((new Date(invItem.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 3 && daysLeft >= 0) {
        expiringCount += 1;
        expiringNames.push(invItem.name);
      }
    } else {
      missing.push(ing.name);
    }
  });

  const total = recipe.ingredients?.length || 0;
  const matchPercentage = total > 0 ? Math.round((matched.length / total) * 100) : 0;

  return { matched, missing, matchPercentage, expiringCount, expiringNames };
}

function hasAllergyConflict(recipe, userAllergies) {
  if (!userAllergies?.length) return false;
  const allergySet = userAllergies.map((a) => a.toLowerCase());
  return (recipe.ingredients || []).some((ing) =>
    allergySet.some((allergy) => normalizeIngredientName(ing.name).includes(allergy.toLowerCase()))
  );
}

function filterAllergyUnsafeRecipes(recipes, userAllergies, hideUnsafe = false) {
  return recipes.map((recipe) => {
    const conflict = hasAllergyConflict(recipe, userAllergies);
    if (hideUnsafe && conflict) return null;
    return { ...recipe, allergyWarning: conflict };
  }).filter(Boolean);
}

function matchesDietaryPreference(recipe, preferences) {
  if (!preferences?.length) return { match: true, score: 100 };
  if (!recipe.dietaryType?.length) return { match: true, score: 50 };
  const matched = preferences.some((pref) =>
    recipe.dietaryType.some((dt) => dt.toLowerCase().includes(pref.toLowerCase()) || pref.toLowerCase().includes(dt.toLowerCase()))
  );
  return { match: matched, score: matched ? 100 : 0 };
}

function matchesSkillLevel(recipe, skillLevel) {
  const allowed = SKILL_TO_DIFFICULTY[skillLevel] || SKILL_TO_DIFFICULTY.Beginner;
  const recipeDiff = recipe.difficulty || 'Beginner';
  const matched = allowed.includes(recipeDiff) || allowed.includes(normalizeDifficulty(recipeDiff));
  return { match: matched, score: matched ? 100 : 0 };
}

function matchMoodToRecipe(recipe, mood) {
  if (!mood) return { match: true, score: 50 };
  const keywords = MOOD_KEYWORDS[mood] || [];
  const recipeText = `${recipe.name} ${recipe.description || ''} ${(recipe.dietaryType || []).join(' ')}`.toLowerCase();
  let score = 0;
  if (recipe.moodTags?.includes(mood)) score = 100;
  else if (keywords.some((kw) => recipeText.includes(kw))) score = 70;
  else score = 30;
  return { match: score >= 50, score };
}

function prioritizeSoonExpiringFoods(expiringCount, totalIngredients) {
  if (expiringCount === 0) return 0;
  return Math.min(100, Math.round((expiringCount / Math.max(totalIngredients, 1)) * 100) + expiringCount * 10);
}

function buildRecommendationReason(matchData, recipe, mood) {
  const parts = [];
  if (matchData.matched.length > 0) {
    parts.push(`you already have ${matchData.matched.map((m) => m.name).join(', ')}`);
  }
  if (matchData.expiringNames.length > 0) {
    const unique = [...new Set(matchData.expiringNames)];
    parts.push(`your ${unique.join(' and ')} expire${unique.length === 1 ? 's' : ''} soon`);
  }
  if (mood && recipe.moodTags?.includes(mood)) {
    parts.push(`it suits your ${mood.toLowerCase()} mood`);
  }
  if (recipe.source === 'ai-generated') {
    return 'Generated using ingredients from your pantry because no perfect saved recipe was found.';
  }
  if (parts.length === 0) {
    return `Recommended with ${matchData.matchPercentage}% ingredient match.`;
  }
  return `Recommended because ${parts.join(', and ')}.`;
}

function calculateRecipeScore(recipe, inventoryItems, user, mood = null) {
  const totalIngredients = recipe.ingredients?.length || 0;
  if (totalIngredients === 0) return null;

  const matchData = calculateIngredientMatch(recipe, inventoryItems);
  const allergyConflict = hasAllergyConflict(recipe, user.allergies);

  const dietary = matchesDietaryPreference(recipe, user.dietaryPreferences);
  if (!dietary.match) return null;

  const skill = matchesSkillLevel(recipe, user.cookingSkillLevel);
  if (!skill.match) return null;

  const moodResult = matchMoodToRecipe(recipe, mood);
  const soonExpiringBonus = prioritizeSoonExpiringFoods(matchData.expiringCount, totalIngredients);

  const recipeScore =
    matchData.matchPercentage * 0.5 +
    soonExpiringBonus * 0.2 +
    dietary.score * 0.1 +
    skill.score * 0.1 +
    moodResult.score * 0.1;

  const isSuitable =
    matchData.matchPercentage >= SUITABLE_MATCH_THRESHOLD || matchData.expiringCount > 0;

  return {
    _id: recipe._id || recipe.externalId || `temp-${recipe.name}`,
    name: recipe.name,
    description: recipe.description || '',
    image: recipe.image || '',
    cookingTime: recipe.cookingTime || 30,
    difficulty: recipe.difficulty || 'Beginner',
    ingredients: recipe.ingredients,
    instructions: recipe.instructions || [],
    dietaryType: recipe.dietaryType || [],
    moodTags: recipe.moodTags || [],
    source: recipe.source || 'local',
    externalId: recipe.externalId || null,
    isAIGenerated: recipe.isAIGenerated || false,
    matchedIngredients: matchData.matched,
    missingIngredients: matchData.missing,
    optionalMissingIngredients: recipe.optionalMissingIngredients || matchData.missing,
    matchPercentage: matchData.matchPercentage,
    soonExpiringBonus,
    score: Math.round(recipeScore * 100) / 100,
    allergyWarning: allergyConflict,
    isSuitable,
    reason: buildRecommendationReason(matchData, recipe, mood),
    recipeSnapshot: recipe,
  };
}

function sortRecipesByBestMatch(recipes) {
  return [...recipes].sort((a, b) => b.score - a.score || b.matchPercentage - a.matchPercentage);
}

function getMissingIngredients(recipe, inventoryItems) {
  return calculateIngredientMatch(recipe, inventoryItems).missing;
}

function scoreAndFilterRecipes(recipes, inventoryItems, user, mood = null) {
  return sortRecipesByBestMatch(
    recipes
      .map((r) => calculateRecipeScore(r, inventoryItems, user, mood))
      .filter((r) => r && r.matchPercentage > 0 && !r.allergyWarning)
  );
}

function getSuitableRecipes(scoredRecipes) {
  return scoredRecipes.filter((r) => r.isSuitable);
}

function mergeLocalExternalAndAIRecipes(local, external, ai, limit = 20) {
  const seen = new Set();
  const merged = [];

  for (const list of [local, external, ai]) {
    for (const recipe of list) {
      const key = `${recipe.name}-${recipe.source}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(recipe);
    }
  }

  return sortRecipesByBestMatch(merged).slice(0, limit);
}

function recommendRecipesForUser(recipes, inventoryItems, user, mood = null, limit = 20) {
  const scored = scoreAndFilterRecipes(recipes, inventoryItems, user, mood);
  return scored.slice(0, limit);
}

module.exports = {
  MOOD_KEYWORDS,
  normalizeDifficulty,
  ingredientMatchesInventory,
  calculateIngredientMatch,
  hasAllergyConflict,
  filterAllergyUnsafeRecipes,
  calculateRecipeScore,
  sortRecipesByBestMatch,
  getMissingIngredients,
  prioritizeSoonExpiringFoods,
  scoreAndFilterRecipes,
  getSuitableRecipes,
  recommendRecipesForUser,
  mergeLocalExternalAndAIRecipes,
  SUITABLE_MATCH_THRESHOLD,
  MIN_SUITABLE_COUNT,
  buildRecommendationReason,
};
