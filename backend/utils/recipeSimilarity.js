// Recipe similarity & fingerprinting for AI-generated recipes.
// Compares canonical ingredient identities, cooking method and meal type —
// never recipe names. Used to detect near-duplicates across generations.

const crypto = require('crypto');
const { canonicalName } = require('./ingredientIdentity');

const NEAR_DUPLICATE_THRESHOLD = 0.85;

// Canonical ingredient id set for a recipe. Plain water is excluded — it is a
// universal staple and would inflate similarity between otherwise different
// recipes.
function ingredientIdSet(recipe) {
  const ids = new Set();
  for (const ing of recipe?.ingredients || []) {
    const cid = canonicalName(ing.name || ing.id || '');
    if (cid && cid !== 'water') ids.add(cid);
  }
  return [...ids].sort();
}

function recipeComponents(recipe) {
  return {
    ingredientIds: ingredientIdSet(recipe),
    method: String(recipe?.method || recipe?.preparation?.method || 'stovetop').toLowerCase(),
    mealType: String(recipe?.mealType || '').toLowerCase(),
  };
}

// Stable fingerprint: hash of sorted ingredient ids + method + meal type.
// A title change alone produces the SAME fingerprint.
function fingerprint(recipe) {
  const c = recipeComponents(recipe);
  const raw = `${c.ingredientIds.join(',')}|${c.method}|${c.mealType}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// Similarity in [0,1]: 60% ingredient-set overlap (Jaccard), 20% cooking
// method, 20% meal type. Deterministic — no randomness.
function similarity(a, b) {
  const ca = recipeComponents(a);
  const cb = recipeComponents(b);
  const ing = jaccard(ca.ingredientIds, cb.ingredientIds);
  const method = ca.method === cb.method ? 1 : 0;
  const meal = ca.mealType === cb.mealType ? 1 : 0;
  return 0.6 * ing + 0.2 * method + 0.2 * meal;
}

// Components may be plain objects {ingredientIds, method, mealType} (history
// entries) rather than full recipes — accept both.
function similarityOf(compsA, compsB) {
  const ca = compsA.ingredientIds ? compsA : recipeComponents(compsA);
  const cb = compsB.ingredientIds ? compsB : recipeComponents(compsB);
  const ing = jaccard(ca.ingredientIds || [], cb.ingredientIds || []);
  const method = (ca.method || '') === (cb.method || '') ? 1 : 0;
  const meal = (ca.mealType || '') === (cb.mealType || '') ? 1 : 0;
  return 0.6 * ing + 0.2 * method + 0.2 * meal;
}

function isNearDuplicate(a, b) {
  return similarityOf(a, b) >= NEAR_DUPLICATE_THRESHOLD;
}

// Max similarity of `recipe` against a list of components/recipes.
// `notHelpfulPenalty` bumps similarity for entries the user disliked, so
// similar recipes are avoided more aggressively — never permanently banned.
function maxSimilarityTo(recipe, others = [], { notHelpfulPenalty = 0.15 } = {}) {
  const target = recipeComponents(recipe);
  let max = 0;
  for (const o of others) {
    let sim = similarityOf(target, o);
    if (o && o.feedback === 'not-helpful') sim = Math.min(1, sim + notHelpfulPenalty);
    if (sim > max) max = sim;
  }
  return max;
}

// Deterministic variety score in [0,1]: how different `recipe` is from both
// the already-selected batch and the user's recent history. Higher = more
// variety. Used only for ranking already-validated candidates.
function diversityScore(recipe, { selected = [], history = [] } = {}) {
  const vsSelected = selected.length ? 1 - maxSimilarityTo(recipe, selected) : 1;
  const vsHistory = history.length ? 1 - maxSimilarityTo(recipe, history) : 1;
  // Intra-batch diversity matters most; history novelty second.
  return 0.6 * vsSelected + 0.4 * vsHistory;
}

// Small human-readable variety hints vs recent history (for the UI).
function varietyTags(recipe, history = []) {
  if (!history.length) return ['New recipe'];
  const c = recipeComponents(recipe);
  const tags = [];
  const nearest = history.reduce((best, h) => {
    const s = similarityOf(c, h);
    return s > best.sim ? { sim: s, h } : best;
  }, { sim: -1, h: null });
  const hIds = new Set(nearest.h?.ingredientIds || []);
  const cIds = new Set(c.ingredientIds);
  const overlap = [...cIds].filter((x) => hIds.has(x)).length;
  const union = new Set([...cIds, ...hIds]).size || 1;
  if (overlap / union < 0.5) tags.push('Different ingredient combo');
  if (![...history].some((h) => (h.method || '') === c.method)) tags.push('Different cooking method');
  if (![...history].some((h) => (h.mealType || '') === c.mealType)) tags.push('Different meal style');
  if (!tags.length) tags.push('New variation');
  return tags.slice(0, 3);
}

module.exports = {
  NEAR_DUPLICATE_THRESHOLD,
  ingredientIdSet,
  recipeComponents,
  fingerprint,
  similarity,
  similarityOf,
  isNearDuplicate,
  maxSimilarityTo,
  diversityScore,
  varietyTags,
};
