// Validation & sanitization for admin recipe create/update payloads.
// Ensures every recipe saved through the admin API is fully compatible with
// the mood recommendation engine, with sensible defaults for missing fields.

const VALID_MOODS = ['Happy', 'Tired', 'Sick', 'Stressed', 'Energetic', 'Lazy', 'Sad', 'Hungry'];
const VALID_MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'];
const VALID_METHODS = ['stovetop', 'oven', 'microwave', 'no-cook', 'mixed'];
const VALID_EFFORTS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
const VALID_TEMPERATURES = ['warm', 'cold', 'room-temperature', 'any'];

const toStringArray = (v) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];

const toNumber = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function sanitizeIngredients(raw) {
  if (!Array.isArray(raw)) return { data: null, error: 'ingredients must be an array' };
  const ingredients = [];
  for (let i = 0; i < raw.length; i++) {
    const ing = raw[i] || {};
    const name = typeof ing.name === 'string' ? ing.name.trim() : '';
    if (!name) return { data: null, error: `ingredients[${i}].name is required` };
    const quantity = toNumber(ing.quantity, NaN);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { data: null, error: `ingredients[${i}].quantity must be a positive number` };
    }
    ingredients.push({
      name,
      quantity,
      unit: typeof ing.unit === 'string' && ing.unit.trim() ? ing.unit.trim() : 'pieces',
      isOptional: Boolean(ing.isOptional),
    });
  }
  if (ingredients.length === 0) return { data: null, error: 'At least one ingredient is required' };
  return { data: ingredients };
}

function sanitizeInstructions(raw) {
  if (raw === undefined || raw === null) return { data: [] };
  if (!Array.isArray(raw)) return { data: null, error: 'instructions must be an array of strings' };
  const steps = raw.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
  return { data: steps };
}

function sanitizeNutrition(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nutrition = {};
  for (const key of ['calories', 'protein', 'carbohydrates', 'fat', 'fibre']) {
    const n = toNumber(src[key], 0);
    nutrition[key] = n !== null && n >= 0 ? n : 0;
  }
  nutrition.isEstimated = src.isEstimated !== false;
  return { data: nutrition };
}

function sanitizePreparation(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const preparation = {};

  const handsOn = toNumber(src.handsOnTime, NaN);
  if (Number.isFinite(handsOn)) preparation.handsOnTime = Math.max(0, Math.min(600, handsOn));

  const steps = toNumber(src.totalSteps, NaN);
  if (Number.isFinite(steps)) preparation.totalSteps = Math.max(1, Math.min(50, Math.round(steps)));

  const equipment = toStringArray(src.equipment);
  if (equipment.length || src.equipment !== undefined) preparation.equipment = equipment;

  if (src.method !== undefined) {
    if (!VALID_METHODS.includes(src.method)) {
      return { data: null, error: `preparation.method must be one of: ${VALID_METHODS.join(', ')}` };
    }
    preparation.method = src.method;
  }

  if (src.effort !== undefined) {
    if (!VALID_EFFORTS.includes(src.effort)) {
      return { data: null, error: `preparation.effort must be one of: ${VALID_EFFORTS.join(', ')}` };
    }
    preparation.effort = src.effort;
  }

  return { data: preparation };
}

// Fields that must be present when creating a recipe. Everything else is
// optional and falls back to schema defaults (never silently wrong values).
const REQUIRED_ON_CREATE = new Set([
  'name', 'ingredients', 'cookingTime', 'servings', 'mealType', 'difficulty',
]);

// Sanitizes a recipe payload. With { partial: true } only provided fields are
// returned (for safe PATCH-style updates that retain existing attributes).
function sanitizeRecipeInput(body, { partial = false } = {}) {
  const src = body && typeof body === 'object' ? body : {};
  const data = {};
  const errors = [];

  const pick = (key, fn) => {
    if (src[key] === undefined) {
      if (!partial && REQUIRED_ON_CREATE.has(key)) errors.push(`${key} is required`);
      return;
    }
    const r = fn(src[key]);
    if (r.error) errors.push(r.error);
    else if (r.data !== undefined) data[key] = r.data;
  };

  pick('name', (v) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? { data: s } : { data: null, error: 'name is required' };
  });
  pick('description', (v) => ({ data: typeof v === 'string' ? v.trim() : '' }));

  pick('ingredients', (v) => {
    const r = sanitizeIngredients(v);
    return r.error ? { data: null, error: r.error } : { data: r.data };
  });
  pick('instructions', (v) => {
    const r = sanitizeInstructions(v);
    return r.error ? { data: null, error: r.error } : { data: r.data };
  });

  pick('cookingTime', (v) => {
    const n = toNumber(v, NaN);
    return Number.isFinite(n) && n > 0 && n <= 600
      ? { data: n }
      : { data: null, error: 'cookingTime must be a number between 1 and 600 (minutes)' };
  });
  pick('servings', (v) => {
    const n = toNumber(v, NaN);
    return Number.isFinite(n) && n >= 1 && n <= 50
      ? { data: Math.round(n) }
      : { data: null, error: 'servings must be a whole number between 1 and 50' };
  });

  pick('mealType', (v) => {
    if (!VALID_MEAL_TYPES.includes(v)) return { data: null, error: `mealType must be one of: ${VALID_MEAL_TYPES.join(', ')}` };
    return { data: v };
  });
  pick('difficulty', (v) => {
    if (!VALID_DIFFICULTIES.includes(v)) return { data: null, error: `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}` };
    return { data: v };
  });

  pick('dietaryType', (v) => ({ data: toStringArray(v) }));
  pick('moodTags', (v) => {
    const tags = toStringArray(v);
    const bad = tags.filter((t) => !VALID_MOODS.includes(t));
    if (bad.length) return { data: null, error: `Invalid mood tags: ${bad.join(', ')}` };
    return { data: tags };
  });
  pick('tags', (v) => ({ data: toStringArray(v) }));
  pick('ingredientCategories', (v) => ({ data: toStringArray(v) }));

  pick('nutrition', (v) => {
    const r = sanitizeNutrition(v);
    return { data: r.data };
  });
  pick('preparation', (v) => {
    const r = sanitizePreparation(v);
    return r.error ? { data: null, error: r.error } : { data: r.data };
  });

  pick('foodTemperature', (v) => {
    if (!VALID_TEMPERATURES.includes(v)) return { data: null, error: `foodTemperature must be one of: ${VALID_TEMPERATURES.join(', ')}` };
    return { data: v };
  });
  pick('texture', (v) => ({ data: toStringArray(v) }));
  pick('flavourProfile', (v) => ({ data: toStringArray(v) }));

  pick('comfortScore', (v) => {
    const n = toNumber(v, NaN);
    if (!Number.isFinite(n)) return { data: null, error: 'comfortScore must be a number' };
    return { data: Math.max(1, Math.min(5, Math.round(n))) };
  });
  pick('colourVariety', (v) => {
    const n = toNumber(v, NaN);
    if (!Number.isFinite(n)) return { data: null, error: 'colourVariety must be a number' };
    return { data: Math.max(0, Math.min(6, Math.round(n))) };
  });

  pick('image', (v) => ({ data: typeof v === 'string' ? v.trim() : '' }));

  return { data, errors };
}

// Lists which mood-engine attributes are missing on a recipe, for the admin
// completeness indicator. Returns { percent, missing[] }.
function recipeCompleteness(recipe) {
  const checks = [
    ['name', recipe.name],
    ['description', recipe.description],
    ['ingredients', Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0],
    ['instructions', Array.isArray(recipe.instructions) && recipe.instructions.length > 0],
    ['cookingTime', recipe.cookingTime > 0],
    ['servings', recipe.servings > 0],
    ['mealType', !!recipe.mealType],
    ['difficulty', !!recipe.difficulty],
    ['moodTags', Array.isArray(recipe.moodTags) && recipe.moodTags.length > 0],
    ['nutrition.calories', (recipe.nutrition?.calories ?? 0) > 0],
    ['nutrition.protein', recipe.nutrition?.protein !== undefined && recipe.nutrition.protein !== null],
    ['nutrition.fibre', recipe.nutrition?.fibre !== undefined && recipe.nutrition.fibre !== null],
    ['preparation.handsOnTime', recipe.preparation?.handsOnTime !== undefined && recipe.preparation?.handsOnTime !== null],
    ['preparation.totalSteps', recipe.preparation?.totalSteps !== undefined && recipe.preparation?.totalSteps !== null],
    ['preparation.effort', !!recipe.preparation?.effort],
    ['preparation.method', !!recipe.preparation?.method],
    ['preparation.equipment', Array.isArray(recipe.preparation?.equipment)],
    ['foodTemperature', !!recipe.foodTemperature],
    ['texture', Array.isArray(recipe.texture)],
    ['flavourProfile', Array.isArray(recipe.flavourProfile)],
    ['comfortScore', recipe.comfortScore !== undefined && recipe.comfortScore !== null],
    ['colourVariety', recipe.colourVariety !== undefined && recipe.colourVariety !== null],
    ['ingredientCategories', Array.isArray(recipe.ingredientCategories) && recipe.ingredientCategories.length > 0],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
  return { percent: Math.round(((checks.length - missing.length) / checks.length) * 100), missing, total: checks.length };
}

module.exports = {
  VALID_MOODS,
  VALID_MEAL_TYPES,
  VALID_DIFFICULTIES,
  VALID_METHODS,
  VALID_EFFORTS,
  VALID_TEMPERATURES,
  sanitizeRecipeInput,
  recipeCompleteness,
};
