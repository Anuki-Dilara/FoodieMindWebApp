const { normalizeIngredientName } = require('./unitConversion');
const { sameIngredient, findMatchingItems } = require('./ingredientIdentity');
const { matchIngredientRequirements } = require('./ingredientMatcher');

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
  // Validate ingredient name is a string
  if (typeof ingredientName !== 'string') {
    console.error('ingredientMatchesInventory received non-string ingredient name:', ingredientName);
    return false;
  }
  
  // Strict canonical-identity matching: "Cooking Oil" must NOT match
  // "Sesame Oil" or "Olive Oil". Only true aliases/synonyms match.
  return findMatchingItems(ingredientName, inventoryItems)[0];
}

function ingredientExactMatch(ingredientName, targetName) {
  // Validate both inputs are strings
  if (typeof ingredientName !== 'string' || typeof targetName !== 'string') {
    console.error('ingredientExactMatch received non-string input:', { ingredientName, targetName });
    return false;
  }
  
  return sameIngredient(ingredientName, targetName);
}

// Expands broad allergy labels (e.g. "Nuts") to the ingredient names that
// actually appear in recipes, so "Nuts" also catches peanut butter, etc.
const ALLERGY_KEYWORDS = {
  nuts: ['nut', 'peanut', 'cashew', 'almond', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'pine nut'],
  seafood: ['fish', 'shrimp', 'prawn', 'salmon', 'tuna', 'crab', 'lobster', 'anchovy', 'squid', 'scallop'],
  dairy: ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'ghee', 'whey'],
  eggs: ['egg'],
  gluten: ['gluten', 'flour', 'bread', 'pasta', 'noodle', 'wheat', 'soy sauce', 'oat'],
  wheat: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'seitan'],
  soy: ['soy', 'tofu', 'edamame', 'miso', 'tempeh'],
};

function allergyKeywords(allergy) {
  const a = allergy.toLowerCase();
  return ALLERGY_KEYWORDS[a] || [a];
}

function ingredientHasAllergy(ingredientName, userAllergies) {
  const name = normalizeIngredientName(ingredientName);
  return (userAllergies || []).some((allergy) => {
    const a = allergy.toLowerCase();
    if (name.includes(a)) return true;
    // Coconut milk/cream is not a dairy allergen concern.
    if (a === 'dairy' || a === 'milk') {
      if (name === 'coconut milk' || name === 'coconut cream') return false;
    }
    return allergyKeywords(allergy).some((kw) => name.includes(kw));
  });
}

function hasAllergyConflict(recipe, userAllergies) {
  if (!userAllergies || userAllergies.length === 0) return false;
  return (recipe.ingredients || []).some((ing) => ingredientHasAllergy(ing.name, userAllergies));
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

function scoreRecipe(recipe, inventoryItems, user, mood = null, substitutions = []) {
  const totalIngredients = (recipe.ingredients || []).filter((i) => !i.isOptional).length;
  if (totalIngredients === 0) return null;

  // Strict canonical-identity + quantity-aware matching (three states).
  const pantry = matchIngredientRequirements(recipe, inventoryItems, {
    substitutions,
    userAllergies: user?.allergies || [],
  });
  const matched = pantry.matched.map((m) => ({
    name: m.name,
    inventoryItem: m.inventoryItem,
    quantity: m.quantity,
    unit: m.unit,
  }));
  const missing = pantry.missingNames;
  const substitutedIngredients = pantry.substituted || [];
  let expiringBonus = 0;
  for (const r of pantry.results || []) {
    if (r.status === 'AVAILABLE' && r.daysLeft !== null && r.daysLeft <= 3 && r.daysLeft >= 0) {
      expiringBonus += 15;
    }
  }

  const matchPercentage = Math.round((matched.length / totalIngredients) * 100);

  if (hasAllergyConflict(recipe, user.allergies)) {
    return { ...buildResult(recipe, matched, missing, matchPercentage, 0, substitutedIngredients, pantry.results), allergyWarning: true, score: -1 };
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

  return buildResult(recipe, matched, missing, matchPercentage, score, substitutedIngredients, pantry.results);
}

function buildResult(recipe, matched, missing, matchPercentage, score, substitutedIngredients = [], ingredientStatuses = []) {
  return {
    _id: recipe._id,
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    cookingTime: recipe.cookingTime,
    servings: recipe.servings || 2,
    mealType: recipe.mealType || 'Dinner',
    difficulty: recipe.difficulty,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    dietaryType: recipe.dietaryType,
    moodTags: recipe.moodTags,
    nutrition: recipe.nutrition || { calories: 0, protein: 0, carbohydrates: 0, fat: 0, isEstimated: true },
    matchedIngredients: matched,
    missingIngredients: missing,
    substitutedIngredients,
    ingredientStatuses,
    matchPercentage,
    score,
    allergyWarning: false,
  };
}

function recommendRecipes(recipes, inventoryItems, user, mood = null, requiredIngredient = null, limit = 20, substitutions = []) {
  // First filter by required ingredient if specified
  let filteredRecipes = recipes;
  if (requiredIngredient) {
    filteredRecipes = recipes.filter((recipe) => {
      return recipe.ingredients.some((ing) => ingredientExactMatch(ing.name, requiredIngredient));
    });
  }

  const scored = filteredRecipes
    .map((recipe) => scoreRecipe(recipe, inventoryItems, user, mood, substitutions))
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
  ingredientHasAllergy,
  sameIngredient,
  MOOD_KEYWORDS,
};
