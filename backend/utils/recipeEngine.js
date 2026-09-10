const { normalizeIngredientName } = require('./unitConversion');

const MOOD_KEYWORDS = {
  Happy: ['colorful', 'fun', 'smoothie', 'fruit', 'salad'],
  Tired: ['quick', 'easy', 'simple', 'sandwich', 'toast'],
  Sick: ['soup', 'warm', 'light', 'healthy', 'rice'],
  Stressed: ['comfort', 'curry', 'pasta', 'warm'],
  Energetic: ['protein', 'balanced', 'curry', 'rice'],
  Lazy: ['simple', 'toast', 'sandwich', 'smoothie'],
  Sad: ['comfort', 'toast', 'curry', 'pasta'],
  Hungry: ['filling', 'rice', 'curry', 'pasta', 'pancake'],
};

const MOOD_DIFFICULTY = {
  Tired: ['Easy'],
  Lazy: ['Easy'],
  Sick: ['Easy', 'Medium'],
  Energetic: ['Medium', 'Hard'],
};

function ingredientMatchesInventory(ingredientName, inventoryItems) {
  const normalized = normalizeIngredientName(ingredientName);
  return inventoryItems.find((item) => {
    const itemName = normalizeIngredientName(item.name);
    return itemName === normalized || itemName.includes(normalized) || normalized.includes(itemName);
  });
}

function ingredientExactMatch(ingredientName, targetName) {
  const normalized1 = normalizeIngredientName(ingredientName);
  const normalized2 = normalizeIngredientName(targetName);
  return normalized1 === normalized2;
}

function hasAllergyConflict(recipe, userAllergies) {
  if (!userAllergies || userAllergies.length === 0) return false;
  const allergySet = userAllergies.map((a) => a.toLowerCase());
  return recipe.ingredients.some((ing) =>
    allergySet.some((allergy) => normalizeIngredientName(ing.name).includes(allergy.toLowerCase()))
  );
}

function matchesDietaryPreference(recipe, preferences) {
  if (!preferences || preferences.length === 0) return true;
  if (!recipe.dietaryType || recipe.dietaryType.length === 0) return true;
  return preferences.some((pref) =>
    recipe.dietaryType.some((dt) => dt.toLowerCase().includes(pref.toLowerCase()))
  );
}

function matchesSkillLevel(recipe, skillLevel) {
  const skillMap = {
    Beginner: ['Easy'],
    Intermediate: ['Easy', 'Medium'],
    Advanced: ['Easy', 'Medium', 'Hard'],
  };
  return skillMap[skillLevel]?.includes(recipe.difficulty) ?? true;
}

function scoreRecipe(recipe, inventoryItems, user, mood = null) {
  const totalIngredients = recipe.ingredients.length;
  if (totalIngredients === 0) return null;

  const matched = [];
  const missing = [];
  let expiringBonus = 0;

  recipe.ingredients.forEach((ing) => {
    const invItem = ingredientMatchesInventory(ing.name, inventoryItems);
    if (invItem) {
      matched.push({ name: ing.name, inventoryItem: invItem.name, quantity: ing.quantity, unit: ing.unit });
      const expiry = new Date(invItem.expiryDate);
      const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 3 && daysLeft >= 0) expiringBonus += 15;
    } else {
      missing.push(ing.name);
    }
  });

  const matchPercentage = Math.round((matched.length / totalIngredients) * 100);

  if (hasAllergyConflict(recipe, user.allergies)) {
    return { ...buildResult(recipe, matched, missing, matchPercentage, 0), allergyWarning: true, score: -1 };
  }

  if (!matchesDietaryPreference(recipe, user.dietaryPreferences)) {
    return null;
  }

  if (!matchesSkillLevel(recipe, user.cookingSkillLevel)) {
    return null;
  }

  let moodBonus = 0;
  if (mood && MOOD_KEYWORDS[mood]) {
    const keywords = MOOD_KEYWORDS[mood];
    const recipeText = `${recipe.name} ${recipe.description} ${recipe.dietaryType?.join(' ')}`.toLowerCase();
    if (keywords.some((kw) => recipeText.includes(kw))) moodBonus += 20;
    if (recipe.moodTags?.includes(mood)) moodBonus += 25;

    const allowedDiff = MOOD_DIFFICULTY[mood];
    if (allowedDiff && !allowedDiff.includes(recipe.difficulty)) return null;
  }

  const score = matchPercentage + expiringBonus + moodBonus + (matched.length === totalIngredients ? 10 : 0);

  return buildResult(recipe, matched, missing, matchPercentage, score);
}

function buildResult(recipe, matched, missing, matchPercentage, score) {
  return {
    _id: recipe._id,
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    cookingTime: recipe.cookingTime,
    difficulty: recipe.difficulty,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    dietaryType: recipe.dietaryType,
    matchedIngredients: matched,
    missingIngredients: missing,
    matchPercentage,
    score,
    allergyWarning: false,
  };
}

function recommendRecipes(recipes, inventoryItems, user, mood = null, requiredIngredient = null, limit = 20) {
  // First filter by required ingredient if specified
  let filteredRecipes = recipes;
  if (requiredIngredient) {
    filteredRecipes = recipes.filter((recipe) => {
      return recipe.ingredients.some((ing) => ingredientExactMatch(ing.name, requiredIngredient));
    });
  }

  const scored = filteredRecipes
    .map((recipe) => scoreRecipe(recipe, inventoryItems, user, mood))
    .filter((r) => r && r.score >= 0 && r.matchPercentage > 0)
    .sort((a, b) => b.score - a.score || b.matchPercentage - a.matchPercentage);

  return scored.slice(0, limit);
}

module.exports = {
  recommendRecipes,
  scoreRecipe,
  ingredientMatchesInventory,
  ingredientExactMatch,
  hasAllergyConflict,
  MOOD_KEYWORDS,
};
