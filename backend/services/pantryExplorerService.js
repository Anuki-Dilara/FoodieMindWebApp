// AI Pantry Explorer — generates original recipes strictly from the user's
// non-expired pantry stock (plain water excepted), validates structure,
// quantities (via the existing conversion services) and cooking instructions,
// and never trusts model claims.

const { canonicalName, sameIngredient } = require('../utils/ingredientIdentity');
const { convertQuantity, normalizeUnit, INGREDIENT_ALIASES } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');
const produce = require('../utils/produceConversionService');
const { matchIngredientRequirements } = require('../utils/ingredientMatcher');
const { getProvider, isExplorerEnabled, MAX_GENERATION_ATTEMPTS } = require('./aiProvider');
const { PRODUCE_PROFILES } = require('../data/produceProfiles');
const {
  fingerprint, recipeComponents, similarityOf, isNearDuplicate,
  maxSimilarityTo, diversityScore, varietyTags,
} = require('../utils/recipeSimilarity');
const { AIRecipeGeneration, recordGenerations, recentHistory } = require('../models/AIRecipeGeneration');

// ---- Approved ingredient list -------------------------------------------

// Build the strict allow-list handed to the model: only canonical identities
// backed by real, non-expired stock (plus the water staple).
async function buildApprovedIngredients(userId, FoodItem) {
  const items = await FoodItem.find({ userId }).lean();
  const usable = items.filter((i) => getExpiryStatus(i.expiryDate).status !== 'Expired');

  // Aggregate per canonical identity, keeping the richest unit context.
  const byCanonical = new Map();
  for (const item of usable) {
    const id = canonicalName(item.name);
    if (!id) continue;
    const entry = byCanonical.get(id) || {
      id,
      name: item.name,
      items: [],
      totalBase: 0,
      baseUnit: null,
    };
    entry.items.push({
      quantity: item.quantity,
      unit: item.unit,
      slicesPerLoaf: item.slicesPerLoaf ?? undefined,
      slicePack: item.slicePack ?? undefined,
      expiryDays: getExpiryStatus(item.expiryDate).daysLeft,
    });
    byCanonical.set(id, entry);
  }

  const approved = [];
  for (const entry of byCanonical.values()) {
    const primary = entry.items[0];
    const supported = produce.supportedUnitsFor(entry.name);
    approved.push({
      id: entry.id,
      name: entry.name,
      quantity: primary.quantity,
      unit: primary.unit,
      // Stock expressed per batch so bread/cheese per-item overrides survive.
      stock: entry.items.map((s) => ({
        quantity: s.quantity,
        unit: s.unit,
        slicesPerLoaf: s.slicesPerLoaf,
        slicePack: s.slicePack,
      })),
      units: supported?.units || undefined,
      expiringDays: Math.min(...entry.items.map((s) => s.expiryDays ?? 999)),
    });
  }

  // Plain water is the only automatic staple.
  approved.push({
    id: 'water',
    name: 'Water',
    quantity: null,
    unit: 'ml',
    stock: null,
    staple: true,
    note: 'Unlimited household staple — use freely, never deducted.',
  });

  return approved;
}

// JSON schema handed to Ollama's `format` option — constrains the 2B model to
// emit syntactically valid recipe JSON (grammar-guided decoding).
const GENERATED_RECIPE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      mealType: { type: 'string' },
      prepTime: { type: 'number' },
      cookTime: { type: 'number' },
      handsOnTime: { type: 'number' },
      servings: { type: 'number' },
      difficulty: { type: 'string' },
      method: { type: 'string' },
      equipment: { type: 'array', items: { type: 'string' } },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            form: { type: 'string' },
            size: { type: 'string' },
          },
          required: ['id', 'quantity', 'unit'],
        },
      },
      instructions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            ingredientIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['text', 'ingredientIds'],
        },
      },
      nutrition: {
        type: 'object',
        properties: {
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbohydrates: { type: 'number' },
          fat: { type: 'number' },
          fibre: { type: 'number' },
        },
      },
      moodReason: { type: 'string' },
      pantryReason: { type: 'string' },
    },
    required: ['name', 'ingredients', 'instructions', 'servings', 'prepTime', 'cookTime', 'nutrition'],
  },
};

// ---- Prompt ---------------------------------------------------------------

const MOOD_TRAITS = {
  Happy: 'colourful, enjoyable ingredient combinations',
  Tired: 'quick preparation, minimal effort, simple cooking',
  Sick: 'mild flavours, soft textures, gentle cooking — no medical claims',
  Stressed: 'simple preparation, minimal equipment, calming routine',
  Energetic: 'interesting methods and ingredient combinations',
  Lazy: 'no-cook or very low-effort meals where possible',
  Sad: 'warm, familiar, comforting meals — no mental-health claims',
  Hungry: 'satisfying portions with protein, fibre and nutritional balance',
};

function buildPrompt({ mood, filters, approved, attempt, history = [] }) {
  const lines = approved.map((a) => {
    if (a.staple) return `- id:"${a.id}" | ${a.name} | STAPLE (unlimited)`;
    const stock = a.stock.map((s) => `${s.quantity} ${s.unit}`).join(' + ');
    const exp = a.expiringDays <= 3 ? ` | USE SOON (${a.expiringDays}d)` : '';
    return `- id:"${a.id}" | ${a.name} | stock: ${stock}${exp}`;
  });

  const constraints = [];
  if (filters.timeAvailable && filters.timeAvailable !== 'Any time') {
    constraints.push(`Total time (prep+cook) MUST be <= ${filters.timeAvailable.replace(/\D+/g, '')} minutes.`);
  }
  if (filters.selectedServings) constraints.push(`Servings MUST be ${filters.selectedServings}.`);
  if (filters.noCookOnly) constraints.push('Method MUST be "no-cook" — zero cooking.');
  if (filters.equipment?.length) constraints.push(`Equipment limited to: ${filters.equipment.join(', ')} (or none).`);
  if (filters.useIngredientFirst) constraints.push(`Feature the ingredient "${filters.useIngredientFirst}" if compatible.`);

  return `You are a careful recipe generator for a pantry-cooking app. Generate up to 3 ORIGINAL recipes for a user who feels ${mood} (${MOOD_TRAITS[mood] || 'a balanced meal'}).

APPROVED PANTRY INGREDIENTS (the ONLY ingredients you may use — use their exact "id" values):
${lines.join('\n')}

RULES:
- Use ONLY approved ingredient ids. Never invent ingredients, garnishes, optional extras, or "to taste" additions. If a food is not in the approved list, it does NOT exist for this recipe.
- NEVER use salt, pepper, oil, butter, garlic, ginger, sugar, spices, sauces, stock, broth, herbs or any seasoning unless its id is in the approved list. Do not assume "common pantry staples" — there are none except water.
- Stick to cooking methods that need no oil: boiling, steaming, baking, mashing, poaching, or no-cook assembly.
- Every instruction step MUST contain at least one approved id in "ingredientIds" — never an empty list.
- It is better to return 1-2 fully compliant recipes than 3 with violations. An empty array [] is acceptable if nothing works.
- Plain "water" is the only free staple; everything else must come from the approved list with sufficient quantity.
- Respect units: g/kg for weights, pieces/whole/head for counts, ml/l for liquids. Do not invent conversion factors.
- Each recipe: 4-8 ingredients, 3-6 instruction steps.
- Every instruction step MUST list which approved ingredient ids it uses in "ingredientIds".
- Nutrition values are rough per-serving estimates.
${constraints.length ? '\nFILTER CONSTRAINTS:\n' + constraints.map((c) => `- ${c}`).join('\n') : ''}
${history.length ? `\nALREADY GENERATED FOR THIS USER — do NOT repeat these ingredient combinations, methods or meal styles:\n${history.slice(0, 8).map((h) => `- ${(h.ingredientIds || []).join(' + ')} | ${h.method} | ${h.mealType}`).join('\n')}\n` : ''}
VARIETY: generate up to 3 GENUINELY DIFFERENT recipes — different ingredient subsets, cooking methods and meal types. Recipe 1 should best suit the mood; recipes 2-3 should explore different combinations. Do not force three if the pantry cannot support them.
${attempt > 1 ? '\nPREVIOUS ATTEMPT FAILED VALIDATION. Fix it: use only listed ids, respect quantities/units, ensure every step references approved ids.' : ''}

Respond with ONLY a JSON array (no markdown, no commentary) of up to 3 objects:
[{"name":"...","description":"...","mealType":"Breakfast|Lunch|Dinner|Snack","prepTime":10,"cookTime":15,"handsOnTime":10,"servings":2,"difficulty":"Easy|Medium|Hard","method":"stovetop|oven|microwave|no-cook|mixed","equipment":["pan"],"ingredients":[{"id":"rice","name":"Rice","quantity":200,"unit":"g","form":"rinsed"}],"instructions":[{"text":"...","ingredientIds":["rice"]}],"nutrition":{"calories":450,"protein":18,"carbohydrates":60,"fat":12,"fibre":4},"moodReason":"...","pantryReason":"..."}]`;
}

// ---- Output parsing --------------------------------------------------------

function extractJsonArray(text) {
  if (!text) return null;
  // Strip markdown fences and any <think> reasoning blocks (Qwen thinking
  // models can emit them; brackets inside would corrupt JSON extraction).
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Small local models sometimes double-escape structural quotes (\").
    // Retry once with those repaired — validation still gates the result.
    try {
      const repaired = JSON.parse(slice.replace(/\\"/g, '"'));
      return Array.isArray(repaired) ? repaired : null;
    } catch {
      return null;
    }
  }
}

// ---- Known-ingredient vocabulary for instruction scanning ------------------
// Canonical names the model might sneak into instruction text.
const KNOWN_INGREDIENT_WORDS = new Set();
for (const key of Object.keys(PRODUCE_PROFILES)) KNOWN_INGREDIENT_WORDS.add(key);
for (const v of Object.values(INGREDIENT_ALIASES)) KNOWN_INGREDIENT_WORDS.add(v);
for (const k of Object.keys(INGREDIENT_ALIASES)) KNOWN_INGREDIENT_WORDS.add(k);
// Common cooking staples that are NOT automatically available.
['salt', 'pepper', 'black pepper', 'sugar', 'oil', 'cooking oil', 'olive oil', 'sesame oil',
 'butter', 'garlic', 'ginger', 'soy sauce', 'vinegar', 'honey', 'flour', 'baking powder',
 'baking soda', 'cornstarch', 'corn flour', 'curry powder', 'turmeric', 'cumin', 'mustard seeds',
 'cinnamon', 'cloves', 'cardamom', 'bay leaf', 'oregano', 'basil', 'thyme', 'paprika',
 'chili flakes', 'red chili flakes', 'ketchup', 'mayonnaise', 'tomato sauce', 'stock',
 'vegetable stock', 'chicken stock', 'beef stock', 'fish sauce', 'oyster sauce', 'sesame oil',
 'ghee', 'cream', 'cheese', 'mozzarella', 'parmesan', 'chicken', 'beef', 'fish', 'prawn',
 'tofu', 'noodles', 'pasta', 'bread'].forEach((w) => KNOWN_INGREDIENT_WORDS.add(w));

// Does `word` plausibly refer to an approved ingredient? Compares the literal
// word and its canonical id against approved names/ids, allowing generic
// trailing/leading forms ("rice" ~ "basmati rice") but NOT looser matches —
// "cooking oil" must not be excused by "sesame oil".
function wordCoveredByApproved(word, cid, approvedById) {
  if (!cid) return true;
  const wl = word.toLowerCase();
  if (approvedById.has(cid)) return true;
  for (const a of approvedById.values()) {
    const an = String(a.name || a.id).toLowerCase();
    if (an === wl || a.id === cid) return true;
    if (an.endsWith(' ' + wl) || wl.endsWith(' ' + an)) return true;
  }
  return false;
}

// ---- Validation -------------------------------------------------------------

function validateGeneratedRecipe(raw, { approvedById, mood, filters, user }) {
  const errors = [];
  if (!raw || typeof raw !== 'object') return ['not an object'];

  const name = String(raw.name || '').trim();
  if (!name || name.length > 80) errors.push('invalid name');

  const ingredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  if (ingredients.length < 2 || ingredients.length > 10) errors.push('ingredient count out of range');

  const seenIds = new Set();
  const usedIngredients = [];
  for (const ing of ingredients) {
    const id = canonicalName(String(ing.id || ing.name || ''));
    if (!id) { errors.push('ingredient missing id'); continue; }
    if (seenIds.has(id)) { errors.push(`duplicate ingredient ${id}`); continue; }
    seenIds.add(id);
    const approved = approvedById.get(id);
    if (!approved) { errors.push(`unapproved ingredient: ${id}`); continue; }
    const qty = Number(ing.quantity);
    if (!Number.isFinite(qty) || qty <= 0) { errors.push(`invalid quantity for ${id}`); continue; }
    const unit = normalizeUnit(ing.unit || 'pieces');
    if (approved.staple) {
      usedIngredients.push({ id, name: approved.name, quantity: qty, unit, form: ing.form || null, staple: true });
      continue;
    }
    // Quantity must be coverable by real stock via the existing converters.
    // Per-batch slicesPerLoaf/slicePack overrides ride along on each stock entry.
    let covered = 0;
    let known = true;
    for (const stock of approved.stock) {
      const convOpts = {
        slicesPerLoaf: stock.slicesPerLoaf,
        slicePack: stock.slicePack,
        form: ing.form,
        size: ing.size,
      };
      try {
        const conv = convertQuantity(stock.quantity, stock.unit, unit, id, convOpts);
        if (conv.success) covered += conv.quantity; else known = false;
      } catch { known = false; }
    }
    if (!known || covered + 1e-6 < qty) {
      errors.push(`insufficient stock for ${id}: need ${qty} ${unit}, have ~${Math.round(covered * 100) / 100}`);
      continue;
    }
    usedIngredients.push({ id, name: approved.name, quantity: qty, unit, form: ing.form || null, size: ing.size || null });
  }

  // Instructions must reference only approved ingredient ids.
  const instructions = Array.isArray(raw.instructions) ? raw.instructions : [];
  if (instructions.length < 2 || instructions.length > 8) errors.push('instruction count out of range');
  const approvedIds = new Set(approvedById.keys());
  for (const step of instructions) {
    const text = String(step?.text || '');
    if (!text) { errors.push('empty instruction'); continue; }
    const ids = Array.isArray(step.ingredientIds) ? step.ingredientIds : [];
    if (!ids.length) { errors.push('instruction missing ingredientIds'); continue; }
    for (const sid of ids) {
      const cid = canonicalName(String(sid));
      if (!approvedIds.has(cid)) errors.push(`instruction references unapproved id ${cid}`);
    }
    // Scan text for known-but-unapproved ingredient words. A word is only a
    // violation when no approved ingredient could plausibly be what the text
    // refers to — e.g. "rice" is fine when "basmati rice" is in the pantry,
    // but "cooking oil" is still caught when only "sesame oil" is approved.
    const lower = ` ${text.toLowerCase()} `;
    for (const word of KNOWN_INGREDIENT_WORDS) {
      const cid = canonicalName(word);
      if (wordCoveredByApproved(word, cid, approvedById)) continue;
      if (lower.includes(` ${word} `) || lower.includes(` ${word},`) || lower.includes(` ${word}.`)) {
        errors.push(`instruction mentions unavailable ingredient "${word}"`);
        break;
      }
    }
  }

  // Filters.
  const prep = Number(raw.prepTime) || 0;
  const cook = Number(raw.cookTime) || 0;
  const total = prep + cook;
  if (filters.timeAvailable && filters.timeAvailable !== 'Any time') {
    const maxMin = Number(String(filters.timeAvailable).replace(/\D+/g, ''));
    if (maxMin && total > maxMin) errors.push(`total time ${total}m exceeds ${maxMin}m`);
  }
  if (filters.selectedServings && Number(raw.servings) !== Number(filters.selectedServings)) {
    errors.push(`servings ${raw.servings} != ${filters.selectedServings}`);
  }
  const method = String(raw.method || 'stovetop');
  if (filters.noCookOnly && method !== 'no-cook') errors.push('no-cook filter violated');
  if (filters.equipment?.length) {
    const eq = (raw.equipment || []).map((e) => String(e).toLowerCase());
    for (const e of eq) {
      if (!filters.equipment.map((x) => x.toLowerCase()).includes(e)) errors.push(`equipment "${e}" not allowed`);
    }
  }
  if (filters.useIngredientFirst) {
    const hit = usedIngredients.some((i) => sameIngredient(i.name, filters.useIngredientFirst));
    if (!hit) errors.push('does not feature useIngredientFirst');
  }

  // Allergies / dietary — reject recipes whose approved ingredients conflict.
  const allergies = user?.allergies || [];
  const dietary = user?.dietaryPreferences || [];
  if (allergies.length || dietary.length) {
    const { ingredientHasAllergy } = require('../utils/recipeEngine');
    for (const ing of usedIngredients) {
      if (allergies.length && ingredientHasAllergy(ing.name, allergies)) {
        errors.push(`allergy conflict: ${ing.name}`);
      }
    }
    // Dietary preference check mirrors recipeEngine semantics loosely:
    // reject obvious meat/dairy conflicts for vegetarian/vegan users.
    const meatWords = /chicken|beef|pork|lamb|fish|prawn|egg|milk|cheese|yogurt|butter|cream/i;
    if (dietary.some((d) => /vegetarian|vegan/i.test(d))) {
      for (const ing of usedIngredients) {
        if (meatWords.test(ing.name)) errors.push(`dietary conflict: ${ing.name}`);
      }
    }
  }

  const nutrition = raw.nutrition && typeof raw.nutrition === 'object' ? raw.nutrition : {};
  for (const k of ['calories', 'protein', 'carbohydrates', 'fat', 'fibre']) {
    if (!Number.isFinite(Number(nutrition[k]))) errors.push(`nutrition.${k} invalid`);
  }

  const stepTexts = instructions.map((s) => String(s.text).slice(0, 400));
  const stepIds = instructions.map((s) => (s.ingredientIds || []).map(String));
  const totalTime = Math.round(total);
  return { errors, recipe: errors.length ? null : {
    name,
    description: String(raw.description || '').slice(0, 300),
    mealType: ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(raw.mealType) ? raw.mealType : 'Dinner',
    prepTime: Math.max(0, Math.round(prep)),
    cookTime: Math.max(0, Math.round(cook)),
    totalTime,
    handsOnTime: Math.max(0, Math.round(Number(raw.handsOnTime) || prep)),
    cookingTime: totalTime,
    servings: Math.max(1, Math.round(Number(raw.servings) || filters.selectedServings || 2)),
    difficulty: ['Easy', 'Medium', 'Hard'].includes(raw.difficulty) ? raw.difficulty : 'Easy',
    method,
    equipment: Array.isArray(raw.equipment) ? raw.equipment.map(String).slice(0, 8) : [],
    preparation: {
      handsOnTime: Math.max(0, Math.round(Number(raw.handsOnTime) || prep)),
      totalSteps: stepTexts.length,
      equipment: Array.isArray(raw.equipment) ? raw.equipment.map(String).slice(0, 8) : [],
      method,
      effort: 'Low',
    },
    ingredients: usedIngredients,
    instructions: stepTexts,
    // Structured steps retained for validation/audit; dropped on save (strict schema).
    aiSteps: stepTexts.map((text, i) => ({ text, ingredientIds: stepIds[i] })),
    nutrition: {
      calories: Math.round(Number(nutrition.calories) || 0),
      protein: Math.round(Number(nutrition.protein) || 0),
      carbohydrates: Math.round(Number(nutrition.carbohydrates) || 0),
      fat: Math.round(Number(nutrition.fat) || 0),
      fibre: Math.round(Number(nutrition.fibre) || 0),
      isEstimated: true,
    },
    caloriesPerServing: Math.round(Number(nutrition.calories) || 0),
    proteinPerServing: Math.round(Number(nutrition.protein) || 0),
    fibrePerServing: Math.round(Number(nutrition.fibre) || 0),
    moodReason: String(raw.moodReason || '').slice(0, 300),
    pantryReason: String(raw.pantryReason || '').slice(0, 300),
    explanation: [String(raw.moodReason || ''), String(raw.pantryReason || '')].filter(Boolean).join(' — ').slice(0, 400),
    pantryAvailability: 100,
    matchPercentage: 100,
    isAIGenerated: true,
    aiGenerated: true,
    selectedMood: mood,
    mood,
    dietaryType: [],
    tags: [String(mood).toLowerCase(), 'ai-generated'],
    moodTags: [mood],
    image: '',
  } };
}

// ---- Public API --------------------------------------------------------------

async function generatePantryRecipes({ userId, moods, filters = {}, FoodItem, User }) {
  if (!isExplorerEnabled()) {
    const err = new Error('AI Pantry Explorer is disabled.');
    err.code = 'AI_DISABLED';
    throw err;
  }
  const provider = getProvider();
  if (!(await provider.isAvailable())) {
    const err = new Error('The local AI service (Ollama) is not running. Start Ollama and try again.');
    err.code = 'AI_UNAVAILABLE';
    throw err;
  }

  const mood = moods[0];
  const user = await User.findById(userId).lean();
  const approved = await buildApprovedIngredients(userId, FoodItem);
  const approvedById = new Map(approved.map((a) => [a.id, a]));
  // Fresh usable-stock snapshot for the final matcher verification.
  const usableInventory = (await FoodItem.find({ userId }).lean())
    .filter((i) => getExpiryStatus(i.expiryDate).status !== 'Expired');
  // Recent per-user generation history drives variety (bounded window).
  const history = await recentHistory(userId);

  const candidates = [];
  const rejections = [];
  const maxAttempts = MAX_GENERATION_ATTEMPTS();
  const seenFingerprints = new Set();

  for (let attempt = 1; attempt <= maxAttempts && candidates.length < 6; attempt++) {
    const prompt = buildPrompt({ mood, filters, approved, attempt, history });
    let text;
    try {
      const out = await provider.generate(prompt, { numPredict: 3200, temperature: 0.2, format: GENERATED_RECIPE_SCHEMA });
      text = out.text;
    } catch (e) {
      if (attempt === maxAttempts) {
        const err = new Error(e.code === 'AI_TIMEOUT' ? 'AI generation timed out. Try again with a simpler pantry.' : `AI service error: ${e.message}`);
        err.code = e.code || 'AI_ERROR';
        throw err;
      }
      continue;
    }

    const parsed = extractJsonArray(text);
    if (!parsed) {
      rejections.push('attempt produced invalid JSON');
      continue;
    }

    for (const raw of parsed.slice(0, 3)) {
      if (candidates.length >= 6) break;
      const { errors, recipe } = validateGeneratedRecipe(raw, { approvedById, mood, filters, user });
      if (recipe) {
        // Final belt-and-braces: run the recipe through the real matcher.
        const pantryCheck = matchIngredientRequirements(
          { name: recipe.name, ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, size: i.size, form: i.form })) },
          usableInventory
        );
        // Water/staple entries are auto-AVAILABLE by the matcher; every other
        // ingredient must be covered by real stock.
        const uncovered = pantryCheck.results.filter((r) => r.status === 'MISSING');
        if (uncovered.length === 0) {
          const fp = fingerprint(recipe);
          if (seenFingerprints.has(fp)) continue; // exact dup inside this batch
          seenFingerprints.add(fp);
          candidates.push(recipe);
        } else {
          rejections.push(`${recipe.name}: matcher still reports missing ${uncovered.map((u) => u.name).join(', ')}`);
        }
      } else {
        rejections.push(`${raw?.name || 'recipe'}: ${errors.slice(0, 3).join('; ')}`);
      }
    }

    // Early exit: once we have >=3 candidates with no near-duplicate pair,
    // another model call would only add latency — selection handles the rest.
    if (candidates.length >= 3) {
      const hasDup = candidates.some((a, i) =>
        candidates.slice(i + 1).some((b) => isNearDuplicate(a, b))
      );
      if (!hasDup) break;
    }
  }

  // ---- Diversity selection -------------------------------------------------
  // All candidates are already fully validated. Ranking only chooses among
  // valid recipes — suitability/validity always wins over variety.
  const selected = [];
  const pool = [...candidates];
  const historyComps = history.map((h) => ({
    ingredientIds: h.ingredientIds || [], method: h.method || '', mealType: h.mealType || '', feedback: h.feedback,
  }));

  // First pick: earliest (model's mood-best) candidate that is not a
  // near-duplicate of recent history; fall back to the first candidate.
  let firstIdx = pool.findIndex((c) => maxSimilarityTo(c, historyComps) < 0.85);
  if (firstIdx === -1) firstIdx = 0;
  if (pool.length) {
    const [first] = pool.splice(firstIdx, 1);
    selected.push(first);
  }

  // Remaining slots: greedy max diversity vs selected batch + history.
  while (selected.length < 3 && pool.length) {
    let bestIdx = 0;
    let bestScore = -1;
    pool.forEach((c, i) => {
      const score = diversityScore(c, { selected, history: historyComps });
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    // Skip candidates that are near-identical to something already selected.
    const [pick] = pool.splice(bestIdx, 1);
    if (selected.some((s) => isNearDuplicate(s, pick))) {
      if (pool.length) continue;
      break;
    }
    selected.push(pick);
  }

  // Annotate each selected recipe with fingerprint, components and variety
  // hints vs history, then persist fingerprints to the user's history window.
  const historyForTags = historyComps;
  const enriched = selected.map((r) => {
    const comps = recipeComponents(r);
    const fp = fingerprint(r);
    const nearHistory = maxSimilarityTo(r, historyForTags) >= 0.85;
    return {
      ...r,
      fingerprint: fp,
      ingredientIds: comps.ingredientIds,
      varietyTags: varietyTags(r, historyForTags),
      similarToPrevious: nearHistory,
    };
  });

  if (enriched.length) {
    await recordGenerations(userId, enriched).catch((e) => {
      console.error('AIRecipeGeneration record failed:', e.message);
    });
  }

  const exhausted = candidates.length > 0 && enriched.every((r) => r.similarToPrevious);
  return {
    recipes: enriched,
    rejections,
    approvedCount: approved.length,
    exhausted,
    message: exhausted
      ? 'You have explored the suitable combinations available in your current pantry. Add more ingredients to discover new meals.'
      : undefined,
  };
}

module.exports = { generatePantryRecipes, buildApprovedIngredients, buildPrompt, validateGeneratedRecipe, extractJsonArray };
