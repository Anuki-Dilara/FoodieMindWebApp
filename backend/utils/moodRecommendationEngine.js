// Mood-based recommendation engine with explainable, attribute-driven scoring.
// Scoring weights (sum to 100%):
//   mood suitability 45% | pantry availability 25% | cooking time 15%
//   expiring ingredients 5% | nutrition & preferences 10%
// Mood suitability is the dominant factor so each mood produces a distinct
// ranking; pantry/time/expiry are mood-invariant supporting signals.
// A bounded feedback personalization adjustment (+/-10) is applied on top.
const CookedRecipe = require('../models/CookedRecipe');
const MoodFeedback = require('../models/MoodFeedback');
const IngredientSubstitution = require('../models/IngredientSubstitution');
const { ingredientExactMatch, ingredientHasAllergy } = require('./recipeEngine');
const { getExpiryStatus } = require('./expiryHelper');
const { convertQuantity, convertToBase } = require('./unitConversion');
const {
  MOOD_TARGET_TIME,
  scoreRecipeForMoods,
  matchIngredients,
  scoreTimeForMoods,
  scoreExpiryPriority,
  scoreNutritionPreference,
  personalizationAdjustment,
  buildExplanation,
  nutritionPerServing,
  totalTime,
  handsOnTime,
  clamp,
} = require('./moodScorers');
const { TIME_FILTERS, MEAL_SIZE_CALORIES } = require('./moodScoring');

// ---------- cooking-setup (equipment) normalization ----------
// User-facing equipment options map onto canonical tokens; recipe equipment
// metadata and preparation.method are normalized into the same tokens so
// comparisons are consistent.
const EQUIPMENT_OPTIONS = ['stove', 'oven', 'microwave', 'blender', 'rice cooker', 'air fryer'];

const EQUIPMENT_ALIASES = {
  'stove': 'stove', 'stovetop': 'stove', 'pan': 'stove', 'pot': 'stove',
  'wok': 'stove', 'kadhai': 'stove', 'griddle': 'stove', 'saucepan': 'stove',
  'skillet': 'stove', 'frying pan': 'stove', 'fryingpan': 'stove',
  'stock pot': 'stove', 'stockpot': 'stove', 'cooking pot': 'stove',
  'pressure cooker': 'stove', 'curry pot': 'stove',
  'oven': 'oven', 'baking tray': 'oven', 'bakingtray': 'oven', 'tray': 'oven',
  'baking dish': 'oven', 'bakingdish': 'oven', 'casserole dish': 'oven',
  'casseroledish': 'oven', 'tin': 'oven', 'cake tin': 'oven', 'caketin': 'oven',
  'roasting tin': 'oven', 'roastingtin': 'oven', 'toaster': 'oven',
  'sandwich press': 'oven', 'sandwichpress': 'oven', 'sandwich maker': 'oven',
  'microwave': 'microwave', 'microwave oven': 'microwave', 'microwaveoven': 'microwave',
  'blender': 'blender', 'food processor': 'blender', 'foodprocessor': 'blender',
  'mixer': 'blender', 'hand mixer': 'blender', 'stand mixer': 'blender',
  'juicer': 'blender',
  'rice cooker': 'rice cooker', 'ricecooker': 'rice cooker', 'cooker': 'rice cooker',
  'air fryer': 'air fryer', 'airfryer': 'air fryer', 'airfryer oven': 'air fryer',
};

// Hand tools that never restrict the cooking setup.
const BASIC_TOOLS = new Set([
  'knife', 'cuttingboard', 'board', 'bowl', 'spoon', 'fork', 'whisk',
  'spatula', 'rollingpin', 'colander', 'grater', 'peeler', 'masher', 'tongs',
  'ladle', 'jug', 'plate', 'platter', 'measuringcups', 'measuringcup',
  'sieve', 'strainer', 'cloth', 'foil', 'parchment', 'ovenmitts',
  'thermometer', 'timer', 'scale', 'weighingscale', 'lid', 'lidofpan',
]);

const METHOD_EQUIPMENT = {
  stovetop: 'stove',
  oven: 'oven',
  microwave: 'microwave',
  'no-cook': null,
  'no cook': null,
  mixed: 'stove',
};

function normalizeEquipmentName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Canonical equipment token for a raw equipment/method name, or null when the
// item is a basic hand tool that imposes no restriction.
function canonicalEquipment(name) {
  const n = normalizeEquipmentName(name);
  if (!n) return null;
  const compact = n.replace(/ /g, '');
  if (BASIC_TOOLS.has(compact) || BASIC_TOOLS.has(n)) return null;
  return EQUIPMENT_ALIASES[n] || EQUIPMENT_ALIASES[compact] || n;
}

function normalizeEquipmentSet(list) {
  const set = new Set();
  for (const item of list || []) {
    const n = normalizeEquipmentName(item);
    if (n === 'no cook' || n === 'no-cook' || n === 'nocook') continue; // handled separately
    const canonical = canonicalEquipment(item);
    if (canonical) set.add(canonical);
  }
  return set;
}

// All equipment a recipe genuinely requires: explicit metadata plus whatever
// its preparation method implies.
function requiredEquipmentFor(recipe) {
  const required = new Set();
  for (const eq of recipe.preparation?.equipment || []) {
    const canonical = canonicalEquipment(eq);
    if (canonical) required.add(canonical);
  }
  const implied = METHOD_EQUIPMENT[normalizeEquipmentName(recipe.preparation?.method)];
  if (implied) required.add(implied);
  return required;
}

const SCORE_WEIGHTS = {
  moodSuitability: 0.45,
  pantryAvailability: 0.25,
  cookingTimeSuitability: 0.15,
  expiryPriority: 0.05,
  nutritionPreference: 0.10,
};

// Estimates the cost of ingredients already in the pantry (same semantics as
// the previous engine): uses item.price / item.baseQuantity where available.
function estimatePantryCost(recipe, inventory) {
  let totalCost = 0;
  let completePricing = true;

  for (const ing of recipe.ingredients || []) {
    if (ing.isOptional) continue;

    const usableItems = (inventory || []).filter((item) => {
      if (!ingredientExactMatch(ing.name, item.name)) return false;
      return getExpiryStatus(item.expiryDate).status !== 'Expired';
    });

    if (usableItems.length === 0) {
      completePricing = false;
      continue;
    }

    let needed = ing.quantity || 0;
    for (const item of usableItems) {
      if (needed <= 0) break;
      if (!(item.price > 0) || !(item.baseQuantity > 0)) {
        completePricing = false;
        continue;
      }
      try {
        const conv = convertQuantity(item.quantity, item.unit, ing.unit, ing.name);
        if (!conv.success) {
          completePricing = false;
          continue;
        }
        const usedInRecipeUnit = Math.min(needed, conv.quantity);
        const baseUsed = convertToBase(usedInRecipeUnit, ing.unit);
        if (!baseUsed.success) {
          completePricing = false;
          continue;
        }
        totalCost += (item.price / item.baseQuantity) * baseUsed.quantity;
        needed -= usedInRecipeUnit;
      } catch (e) {
        completePricing = false;
      }
    }
    if (needed > 0) completePricing = false;
  }

  return { totalCost: Math.round(totalCost), shoppingCost: 0, completePricing: completePricing && totalCost > 0 };
}

async function scoreRecipeForMood(recipe, inventory, user, moods = [], filters = {}, context = {}) {
  const reasons = [];

  const scaledRecipe = scaleRecipeForServings(recipe, filters.selectedServings);
  const recipeObj = scaledRecipe;

  // 1. Pantry ingredient availability (25%) — three-state matching:
  // exact AVAILABLE / SUBSTITUTE_AVAILABLE / MISSING. Substitutes never
  // count toward exact availability.
  const pantry = matchIngredients(recipeObj, inventory, {
    substitutions: context.substitutions || [],
    userAllergies: user.allergies || [],
  });
  const pantryScore = pantry.availability;
  if (pantry.canCook) reasons.push('Ready to cook with ingredients you have');
  else if (pantry.canCookWithSubstitutes) reasons.push('Cookable using approved ingredient substitutes');
  else if (pantryScore >= 60) reasons.push(`You have ${Math.round(pantryScore)}% of required ingredients`);

  // 2. Mood suitability (35%) — normalized average across all selected moods
  const moodResult = scoreRecipeForMoods(recipeObj, moods);
  let moodScore = moodResult.score;
  reasons.push(...moodResult.reasons);

  // Craving preferences - bounded boost to mood component
  if (filters.cravingFlavor || filters.cravingTemperature) {
    const tags = recipeObj.tags || [];
    let cravingBoost = 0;
    if (filters.cravingFlavor && tags.includes(filters.cravingFlavor)) {
      cravingBoost += 10;
      reasons.push(`Matches your ${filters.cravingFlavor} craving`);
    }
    if (filters.cravingTemperature && (recipeObj.foodTemperature === filters.cravingTemperature || tags.includes(filters.cravingTemperature))) {
      cravingBoost += 8;
      reasons.push(`Served ${filters.cravingTemperature}`);
    }
    moodScore = clamp(moodScore + cravingBoost);
  }

  // Use-this-ingredient-first: bounded ranking preference (NOT a hard filter).
  // Recipes containing the ingredient get a boost sized by whether the pantry
  // actually holds enough of it; expiry proximity adds a small extra boost.
  if (filters.useIngredientFirst) {
    const hits = (recipeObj.ingredients || []).filter((ing) =>
      ingredientExactMatch(ing.name, filters.useIngredientFirst)
    );
    if (hits.length) {
      const matchItems = (inventory || []).filter((item) =>
        ingredientExactMatch(item.name, filters.useIngredientFirst) &&
        getExpiryStatus(item.expiryDate).status !== 'Expired'
      );
      const expiringSoon = matchItems.some((item) => getExpiryStatus(item.expiryDate).status === 'Use Soon');
      let sufficient = false;
      for (const ing of hits) {
        const needed = ing.quantity || 0;
        let available = 0;
        let known = true;
        for (const item of matchItems) {
          try {
            const conv = convertQuantity(item.quantity, item.unit, ing.unit, ing.name, { size: ing.size, form: ing.form });
            if (conv && conv.success) available += conv.quantity;
            else known = false;
          } catch (e) { known = false; }
        }
        if (known && available >= needed) { sufficient = true; break; }
      }
      const boost = (sufficient ? 12 : 7) + (expiringSoon ? 3 : 0);
      moodScore = clamp(moodScore + boost);
      reasons.push(
        `Prioritized: uses ${filters.useIngredientFirst}` +
        (sufficient ? ' — enough in your pantry' : '') +
        (expiringSoon ? ' (expiring soon)' : '')
      );
    }
  }

  // 3. Cooking time suitability (15%) — averaged across ALL selected moods
  const timeResult = scoreTimeForMoods(recipeObj, moods, filters.timeAvailable);
  reasons.push(...timeResult.reasons);

  // 4. Expiry priority (10%) — neutral 50 when nothing expires soon
  const expiryResult = scoreExpiryPriority(recipeObj, inventory);
  reasons.push(...expiryResult.reasons);

  // 5. Nutrition & user-preference suitability (10%) — per serving values
  const nutritionResult = scoreNutritionPreference(recipeObj, user, moods);

  const weightedScore =
    moodScore * SCORE_WEIGHTS.moodSuitability +
    pantryScore * SCORE_WEIGHTS.pantryAvailability +
    timeResult.score * SCORE_WEIGHTS.cookingTimeSuitability +
    expiryResult.score * SCORE_WEIGHTS.expiryPriority +
    nutritionResult.score * SCORE_WEIGHTS.nutritionPreference;

  // 6. Bounded personalization from user feedback (+/-10 max)
  let finalScore = clamp(weightedScore);
  let feedbackReason = null;
  const feedbackEntries = context.feedbackByRecipe?.get
    ? context.feedbackByRecipe.get(recipeObj._id?.toString()) || []
    : (context.feedbackByRecipe || {})[recipeObj._id?.toString()] || [];
  const personal = personalizationAdjustment(feedbackEntries);
  if (personal.adjustment !== 0) {
    finalScore = clamp(finalScore + personal.adjustment);
    feedbackReason = personal.reason;
    if (feedbackReason) reasons.push(feedbackReason);
  }

  const n = nutritionPerServing(recipeObj);
  const explanation = buildExplanation(recipeObj, moodResult, pantry, timeResult, moods);

  return {
    score: finalScore,
    moodScore,
    breakdown: {
      moods,
      moodSuitability: Math.round(moodScore * 10) / 10,
      pantryAvailability: Math.round(pantryScore * 10) / 10,
      cookingTimeSuitability: Math.round(timeResult.score * 10) / 10,
      expiryPriority: Math.round(expiryResult.score * 10) / 10,
      nutritionPreference: Math.round(nutritionResult.score * 10) / 10,
      feedbackAdjustment: personal.adjustment,
      perMood: moodResult.perMood,
    },
    reasons: [...new Set(reasons)].slice(0, 5),
    explanation,
    canCook: pantry.canCook,
    canCookWithSubstitutes: pantry.canCookWithSubstitutes,
    needsIngredients: !pantry.canCook,
    matchedIngredients: pantry.matched,
    missingIngredients: pantry.missingNames,
    substitutedIngredients: pantry.substituted || [],
    ingredientStatuses: pantry.results || [],
    pantryAvailability: pantry.availability,
    substituteCoverage: pantry.substituteCoverage || 0,
    totalTime: totalTime(recipeObj),
    handsOnTime: handsOnTime(recipeObj),
    caloriesPerServing: n.calories,
    proteinPerServing: n.protein,
    carbohydratePerServing: n.carbohydrates,
    fatPerServing: n.fat,
    fibrePerServing: n.fibre,
    servings: recipeObj.servings || 1,
    scaledRecipe: recipeObj,
    selectedServings: filters.selectedServings || recipeObj.servings,
    originalServings: recipe.servings || recipeObj.servings || 1,
    totalNutrition: (() => {
      const sel = filters.selectedServings || recipeObj.servings || 1;
      return {
        calories: Math.round(n.calories * sel),
        protein: Math.round(n.protein * sel * 10) / 10,
        carbohydrates: Math.round(n.carbohydrates * sel * 10) / 10,
        fat: Math.round(n.fat * sel * 10) / 10,
        fibre: Math.round(n.fibre * sel * 10) / 10,
      };
    })(),
    ...estimatePantryCost(recipeObj, inventory),
  };
}

function scaleRecipeForServings(recipe, selectedServings) {
  const recipeObj = recipe.toObject ? recipe.toObject() : recipe;

  if (!selectedServings || selectedServings === recipe.servings) {
    return recipeObj;
  }

  const scaleFactor = selectedServings / recipe.servings;

  // Nutrition is stored per serving, so it does not change with serving count.
  return {
    ...recipeObj,
    ingredients: recipeObj.ingredients.map((ing) => ({
      ...ing,
      quantity: ing.quantity * scaleFactor,
    })),
    servings: selectedServings,
  };
}

async function getMoodRecommendations(recipes, inventory, user, moods, filters = {}, context = {}) {
  // Fetch cooking history for variety analysis (injectable for tests)
  const cookedHistory = context.cookedHistory !== undefined
    ? context.cookedHistory
    : await CookedRecipe.find({ userId: user._id })
        .sort({ cookedDate: -1 })
        .limit(20);

  // Fetch feedback for personalization (injectable for tests)
  let feedbackByRecipe = context.feedbackByRecipe;
  if (feedbackByRecipe === undefined) {
    const feedbackDocs = await MoodFeedback.find({
      userId: user._id,
      mood: { $in: moods },
    }).lean();
    feedbackByRecipe = new Map();
    for (const fb of feedbackDocs) {
      const key = fb.recipeId.toString();
      if (!feedbackByRecipe.has(key)) feedbackByRecipe.set(key, []);
      feedbackByRecipe.get(key).push({ helpful: fb.helpful });
    }
  }
  // Fetch approved ingredient substitutions once per request (injectable for tests)
  let substitutions = context.substitutions;
  if (substitutions === undefined) {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      try {
        substitutions = await IngredientSubstitution.find({ isActive: true }).lean();
      } catch (e) {
        substitutions = []; // non-fatal: matching still works without substitutes
      }
    } else {
      substitutions = [];
    }
  }
  const scoringContext = { ...context, feedbackByRecipe, substitutions };

  // Create set of recently cooked recipe IDs (last 7 days)
  const recentRecipeIds = new Set(
    cookedHistory
      .filter((cr) => {
        const daysSinceCooked = (Date.now() - cr.cookedDate) / (1000 * 60 * 60 * 24);
        return daysSinceCooked < 7;
      })
      .map((cr) => cr.recipeId.toString())
  );

  if (filters.excludeSeenRecipeIds && filters.excludeSeenRecipeIds.length > 0) {
    filters.excludeSeenRecipeIds.forEach((id) => recentRecipeIds.add(id));
  }

  // Count recently cooked recipe types, main ingredients, and methods
  const recentTypes = {};
  const recentIngredients = {};
  const recentMethods = {};

  cookedHistory.forEach((cr) => {
    if (cr.recipeSnapshot?.mealType) {
      recentTypes[cr.recipeSnapshot.mealType] = (recentTypes[cr.recipeSnapshot.mealType] || 0) + 1;
    }
    if (cr.recipeSnapshot?.ingredients) {
      cr.recipeSnapshot.ingredients.slice(0, 3).forEach((ing) => {
        recentIngredients[ing.name.toLowerCase()] = (recentIngredients[ing.name.toLowerCase()] || 0) + 1;
      });
    }
    if (cr.recipeSnapshot?.preparation?.method) {
      recentMethods[cr.recipeSnapshot.preparation.method] = (recentMethods[cr.recipeSnapshot.preparation.method] || 0) + 1;
    }
  });

  // Apply eligibility filters first (synchronous hard filters)
  let eligibleRecipes = recipes.filter((recipe) => {
    // Allergy hard filter — never recommend conflicting recipes
    if (user.allergies?.length > 0) {
      if ((recipe.ingredients || []).some((ing) => ingredientHasAllergy(ing.name, user.allergies))) return false;
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
    if (!allowed.includes(recipe.difficulty || 'Easy')) return false;

    // Time filter (hard filter when user sets a limit).
    // Uses totalTime() = cookingTime (prep + cook + rest), never hands-on time.
    if (filters.timeAvailable && filters.timeAvailable !== 'Any time') {
      const maxTime = TIME_FILTERS[filters.timeAvailable];
      if (totalTime(recipe) > maxTime) return false;
    }

    // Meal size filter — compares per-serving calories
    if (filters.mealSize && filters.mealSize !== 'Any') {
      const calorieRange = MEAL_SIZE_CALORIES[filters.mealSize];
      if (calorieRange) {
        const calories = recipe.nutrition?.calories || 0;
        if (calories < calorieRange.min || calories > calorieRange.max) return false;
      }
    }

    // Sick-specific preferences
    if (moods.includes('Sick') && filters.sickPreferences) {
      const tags = recipe.tags || [];
      if (filters.sickPreferences.warm && recipe.foodTemperature !== 'warm' && !tags.includes('warm')) return false;
      if (filters.sickPreferences.mild && !tags.includes('mild')) return false;
      if (filters.sickPreferences.soft && !tags.includes('soft-food') && !(recipe.texture || []).some((x) => ['soft', 'smooth', 'creamy'].includes(x))) return false;
    }

    // Cooking setup: no-cook toggle + equipment availability.
    // useIngredientFirst is deliberately NOT a hard filter — it is a bounded
    // ranking preference applied during scoring.
    const recipeMethod = normalizeEquipmentName(recipe.preparation?.method);
    const noCookOnly = filters.noCookOnly === true ||
      (filters.availableEquipment || []).some((e) => normalizeEquipmentName(e) === 'no cook' || normalizeEquipmentName(e) === 'nocook');
    if (noCookOnly && recipeMethod !== 'no-cook' && recipeMethod !== 'no cook') return false;

    const selectedEquipment = normalizeEquipmentSet(filters.equipment ?? filters.availableEquipment);
    if (selectedEquipment.size > 0) {
      const required = requiredEquipmentFor(recipe);
      for (const eq of required) {
        if (!selectedEquipment.has(eq)) return false;
      }
    }

    recipe._budgetFilter = { maxBudget: filters.maxBudget, budgetType: filters.budgetType };
    return true;
  });

  // Score remaining recipes (cost estimation is handled by callers needing it;
  // pantry scoring supplies matched/missing data directly)
  const scoredRecipes = await Promise.all(
    eligibleRecipes.map(async (recipe) => {
      const scoring = await scoreRecipeForMood(recipe, inventory, user, moods, filters, scoringContext);

      // Budget filter (post cost calculation)
      if (recipe._budgetFilter && recipe._budgetFilter.maxBudget > 0) {
        if (recipe._budgetFilter.budgetType === 'total' && scoring.totalCost > recipe._budgetFilter.maxBudget) {
          return null;
        }
        if (recipe._budgetFilter.budgetType === 'shopping' && scoring.shoppingCost > recipe._budgetFilter.maxBudget) {
          return null;
        }
      }

      // Variety adjustments (bounded, applied to final score)
      let finalScore = scoring.score;
      const varietyReasons = [];

      if (recentRecipeIds.has(recipe._id.toString())) {
        finalScore -= 8;
        varietyReasons.push('Recently cooked');
      }
      if (recipe.mealType && recentTypes[recipe.mealType] >= 2) {
        finalScore -= 6;
        varietyReasons.push('Recently had this meal type');
      }
      let repeatedIngredientCount = 0;
      recipe.ingredients.slice(0, 3).forEach((ing) => {
        if (recentIngredients[(ing.name || '').toLowerCase()] >= 2) repeatedIngredientCount++;
      });
      if (repeatedIngredientCount >= 2) {
        finalScore -= 5;
        varietyReasons.push('Recently used these main ingredients');
      }
      if (recipe.preparation?.method && recentMethods[recipe.preparation.method] >= 3) {
        finalScore -= 4;
        varietyReasons.push('Recently used this cooking method');
      }
      if (scoring.canCook) finalScore += 3;

      finalScore = clamp(finalScore);

      const finalReasons = [...scoring.reasons];
      varietyReasons.forEach((reason) => {
        if (!finalReasons.includes(reason)) finalReasons.push(reason);
      });

      const n = nutritionPerServing(scoring.scaledRecipe);
      return {
        ...scoring.scaledRecipe,
        score: finalScore,
        moodScore: scoring.moodScore,
        breakdown: scoring.breakdown,
        reasons: finalReasons.slice(0, 5),
        explanation: scoring.explanation,
        canCook: scoring.canCook,
        canCookWithSubstitutes: scoring.canCookWithSubstitutes,
        needsIngredients: scoring.needsIngredients,
        matchedIngredients: scoring.matchedIngredients,
        missingIngredients: scoring.missingIngredients,
        substitutedIngredients: scoring.substitutedIngredients,
        ingredientStatuses: scoring.ingredientStatuses,
        pantryAvailability: scoring.pantryAvailability,
        substituteCoverage: scoring.substituteCoverage,
        totalTime: scoring.totalTime,
        handsOnTime: scoring.handsOnTime,
        caloriesPerServing: n.calories,
        proteinPerServing: n.protein,
        carbohydratePerServing: n.carbohydrates,
        fatPerServing: n.fat,
        fibrePerServing: n.fibre,
        servings: scoring.servings,
        selectedServings: scoring.selectedServings,
        originalServings: scoring.originalServings,
        totalNutrition: scoring.totalNutrition,
        totalCost: scoring.totalCost,
        shoppingCost: scoring.shoppingCost,
        completePricing: scoring.completePricing,
      };
    })
  ).then((results) => results.filter((r) => r !== null));

  scoredRecipes.sort((a, b) => b.score - a.score);

  const readyToCook = scoredRecipes.filter((r) => r.canCook);
  const needsIngredients = scoredRecipes.filter((r) => r.needsIngredients);

  // When an ingredient-first preference matches nothing, explain that other
  // mood-suitable recipes are shown instead of returning an empty list.
  let ingredientFirstNote = null;
  if (filters.useIngredientFirst) {
    const anyUse = scoredRecipes.some((r) =>
      (r.ingredients || []).some((ing) => ingredientExactMatch(ing.name, filters.useIngredientFirst))
    );
    if (!anyUse) {
      ingredientFirstNote = `No recipes in this mood mix use ${filters.useIngredientFirst} — showing other suitable recommendations instead.`;
    }
  }

  return {
    readyToCook: diversifyTopPicks(readyToCook, 6),
    needsIngredients: diversifyTopPicks(needsIngredients, 6),
    totalReady: readyToCook.length,
    totalNeeds: needsIngredients.length,
    alternativesAvailable: scoredRecipes.length > 0,
    filteredOutCount: eligibleRecipes.length - scoredRecipes.length,
    ingredientFirstNote,
    scoreWeights: SCORE_WEIGHTS,
  };
}

// Deterministic diversity: greedily pick the top `limit` recipes by score,
// skipping a candidate only when it is a near-duplicate of the PREVIOUS pick
// (same meal type AND same cooking method AND scores within
// DUPLICATE_SCORE_GAP) and a non-duplicate alternative remains. This breaks
// up consecutive near-identical meals without burying genuinely strong
// recipes elsewhere in the ranking. Deferred recipes fill leftover slots.
const DUPLICATE_SCORE_GAP = 10;

function diversifyTopPicks(sortedRecipes, limit) {
  const picked = [];
  const deferred = [];
  for (const recipe of sortedRecipes) {
    if (picked.length >= limit) break;
    const last = picked[picked.length - 1];
    const isDuplicate = !!last &&
      last.mealType && last.mealType === recipe.mealType &&
      (last.preparation?.method || 'stovetop') === (recipe.preparation?.method || 'stovetop') &&
      Math.abs(last.score - recipe.score) <= DUPLICATE_SCORE_GAP;
    // Only defer while enough alternatives remain to still fill `limit`.
    const remainingAfter = sortedRecipes.length - picked.length - deferred.length - 1;
    if (isDuplicate && remainingAfter >= limit - picked.length) {
      deferred.push(recipe);
    } else {
      picked.push(recipe);
    }
  }
  // Fill any unused slots with deferred recipes, then the rest in score order.
  const result = [...picked];
  for (const r of deferred) {
    if (result.length >= limit) break;
    result.push(r);
  }
  if (result.length < limit) {
    const chosen = new Set(result.map((r) => r._id?.toString()));
    for (const r of sortedRecipes) {
      if (result.length >= limit) break;
      if (!chosen.has(r._id?.toString())) result.push(r);
    }
  }
  return result.slice(0, limit);
}

module.exports = {
  scoreRecipeForMood,
  getMoodRecommendations,
  SCORE_WEIGHTS,
  diversifyTopPicks,
  // Exposed for filter tests / admin tooling
  requiredEquipmentFor,
  normalizeEquipmentSet,
  canonicalEquipment,
  EQUIPMENT_OPTIONS,
  // Backwards-compatible re-exports used by older callers/tests
  calculateIngredientAvailability: (recipe, inventory) => {
    const p = matchIngredients(recipe.toObject ? recipe.toObject() : recipe, inventory);
    return { score: p.availability, canCook: p.canCook, needsIngredients: !p.canCook, reasons: [], totalCost: 0, shoppingCost: 0, completePricing: false };
  },
  calculateMoodSuitability: (recipe, mood) => {
    const r = scoreRecipeForMoods(recipe.toObject ? recipe.toObject() : recipe, [mood]);
    return { score: r.score, reasons: r.reasons };
  },
  calculateTimeSuitability: (recipe, moods, timeFilter) => scoreTimeForMoods(recipe.toObject ? recipe.toObject() : recipe, Array.isArray(moods) ? moods : [moods], timeFilter),
  calculateExpiryPriority: (recipe, inventory) => scoreExpiryPriority(recipe.toObject ? recipe.toObject() : recipe, inventory),
};
