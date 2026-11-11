// Canonical ingredient identity service.
// Single source of truth for "are these the same ingredient?" across
// inventory matching, recipe requirements and substitutions.
//
// Identity = normalizeIngredientName() output, which already handles
// case/whitespace/punctuation, preparation words, plurals and the curated
// INGREDIENT_ALIASES synonym map. Two names match ONLY when their canonical
// identities are identical — never by category or substring.

const { normalizeIngredientName } = require('./unitConversion');

function canonicalName(name) {
  if (typeof name !== 'string' || !name.trim()) return '';
  try {
    return normalizeIngredientName(name);
  } catch (e) {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }
}

// Stable identifier for an ingredient (its canonical name).
function canonicalId(name) {
  return canonicalName(name);
}

function sameIngredient(a, b) {
  const ca = canonicalName(a);
  const cb = canonicalName(b);
  return ca !== '' && ca === cb;
}

// All inventory items that are the exact same ingredient as `name`.
function findMatchingItems(name, inventory = []) {
  return (inventory || []).filter((item) => sameIngredient(item.name, name));
}

module.exports = { canonicalName, canonicalId, sameIngredient, findMatchingItems };
