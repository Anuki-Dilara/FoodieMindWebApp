// Mood-based recommendation engine with explainable scoring
const { getExpiryStatus } = require('./expiryHelper');
const { ingredientExactMatch } = require('./recipeEngine');
const { convertQuantity, convertToBase } = require('./unitConversion');
const {
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
} = require('./moodScoring');

async function scoreRecipeForMood(recipe, inventory, user, moods, filters = {}) {
  const reasons = [];
  let totalScore = 0;
  let activeWeights = { ...BASE_WEIGHTS };

  // Apply serving scaling if specified
  const scaledRecipe = scaleRecipeForServings(recipe, filters.selectedServings);

  // 1. Ingredient Availability Score (35%)
  const availabilityResult = await calculateIngredientAvailability(scaledRecipe, inventory);
  const availabilityScore = availabilityResult.score;
  reasons.push(...availabilityResult.reasons);

  // 2. Mood Suitability Score (25%) - average for multiple moods
  let moodScore = 50;
  if (moods && moods.length > 0) {
    const moodScores = moods.map(mood => calculateMoodSuitability(recipe, mood, user).score);
    moodScore = moodScores.reduce((a, b) => a + b, 0) / moodScores.length;

    // Add mood-specific reasons
    moods.forEach(mood => {
      const moodResult = calculateMoodSuitability(recipe, mood, user);
      reasons.push(...moodResult.reasons.slice(0, 1)); // Top reason per mood
    });
  }

  // Craving preferences - boost matching recipes
  if (filters.cravingFlavor || filters.cravingTemperature) {
    const recipeTags = getRecipeTags(recipe);
    let cravingMatch = 0;

    if (filters.cravingFlavor && recipe.tags?.includes(filters.cravingFlavor)) {
      cravingMatch += 20;
      reasons.push(`Matches your ${filters.cravingFlavor} craving`);
    }

    if (filters.cravingTemperature && recipe.tags?.includes(filters.cravingTemperature)) {
      cravingMatch += 15;
      reasons.push(`Served ${filters.cravingTemperature}`);
    }

    moodScore += cravingMatch;
  }

  // Use this ingredient first - prioritize when expiring soon
  if (filters.useIngredientFirst) {
    const ingredient = recipe.ingredients.find((ing) =>
      ingredientExactMatch(ing.name, filters.useIngredientFirst)
    );
    if (ingredient) {
      const matchingItems = inventory.filter((item) =>
        ingredientExactMatch(ingredient.name, item.name)
      );
      const expiringSoon = matchingItems.some((item) => {
        const { status } = getExpiryStatus(item.expiryDate);
        return status === 'Use Soon';
      });
      if (expiringSoon) {
        moodScore += 25;
        reasons.push(`Uses ${filters.useIngredientFirst} expiring soon`);
      } else {
        moodScore += 10;
        reasons.push(`Uses ${filters.useIngredientFirst}`);
      }
    }
  }

  // 3. Cooking Time Suitability (20%) - use most restrictive time preference
  const timeResult = calculateTimeSuitability(recipe, moods[0], filters.timeAvailable);
  const timeScore = timeResult.score;
  reasons.push(...timeResult.reasons);

  // 4. Expiry Priority (15%)
  const expiryResult = calculateExpiryPriority(recipe, inventory);
  const expiryScore = expiryResult.score;
  reasons.push(...expiryResult.reasons);

  // 5. Calorie Preference (5%) - only if preference set
  let calorieScore = 50; // neutral if no preference
  if (filters.caloriePreference && filters.caloriePreference !== 'No preference') {
    const calorieRange = MEAL_SIZE_CALORIES[filters.caloriePreference];
    const caloriesPerServing = scaledRecipe.nutrition?.calories || 0;
    if (calorieRange) {
      calorieScore = calculateCalorieScore(caloriesPerServing, calorieRange);
      if (calorieScore > 80) {
        reasons.push(`Matches your ${filters.caloriePreference} calorie preference`);
      }
    }
  } else {
    // Remove calorie weight if no preference
    delete activeWeights.caloriePreference;
    // Renormalize weights
    const totalWeight = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    for (const key in activeWeights) {
      activeWeights[key] = activeWeights[key] / totalWeight;
    }
  }

  // Calculate weighted score
  totalScore =
    availabilityScore * activeWeights.ingredientAvailability +
    moodScore * activeWeights.moodSuitability +
    timeScore * activeWeights.cookingTimeSuitability +
    expiryScore * activeWeights.expiryPriority +
    calorieScore * (activeWeights.caloriePreference || 0);

  return {
    score: normalizeScore(totalScore),
    reasons: reasons.slice(0, 3), // Top 3 reasons
    canCook: availabilityResult.canCook,
    needsIngredients: availabilityResult.needsIngredients,
    scaledRecipe,
    selectedServings: filters.selectedServings || recipe.servings,
    totalCost: availabilityResult.totalCost,
    shoppingCost: availabilityResult.shoppingCost,
    completePricing: availabilityResult.completePricing,
  };
}

function scaleRecipeForServings(recipe, selectedServings) {
  // Always convert to plain object to avoid Mongoose document issues
  const recipeObj = recipe.toObject ? recipe.toObject() : recipe;

  if (!selectedServings || selectedServings === recipe.servings) {
    return recipeObj;
  }

  const scaleFactor = selectedServings / recipe.servings;

  // Scale ingredient quantities
  const scaledIngredients = recipeObj.ingredients.map(ing => ({
    ...ing,
    quantity: ing.quantity * scaleFactor,
  }));

  // Scale nutrition (per serving remains same, total scales)
  const scaledNutrition = recipeObj.nutrition ? {
    ...recipeObj.nutrition,
    calories: recipeObj.nutrition.calories * scaleFactor,
    protein: recipeObj.nutrition.protein * scaleFactor,
    carbohydrates: recipeObj.nutrition.carbohydrates * scaleFactor,
    fat: recipeObj.nutrition.fat * scaleFactor,
  } : null;

  return {
    ...recipeObj,
    ingredients: scaledIngredients,
    nutrition: scaledNutrition,
    servings: selectedServings,
  };
}

async function calculateIngredientAvailability(recipe, inventory) {
  const reasons = [];
  let totalIngredients = recipe.ingredients.length;
  let availableIngredients = 0;
  let hasAll = true;
  let totalCost = 0;
  let shoppingCost = 0;
  let completePricing = true;

  for (const ing of recipe.ingredients) {
    if (ing.isOptional) {
      totalIngredients--;
      continue;
    }

    const matchingItems = inventory.filter((item) => ingredientExactMatch(ing.name, item.name));
    const usableItems = matchingItems.filter((item) => {
      const { status } = getExpiryStatus(item.expiryDate);
      return status !== 'Expired';
    });

    if (usableItems.length === 0) {
      hasAll = false;
      // Missing ingredient - estimate shopping cost (if price data available)
      // This would require external price database or user input
      // For now, mark as incomplete pricing
      completePricing = false;
    } else {
      // Check if sufficient quantity
      let totalAvailable = 0;
      let usedQuantity = 0;
      
      for (const item of usableItems) {
        try {
          const conversion = convertQuantity(item.quantity, item.unit, ing.unit, ing.name);
          if (conversion.success) {
            totalAvailable += conversion.quantity;
            
            // Calculate cost for used portion
            if (item.price > 0 && item.baseQuantity > 0) {
              const pricePerBase = item.price / item.baseQuantity;
              const usedInRecipeUnit = Math.min(ing.quantity - usedQuantity, conversion.quantity);
              const baseUsed = convertToBase(usedInRecipeUnit, ing.unit);
              if (baseUsed.success) {
                totalCost += pricePerBase * baseUsed.quantity;
                usedQuantity += usedInRecipeUnit;
              }
            } else {
              completePricing = false;
            }
          }
        } catch (e) {
          // Conversion error - treat as insufficient
          completePricing = false;
        }
      }

      if (totalAvailable >= ing.quantity) {
        availableIngredients++;
      } else {
        hasAll = false;
        // Calculate shopping cost for missing portion
        if (totalAvailable < ing.quantity) {
          const missing = ing.quantity - totalAvailable;
          // Estimate shopping cost (would need price database)
          completePricing = false;
        }
      }
    }
  }

  const score = totalIngredients > 0 ? (availableIngredients / totalIngredients) * 100 : 0;

  if (hasAll) {
    reasons.push('You have enough of every required ingredient');
  } else if (score > 50) {
    reasons.push(`You have most of the required ingredients`);
  }

  return {
    score,
    canCook: hasAll,
    needsIngredients: !hasAll,
    reasons,
    totalCost: Math.round(totalCost),
    shoppingCost: Math.round(shoppingCost),
    completePricing: completePricing && totalCost > 0,
  };
}

function calculateMoodSuitability(recipe, mood, user) {
  const reasons = [];
  let score = 50; // base score

  const rules = getMoodRules(mood);
  if (!rules) {
    return { score: 50, reasons: [] };
  }

  const recipeTags = getRecipeTags(recipe);
  const prep = recipe.preparation || { effort: 'Medium', handsOnTime: 15, totalSteps: 5 };

  // Mood-specific scoring
  switch (mood) {
    case 'Happy':
      if (recipe.ingredientCategories?.length > 3) {
        score += 20;
        reasons.push('Offers variety with multiple ingredient types');
      }
      if (recipeTags.colorful) {
        score += 15;
        reasons.push('Colorful and enjoyable');
      }
      break;

    case 'Tired':
      if (recipe.cookingTime <= 15) {
        score += 30;
        reasons.push(`Quick - only ${recipe.cookingTime} minutes`);
      }
      if (prep.totalSteps <= 5) {
        score += 20;
        reasons.push('Few steps to follow');
      }
      break;

    case 'Sick':
      if (recipeTags.warm) {
        score += 25;
        reasons.push('Warm and comforting');
      }
      if (recipeTags.mild) {
        score += 20;
        reasons.push('Mild flavor');
      }
      if (recipeTags.soft) {
        score += 15;
        reasons.push('Soft texture');
      }
      break;

    case 'Stressed':
      if (prep.effort === 'Low' || prep.effort === 'Very Low') {
        score += 25;
        reasons.push('Simple preparation');
      }
      if (prep.totalSteps <= 6) {
        score += 20;
        reasons.push('Easy to follow');
      }
      if (prep.equipment?.length <= 3) {
        score += 15;
        reasons.push('Minimal equipment needed');
      }
      break;

    case 'Energetic':
      if (prep.effort === 'Medium' || prep.effort === 'High') {
        score += 20;
        reasons.push('More involved preparation');
      }
      if (recipe.difficulty === 'Medium' || recipe.difficulty === 'Hard') {
        score += 15;
        reasons.push('Matches your cooking skill level');
      }
      break;

    case 'Lazy':
      if (prep.handsOnTime <= 5) {
        score += 30;
        reasons.push(`Only ${prep.handsOnTime} minutes of hands-on time`);
      }
      if (recipe.ingredients.length <= 5) {
        score += 20;
        reasons.push('Few ingredients needed');
      }
      if (prep.method === 'no-cook') {
        score += 25;
        reasons.push('No cooking required');
      }
      break;

    case 'Sad':
      if (recipeTags.comfort) {
        score += 30;
        reasons.push('Comfort food');
      }
      if (prep.effort === 'Low' || prep.effort === 'Very Low') {
        score += 15;
        reasons.push('Manageable effort');
      }
      break;

    case 'Hungry':
      if (recipe.cookingTime <= 20) {
        score += 20;
        reasons.push(`Quick meal in ${recipe.cookingTime} minutes`);
      }
      if (recipe.nutrition?.protein >= 15) {
        score += 25;
        reasons.push('Good protein source');
      }
      if (recipe.servings >= 2) {
        score += 15;
        reasons.push('Substantial serving size');
      }
      break;
  }

  return { score: normalizeScore(score), reasons };
}

function calculateTimeSuitability(recipe, mood, timeFilter) {
  const reasons = [];
  let score = 50;

  // Apply time filter if set
  if (timeFilter && timeFilter !== 'Any time') {
    const maxTime = TIME_FILTERS[timeFilter];
    if (recipe.cookingTime <= maxTime) {
      score = 100;
      reasons.push(`Fits your ${timeFilter} time limit`);
    } else {
      score = 0;
      reasons.push(`Exceeds your ${timeFilter} time limit`);
    }
  } else {
    // Mood-based time scoring
    const targetTime = MOOD_RULES[mood]?.targetCookingTime || 30;
    score = calculateTimeScore(recipe.cookingTime, targetTime, mood);
    if (score >= 80) {
      reasons.push(`Takes ${recipe.cookingTime} minutes`);
    }
  }

  return { score, reasons };
}

function calculateExpiryPriority(recipe, inventory) {
  const reasons = [];
  let score = 0;
  let expiringCount = 0;

  for (const ing of recipe.ingredients) {
    const matchingItems = inventory.filter((item) => ingredientExactMatch(ing.name, item.name));
    for (const item of matchingItems) {
      const { status, daysLeft } = getExpiryStatus(item.expiryDate);
      if (status === 'Use Soon' && daysLeft >= 0 && daysLeft <= 3) {
        expiringCount++;
      }
    }
  }

  if (expiringCount > 0) {
    score = Math.min(100, expiringCount * 25);
    reasons.push(`Uses ${expiringCount} ingredient${expiringCount > 1 ? 's' : ''} expiring soon`);
  }

  return { score, reasons };
}

async function getMoodRecommendations(recipes, inventory, user, moods, filters = {}) {
  // Apply eligibility filters first (synchronous filters)
  let eligibleRecipes = recipes.filter((recipe) => {
    // Allergy and dietary checks
    if (user.allergies?.length > 0) {
      const hasAllergy = recipe.ingredients.some((ing) =>
        user.allergies.some((allergy) =>
          ing.name.toLowerCase().includes(allergy.toLowerCase())
        )
      );
      if (hasAllergy) return false;
    }

    if (user.dietaryPreferences?.length > 0) {
      const matchesDiet = user.dietaryPreferences.some((pref) =>
        recipe.dietaryType?.some((dt) =>
          dt.toLowerCase().includes(pref.toLowerCase())
        )
      );
      if (!matchesDiet) return false;
    }

    // Skill level check
    const skillMap = {
      Beginner: ['Easy', 'Beginner'],
      Intermediate: ['Easy', 'Medium', 'Beginner', 'Intermediate'],
      Advanced: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'],
    };
    const allowed = skillMap[user.cookingSkillLevel] || skillMap.Beginner;
    if (!allowed.includes(recipe.difficulty)) return false;

    // Time filter
    if (filters.timeAvailable && filters.timeAvailable !== 'Any time') {
      const maxTime = TIME_FILTERS[filters.timeAvailable];
      if (recipe.cookingTime > maxTime) return false;
    }

    // Meal size filter
    if (filters.mealSize && filters.mealSize !== 'Any') {
      const calorieRange = MEAL_SIZE_CALORIES[filters.mealSize];
      if (calorieRange) {
        const calories = recipe.nutrition?.calories || 0;
        if (calories < calorieRange.min || calories > calorieRange.max) return false;
      }
    }

    // Sick-specific preferences
    if (moods.includes('Sick') && filters.sickPreferences) {
      const recipeTags = getRecipeTags(recipe);
      if (filters.sickPreferences.warm && !recipeTags.warm) return false;
      if (filters.sickPreferences.mild && !recipeTags.mild) return false;
      if (filters.sickPreferences.soft && !recipeTags.soft) return false;
    }

    // Craving preferences - use as ranking, not hard filter
    // These will be handled in scoring, not as hard exclusions

    // Use this ingredient first - hard filter
    if (filters.useIngredientFirst) {
      const hasIngredient = recipe.ingredients.some((ing) =>
        ingredientExactMatch(ing.name, filters.useIngredientFirst)
      );
      if (!hasIngredient) return false;
    }

    // Equipment filtering
    if (filters.availableEquipment && filters.availableEquipment.length > 0) {
      const recipeEquipment = recipe.preparation?.equipment || [];
      const recipeMethod = recipe.preparation?.method;

      // If user selected "No-cook", only show no-cook recipes
      if (filters.availableEquipment.includes('No-cook')) {
        if (recipeMethod !== 'no-cook') return false;
      }

      // Check if recipe requires equipment user doesn't have
      const requiredEquipment = recipeEquipment.filter(eq => 
        eq !== 'knife' && eq !== 'cutting board' && eq !== 'bowl' && eq !== 'spoon' && eq !== 'whisk' && eq !== 'spatula' && eq !== 'rolling pin'
      ); // Basic tools assumed available
      const missingEquipment = requiredEquipment.filter(eq => !filters.availableEquipment.includes(eq));
      
      if (missingEquipment.length > 0) return false;
    }

    // Budget filtering will be handled in scoring phase (async)
    // Mark recipe with budget requirement for later filtering
    recipe._budgetFilter = {
      maxBudget: filters.maxBudget,
      budgetType: filters.budgetType,
    };

    return true;
  });

  // Score remaining recipes
  const scoredRecipes = await Promise.all(
    eligibleRecipes.map(async (recipe) => {
      const scoring = await scoreRecipeForMood(recipe, inventory, user, moods, filters);
      
      // Apply budget filter after cost calculation
      if (recipe._budgetFilter && recipe._budgetFilter.maxBudget > 0) {
        const { totalCost, shoppingCost } = scoring;
        if (recipe._budgetFilter.budgetType === 'total' && totalCost > recipe._budgetFilter.maxBudget) {
          return null; // Filter out
        }
        if (recipe._budgetFilter.budgetType === 'shopping' && shoppingCost > recipe._budgetFilter.maxBudget) {
          return null; // Filter out
        }
      }
      
      return {
        ...scoring.scaledRecipe,
        score: scoring.score,
        reasons: scoring.reasons,
        canCook: scoring.canCook,
        needsIngredients: scoring.needsIngredients,
        selectedServings: scoring.selectedServings,
        totalCost: scoring.totalCost,
        shoppingCost: scoring.shoppingCost,
        completePricing: scoring.completePricing,
      };
    })
  ).then(results => results.filter(r => r !== null));

  // Sort by score, then separate into ready-to-cook and needs-ingredients
  scoredRecipes.sort((a, b) => b.score - a.score);

  const readyToCook = scoredRecipes.filter((r) => r.canCook);
  const needsIngredients = scoredRecipes.filter((r) => r.needsIngredients);

  return {
    readyToCook: readyToCook.slice(0, 6),
    needsIngredients: needsIngredients.slice(0, 6),
    totalReady: readyToCook.length,
    totalNeeds: needsIngredients.length,
  };
}

module.exports = {
  scoreRecipeForMood,
  calculateIngredientAvailability,
  calculateMoodSuitability,
  calculateTimeSuitability,
  calculateExpiryPriority,
  getMoodRecommendations,
};
