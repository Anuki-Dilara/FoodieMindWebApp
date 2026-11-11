// Pure, explainable scoring functions for mood-based recipe recommendations.
// No database access here — everything is computed from recipe + pantry data
// so the logic is unit-testable and reusable.

const { matchIngredientRequirements } = require('./ingredientMatcher');
const { TIME_FILTERS } = require('./moodScoring');

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const hasTag = (recipe, tag) => (recipe.tags || []).includes(tag);
const tagCount = (recipe, tags) => tags.filter((t) => hasTag(recipe, t)).length;

const EFFORT_LEVELS = { 'Very Low': 1, Low: 2, Medium: 3, High: 4, 'Very High': 5 };
const effortLevel = (effort) => EFFORT_LEVELS[effort] || 3;
const DIFFICULTY_LEVELS = { Beginner: 1, Easy: 1, Intermediate: 2, Medium: 2, Advanced: 3, Hard: 3 };
const difficultyLevel = (d) => DIFFICULTY_LEVELS[d] || 2;

// cookingTime is treated as the total recipe time (prep + cook + rest).
function totalTime(recipe) {
  return recipe.cookingTime || recipe.totalTime || 45;
}
function handsOnTime(recipe) {
  return recipe.preparation?.handsOnTime ?? Math.min(totalTime(recipe), 20);
}
function totalSteps(recipe) {
  return recipe.preparation?.totalSteps ?? recipe.instructions?.length ?? 6;
}
function equipmentCount(recipe) {
  return (recipe.preparation?.equipment || []).length;
}
function requiredIngredients(recipe) {
  return (recipe.ingredients || []).filter((i) => !i.isOptional);
}
function ingredientCount(recipe) {
  return requiredIngredients(recipe).length;
}
function servings(recipe) {
  return recipe.servings || 1;
}
// Nutrition values are stored per serving.
function nutritionPerServing(recipe) {
  const n = recipe.nutrition || {};
  return {
    calories: n.calories || 0,
    protein: n.protein || 0,
    carbohydrates: n.carbohydrates || 0,
    fat: n.fat || 0,
    fibre: n.fibre || 0,
  };
}

// ---------- generic factor helpers (each returns 0-100) ----------

// Lower-is-better ramp: full marks at/below `target`, decays `penalty` per unit over.
function underTargetScore(value, target, penalty = 8) {
  if (value <= target) return 100;
  return clamp(100 - (value - target) * penalty);
}
// Higher-is-better ramp: full marks at/above `target`, decays below.
function overTargetScore(value, target, penalty = 8) {
  if (value >= target) return 100;
  return clamp((value / Math.max(target, 1)) * 100 - penalty * (target - value));
}
function effortLowScore(recipe) {
  const lvl = effortLevel(recipe.preparation?.effort);
  return lvl <= 2 ? 100 : lvl === 3 ? 55 : 20;
}
function effortHighScore(recipe) {
  const lvl = effortLevel(recipe.preparation?.effort);
  return lvl >= 4 ? 100 : lvl === 3 ? 70 : 25;
}
function stepsScore(recipe, maxSteps) {
  return underTargetScore(totalSteps(recipe), maxSteps, 15);
}
function equipmentScore(recipe, maxEquipment) {
  return underTargetScore(equipmentCount(recipe), maxEquipment, 20);
}
function ingredientCountScore(recipe, maxCount) {
  return underTargetScore(ingredientCount(recipe), maxCount, 10);
}
function countScore(value, max, penalty = 12) {
  return underTargetScore(value, max, penalty);
}
// Missing attribute -> neutral 50 so absent data never inflates a score.
function neutralIfMissing(value, fn) {
  return value === null || value === undefined ? 50 : fn(value);
}

// ---------- per-mood suitability ----------
// Each scorer returns { score (0-100), reasons[], factors{} }.
// `factors` records sub-scores for transparency; weights sum to 100.

const MOOD_TARGET_TIME = {
  Happy: 40, Tired: 15, Sick: 30, Stressed: 30,
  Energetic: 45, Lazy: 15, Sad: 35, Hungry: 30,
};

function scoreHappy(recipe) {
  const factors = {
    colourVariety: neutralIfMissing(recipe.colourVariety, (v) => clamp((v / 6) * 100)),
    ingredientVariety: countScore(Math.max((recipe.ingredientCategories || []).length, Math.min(ingredientCount(recipe), 8) / 2), 6, 12),
    flavourVariety: countScore((recipe.flavourProfile || []).length || tagCount(recipe, ['sweet', 'savoury', 'spicy', 'mild', 'tangy']), 4, 15),
    freshProduce: hasTag(recipe, 'fresh') || hasTag(recipe, 'colorful') ? 100 : (recipe.ingredientCategories || []).some((c) => ['vegetables', 'fruits'].includes(c)) ? 75 : 40,
    moodTag: recipe.moodTags?.includes('Happy') ? 100 : 30,
  };
  const weights = { colourVariety: 25, ingredientVariety: 20, flavourVariety: 20, freshProduce: 15, moodTag: 20 };
  const reasons = [];
  if (factors.colourVariety >= 70) reasons.push('Colourful, appealing ingredients');
  if (factors.ingredientVariety >= 70) reasons.push('Good variety of ingredients');
  if (factors.flavourVariety >= 70) reasons.push('Interesting flavour combination');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreTired(recipe) {
  const t = totalTime(recipe);
  const factors = {
    totalTime: underTargetScore(t, 15, 10),
    handsOnTime: underTargetScore(handsOnTime(recipe), 10, 12),
    steps: stepsScore(recipe, 5),
    effort: effortLowScore(recipe),
    equipment: equipmentScore(recipe, 3),
    moodTag: recipe.moodTags?.includes('Tired') ? 100 : 30,
  };
  const weights = { totalTime: 30, handsOnTime: 15, steps: 20, effort: 15, equipment: 10, moodTag: 10 };
  const reasons = [];
  if (t <= 15) reasons.push(`Ready in only ${t} minutes`);
  else if (factors.totalTime >= 60) reasons.push(`Takes ${t} minutes total`);
  if (handsOnTime(recipe) <= 10) reasons.push(`Only ${handsOnTime(recipe)} minutes hands-on`);
  if (totalSteps(recipe) <= 5) reasons.push('Five or fewer simple steps');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreSick(recipe) {
  const factors = {
    warmMeal: recipe.foodTemperature === 'warm' || hasTag(recipe, 'warm') ? 100 : 20,
    mildFlavour: hasTag(recipe, 'mild') || (recipe.flavourProfile || []).includes('mild') ? 100 : 30,
    softTexture: hasTag(recipe, 'soft-food') || (recipe.texture || []).some((x) => ['soft', 'smooth', 'creamy', 'pureed'].includes(x)) ? 100 : 30,
    simplePrep: effortLowScore(recipe) >= 70 ? 100 : effortLowScore(recipe) >= 40 ? 60 : 20,
    manageableIngredients: ingredientCountScore(recipe, 8, 12),
    moodTag: recipe.moodTags?.includes('Sick') ? 100 : 30,
  };
  const weights = { warmMeal: 25, mildFlavour: 20, softTexture: 20, simplePrep: 15, manageableIngredients: 10, moodTag: 10 };
  const reasons = [];
  if (factors.warmMeal >= 80) reasons.push('A warm, comforting meal');
  if (factors.mildFlavour >= 80) reasons.push('Mild, easy-on-the-palate flavours');
  if (factors.softTexture >= 80) reasons.push('Soft, easy-to-eat texture');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreStressed(recipe) {
  const factors = {
    lowEffort: effortLowScore(recipe),
    steps: stepsScore(recipe, 6),
    equipment: equipmentScore(recipe, 3),
    simpleMethod: ['stovetop', 'no-cook'].includes(recipe.preparation?.method) ? 100 : 45,
    ingredientCount: ingredientCountScore(recipe, 8, 12),
    onePot: recipe.preparation?.method === 'stovetop' && equipmentCount(recipe) <= 3 ? 100 : 50,
    moodTag: recipe.moodTags?.includes('Stressed') ? 100 : 30,
  };
  const weights = { lowEffort: 20, steps: 15, equipment: 15, simpleMethod: 15, ingredientCount: 15, onePot: 10, moodTag: 10 };
  const reasons = [];
  if (factors.lowEffort >= 80) reasons.push('Low-effort preparation');
  if (factors.onePot >= 80) reasons.push('Simple one-pot style cooking');
  if (totalSteps(recipe) <= 6) reasons.push('Straightforward instructions');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreEnergetic(recipe) {
  const factors = {
    involvedPrep: effortHighScore(recipe) >= 70 ? 100 : effortLevel(recipe.preparation?.effort) === 3 ? 75 : 30,
    skillChallenge: difficultyLevel(recipe.difficulty) >= 2 ? 100 : 55,
    variety: countScore(Math.max((recipe.ingredientCategories || []).length, Math.min(ingredientCount(recipe), 8) / 2), 6, 12),
    // More hands-on time = more involvement (capped at 20 min = full marks).
    handsOnActivity: clamp((handsOnTime(recipe) / 20) * 100, 15, 100),
    freshIngredients: hasTag(recipe, 'fresh') || hasTag(recipe, 'colorful') ? 100 : (recipe.ingredientCategories || []).some((c) => ['vegetables', 'fruits', 'protein'].includes(c)) ? 70 : 40,
    moodTag: recipe.moodTags?.includes('Energetic') ? 100 : 30,
  };
  const weights = { involvedPrep: 20, skillChallenge: 15, variety: 20, handsOnActivity: 15, freshIngredients: 15, moodTag: 15 };
  const reasons = [];
  if (factors.involvedPrep >= 80) reasons.push('A more involved recipe to enjoy');
  if (factors.variety >= 70) reasons.push('Wide variety of fresh ingredients');
  if (factors.skillChallenge >= 80) reasons.push('A satisfying cooking challenge');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreLazy(recipe) {
  const factors = {
    handsOnTime: underTargetScore(handsOnTime(recipe), 5, 15),
    ingredientCount: ingredientCountScore(recipe, 5, 15),
    noCook: recipe.preparation?.method === 'no-cook' ? 100 : recipe.preparation?.method === 'microwave' ? 80 : 20,
    equipment: equipmentScore(recipe, 2),
    totalTime: underTargetScore(totalTime(recipe), 15, 10),
    moodTag: recipe.moodTags?.includes('Lazy') ? 100 : 30,
  };
  const weights = { handsOnTime: 30, ingredientCount: 20, noCook: 20, equipment: 10, totalTime: 10, moodTag: 10 };
  const reasons = [];
  if (handsOnTime(recipe) <= 5) reasons.push(`Only ${handsOnTime(recipe)} minutes of hands-on preparation`);
  if (ingredientCount(recipe) <= 5) reasons.push(`Just ${ingredientCount(recipe)} ingredients`);
  if (recipe.preparation?.method === 'no-cook') reasons.push('No cooking required');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreSad(recipe) {
  const comfort = neutralIfMissing(recipe.comfortScore, (v) => clamp((v / 5) * 100));
  const factors = {
    comfortScore: comfort,
    comfortTag: hasTag(recipe, 'comfort') ? 100 : 30,
    warmMeal: recipe.foodTemperature === 'warm' || hasTag(recipe, 'warm') ? 100 : 40,
    familiarFlavour: (recipe.flavourProfile || []).includes('familiar') || hasTag(recipe, 'mild') ? 100 : 45,
    lowEffort: effortLowScore(recipe),
    satisfyingPortion: servings(recipe) >= 3 ? 100 : servings(recipe) >= 2 ? 80 : 45,
    moodTag: recipe.moodTags?.includes('Sad') ? 100 : 30,
  };
  const weights = { comfortScore: 25, comfortTag: 15, warmMeal: 15, familiarFlavour: 15, lowEffort: 15, satisfyingPortion: 5, moodTag: 10 };
  const reasons = [];
  if (comfort >= 75) reasons.push('A warm, comforting meal');
  if (factors.familiarFlavour >= 80) reasons.push('Familiar, satisfying flavours');
  if (effortLowScore(recipe) >= 80) reasons.push('Simple preparation');
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

function scoreHungry(recipe) {
  const n = nutritionPerServing(recipe);
  const factors = {
    protein: clamp((n.protein / 25) * 100),
    fibre: clamp((n.fibre / 6) * 100),
    calories: n.calories >= 500 && n.calories <= 850 ? 100 : n.calories >= 350 && n.calories <= 1000 ? 65 : 35,
    portionSize: servings(recipe) >= 4 ? 100 : servings(recipe) >= 3 ? 85 : servings(recipe) >= 2 ? 60 : 35,
    reasonableTime: underTargetScore(totalTime(recipe), 30, 8),
    proteinIngredient: (recipe.ingredientCategories || []).includes('protein') ? 100 : 50,
    moodTag: recipe.moodTags?.includes('Hungry') ? 100 : 30,
  };
  const weights = { protein: 25, fibre: 15, calories: 15, portionSize: 15, reasonableTime: 10, proteinIngredient: 10, moodTag: 10 };
  const reasons = [];
  if (n.protein >= 20) reasons.push(`${n.protein} g protein per serving`);
  if (servings(recipe) >= 3) reasons.push(`Filling ${servings(recipe)}-serving meal`);
  if (n.fibre >= 5) reasons.push(`${n.fibre} g fibre per serving`);
  return { score: weighted(factors, weights), reasons: reasons.slice(0, 2), factors };
}

const MOOD_SCORERS = {
  Happy: scoreHappy,
  Tired: scoreTired,
  Sick: scoreSick,
  Stressed: scoreStressed,
  Energetic: scoreEnergetic,
  Lazy: scoreLazy,
  Sad: scoreSad,
  Hungry: scoreHungry,
};

function weighted(factors, weights) {
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(weights)) {
    const v = factors[k];
    if (v === undefined || v === null) continue;
    sum += v * weights[k];
    wsum += weights[k];
  }
  return wsum > 0 ? clamp(sum / wsum) : 50;
}

// Public: score a recipe for one mood. Unknown mood -> neutral 50.
function scoreRecipeForSingleMood(recipe, mood) {
  const scorer = MOOD_SCORERS[mood];
  if (!scorer) return { score: 50, reasons: [], factors: {} };
  return scorer(recipe);
}

// Score across multiple moods using a normalized average of per-mood scores.
function scoreRecipeForMoods(recipe, moods = []) {
  if (!moods.length) return { score: 50, reasons: [], perMood: {} };
  const perMood = {};
  const reasons = [];
  for (const mood of moods) {
    const r = scoreRecipeForSingleMood(recipe, mood);
    perMood[mood] = { score: r.score, reasons: r.reasons, factors: r.factors };
    if (r.reasons[0]) reasons.push(`${r.reasons[0]} (${mood.toLowerCase()})`);
  }
  const avg = Object.values(perMood).reduce((a, b) => a + b.score, 0) / moods.length;
  return { score: clamp(avg), reasons: reasons.slice(0, 3), perMood };
}

// ---------- pantry matching ----------

// Returns availability details; quantity-aware where units are convertible.
// Delegates to the shared three-state matcher (AVAILABLE / SUBSTITUTE_AVAILABLE
// / MISSING). `options.substitutions` and `options.userAllergies` enable the
// approved-substitution path; substitutes never count as exact matches.
function matchIngredients(recipe, inventory = [], options = {}) {
  return matchIngredientRequirements(recipe, inventory, options);
}

// ---------- time suitability (averaged across all selected moods) ----------

function scoreTimeForMoods(recipe, moods = [], timeAvailable = null) {
  if (timeAvailable && timeAvailable !== 'Any time') {
    const max = TIME_FILTERS[timeAvailable] ?? Infinity;
    const ok = totalTime(recipe) <= max;
    return { score: ok ? 100 : 0, reasons: ok ? [`Fits your ${timeAvailable} limit`] : [`Over your ${timeAvailable} limit`] };
  }
  const t = totalTime(recipe);
  const targets = moods.length ? moods.map((m) => MOOD_TARGET_TIME[m] ?? 30) : [30];
  const scores = targets.map((target) => (t <= target ? 100 : clamp(100 - (t - target) * 6)));
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const reasons = [];
  if (score >= 80) reasons.push(`Total time of ${t} minutes suits your mood${moods.length > 1 ? 's' : ''}`);
  else if (t <= 20) reasons.push(`Quick total time of ${t} minutes`);
  return { score: clamp(score), reasons };
}

// ---------- expiry priority (neutral when nothing is expiring) ----------

function scoreExpiryPriority(recipe, inventory = []) {
  const pantry = matchIngredients(recipe, inventory);
  const required = pantry.requiredCount || 1;
  const ratio = Math.min(1, pantry.expiringCount / required);
  // Neutral 50 baseline; up to 100 when a large share of ingredients expire soon.
  const score = pantry.expiringCount > 0 ? 50 + ratio * 50 : 50;
  const reasons = [];
  if (pantry.expiringCount > 0) {
    reasons.push(`Uses ${pantry.expiringCount} ingredient${pantry.expiringCount > 1 ? 's' : ''} expiring soon`);
  }
  return { score: clamp(score), reasons, expiringCount: pantry.expiringCount, expiringNames: pantry.expiringNames };
}

// ---------- nutrition & preference suitability (per serving) ----------

function scoreNutritionPreference(recipe, user = {}, moods = []) {
  const n = nutritionPerServing(recipe);
  const factors = {};

  // Balanced plate: decent protein, some fibre, reasonable calories.
  factors.macroBalance = clamp(
    Math.min((n.protein / 20) * 50, 50) +
    Math.min((n.fibre / 5) * 25, 25) +
    (n.calories >= 250 && n.calories <= 850 ? 25 : n.calories > 0 ? 12 : 0)
  );

  // Dietary preference alignment (neutral when user has none or recipe untagged).
  const prefs = user.dietaryPreferences || [];
  if (!prefs.length) factors.dietaryFit = 50;
  else if (!(recipe.dietaryType || []).length) factors.dietaryFit = 50;
  else factors.dietaryFit = prefs.some((p) => (recipe.dietaryType || []).some((dt) => dt.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(dt.toLowerCase()))) ? 100 : 40;

  // Skill appropriateness.
  const skillAllowed = {
    Beginner: ['Easy', 'Beginner'],
    Intermediate: ['Easy', 'Medium', 'Beginner', 'Intermediate'],
    Advanced: ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'],
  }[user.cookingSkillLevel] || ['Easy', 'Beginner'];
  factors.skillFit = skillAllowed.includes(recipe.difficulty) ? 100 : 40;

  // Mood-tag supporting signal (small).
  factors.moodTagSupport = moods.some((m) => (recipe.moodTags || []).includes(m)) ? 100 : 35;

  const weights = { macroBalance: 45, dietaryFit: 20, skillFit: 20, moodTagSupport: 15 };
  return { score: clamp(weighted(factors, weights)), reasons: [], factors };
}

// ---------- feedback personalization (bounded) ----------

const FEEDBACK_MAX_ADJUSTMENT = 10;

// feedbackEntries: [{ helpful: boolean }] for this user+recipe+mood.
function personalizationAdjustment(feedbackEntries = []) {
  if (!feedbackEntries.length) return { adjustment: 0, reason: null };
  const net = feedbackEntries.reduce((acc, f) => acc + (f.helpful ? 1 : -1), 0);
  // Bounded: each net positive/negative interaction moves the score by 4,
  // capped at +/-10, so one or two interactions cannot dominate suitability.
  const adjustment = clamp(net * 4, -FEEDBACK_MAX_ADJUSTMENT, FEEDBACK_MAX_ADJUSTMENT);
  if (adjustment === 0) return { adjustment: 0, reason: null };
  return {
    adjustment,
    reason: adjustment > 0 ? 'Boosted by your positive feedback on similar meals' : 'Lowered by your previous feedback',
  };
}

// ---------- explanation builder ----------

// Builds a human-readable explanation from real recipe attributes only.
function buildExplanation(recipe, moodResult, pantry, timeResult, moods = []) {
  const parts = [];
  const t = totalTime(recipe);
  const h = handsOnTime(recipe);
  const n = nutritionPerServing(recipe);

  const moodLabel = moods.length === 1 ? moods[0].toLowerCase() : moods.map((m) => m.toLowerCase()).join(' + ');

  if (moods.includes('Tired') && t <= 15) {
    parts.push(`it takes only ${t} minutes total with ${h} minutes hands-on`);
  } else if (moods.includes('Lazy') && h <= 5) {
    parts.push(`it requires only ${h} minutes of hands-on preparation`);
  } else if (moods.includes('Hungry') && n.protein >= 20) {
    parts.push(`it provides ${n.protein} g of protein per serving in a ${servings(recipe)}-serving meal`);
  } else if ((moods.includes('Sad') || moods.includes('Sick')) && (recipe.foodTemperature === 'warm' || hasTag(recipe, 'warm'))) {
    parts.push('it is a warm, comforting meal with simple preparation');
  } else if (moods.includes('Happy')) {
    const cv = recipe.colourVariety || 0;
    if (cv >= 4) parts.push(`it has ${cv} colourful ingredient varieties`);
    else if ((recipe.ingredientCategories || []).length >= 4) parts.push('it offers a wide variety of ingredients and flavours');
  } else if (moods.includes('Energetic')) {
    parts.push(`it is a more involved recipe (${totalSteps(recipe)} steps, ${recipe.difficulty || 'medium'} difficulty)`);
  } else if (moods.includes('Stressed')) {
    parts.push(`it has ${totalSteps(recipe)} straightforward steps and low preparation effort`);
  }

  if (pantry.canCook) {
    parts.push('all required ingredients are already in your pantry');
  } else if (pantry.availability >= 60) {
    parts.push(`most ingredients are already in your pantry (${Math.round(pantry.availability)}%)`);
  } else if (pantry.missingNames.length > 0 && pantry.missingNames.length <= 3) {
    parts.push(`you would need ${pantry.missingNames.slice(0, 3).join(', ')}`);
  }

  if (pantry.expiringCount > 0) {
    parts.push(`it uses ingredients expiring soon`);
  }

  if (timeResult.reasons[0] && !parts.some((p) => p.includes('minutes'))) {
    parts.push(timeResult.reasons[0].charAt(0).toLowerCase() + timeResult.reasons[0].slice(1));
  }

  if (!parts.length) {
    const firstReason = moodResult.reasons[0];
    parts.push(firstReason ? firstReason.charAt(0).toLowerCase() + firstReason.slice(1) : `it suits your ${moodLabel} mood`);
  }

  const sentence = `Recommended for feeling ${moodLabel} because ${parts.slice(0, 3).join(', and ')}.`;
  return sentence;
}

module.exports = {
  MOOD_SCORERS,
  MOOD_TARGET_TIME,
  scoreRecipeForSingleMood,
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
  totalSteps,
  equipmentCount,
  ingredientCount,
  servings,
  weighted,
  clamp,
};
