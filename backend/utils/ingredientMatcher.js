// Quantity-aware ingredient availability matcher with three states:
//   AVAILABLE              - exact ingredient in sufficient quantity
//   SUBSTITUTE_AVAILABLE   - exact missing/insufficient, approved substitute suffices
//   MISSING                - neither exact nor substitute available
// Matching is by canonical ingredient identity only (see ingredientIdentity).

const { getExpiryStatus } = require('./expiryHelper');
const { convertQuantity, isBreadFamilyName, isCheeseFamilyName } = require('./unitConversion');
const { sameIngredient, isStapleWater } = require('./ingredientIdentity');

// Lazy-required to avoid a circular dependency with recipeEngine.
function ingredientHasAllergy(name, allergies) {
  return require('./recipeEngine').ingredientHasAllergy(name, allergies);
}

const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  SUBSTITUTE_AVAILABLE: 'SUBSTITUTE_AVAILABLE',
  MISSING: 'MISSING',
};

function nonExpiredItems(inventory = []) {
  return (inventory || []).filter((item) => getExpiryStatus(item.expiryDate).status !== 'Expired');
}

// Sum inventory quantities expressed in `targetUnit`.
// known=false means at least one item could not be converted — callers treat
// the quantity as unverifiable rather than inventing a conversion.
// `options` carries produce size/form ({ size, form }) for estimated
// ingredient-specific conversions. Returns `estimated`/`conversion` metadata
// when any item required an estimated produce conversion.
function sumAvailable(items, targetUnit, conversionName, options = {}) {
  let total = 0;
  let known = true;
  let estimated = false;
  let conversion = null;
  for (const item of items) {
    try {
      // Per-item conversion context: a bread item's own slicesPerLoaf
      // overrides the profile default for loaf<->slice math.
      const itemOpts = (item.slicesPerLoaf != null || item.slicePack)
        ? { ...options, slicesPerLoaf: item.slicesPerLoaf, slicePack: item.slicePack }
        : options;
      const conv = convertQuantity(item.quantity, item.unit, targetUnit, conversionName || targetUnit, itemOpts);
      if (conv && conv.success) {
        total += conv.quantity;
        if (conv.isEstimate && conv.conversion) {
          estimated = true;
          conversion = conversion || conv.conversion;
        }
      } else known = false;
    } catch (e) {
      known = false;
    }
  }
  return { total: Math.round(total * 100) / 100, known, estimated, conversion };
}

function soonestDaysLeft(items) {
  let soonest = Infinity;
  for (const item of items) {
    const { daysLeft } = getExpiryStatus(item.expiryDate);
    if (daysLeft < soonest) soonest = daysLeft;
  }
  return soonest;
}

// Human-readable explanation for an estimated produce conversion, e.g.
// "2 medium pieces ≈ 120 g (estimated)".
function buildConversionNote(ing, conversion) {
  if (!conversion) return null;
  const size = conversion.size ? ` ${conversion.size}` : '';
  const form = conversion.form && conversion.form !== 'whole' ? ` ${conversion.form}` : '';
  const qty = ing.quantity != null ? `${ing.quantity}${size}${form} ${ing.unit}` : '';
  const grams = conversion.grams != null ? ` ≈ ${Math.round(conversion.grams * 10) / 10} g` : '';
  const loafNote = conversion.slicesPerLoaf != null ? ` (${conversion.slicesPerLoaf} slices per loaf)` : '';
  const packNote = conversion.slicePack
    ? ` (${conversion.slicePack.weightGrams} g = ${conversion.slicePack.slices} slices)`
    : '';
  const kind = conversion.slicePack ? 'package-specific' : 'estimated';
  return `${qty}${grams}${loafNote}${packNote} — ${kind} conversion`.trim();
}

// substitutions: IngredientSubstitution docs [{originalIngredient,
// substituteIngredient, quantityRatio, instructionAdjustment, isActive, ...}]
// options.userAllergies: substitutes that conflict are never used.
function matchIngredientRequirements(recipe, inventory = [], options = {}) {
  const substitutions = (options.substitutions || []).filter((s) => s.isActive !== false);
  const userAllergies = options.userAllergies || [];
  const usable = nonExpiredItems(inventory);

  const results = [];
  const matched = [];
  const missing = [];
  const partial = [];
  const substituted = [];
  const expiringNames = [];
  let requiredCount = 0;
  let satisfiedCount = 0;
  let substituteCount = 0;
  let expiringCount = 0;

  for (const ing of recipe.ingredients || []) {
    if (ing.isOptional) continue;
    requiredCount += 1;

    const required = ing.quantity || 0;
    const name = ing.name;
    const produceOpts = { size: ing.size, form: ing.form };
    const detail = { name, required, unit: ing.unit, status: null };

    // Plain drinking water is a household staple — always available, never
    // checked against pantry quantities, never missing, never deducted.
    if (isStapleWater(name)) {
      detail.status = AVAILABILITY_STATUS.AVAILABLE;
      detail.availabilityState = 'STAPLE_AVAILABLE';
      detail.matchType = 'staple';
      detail.availableQuantity = required;
      detail.availableUnit = ing.unit;
      satisfiedCount += 1;
      matched.push({ name, quantity: ing.quantity, unit: ing.unit, status: 'AVAILABLE', inventoryItem: null });
      results.push(detail);
      continue;
    }

    // --- exact identity match ---
    const exactItems = usable.filter((item) => sameIngredient(item.name, name));
    const exactAvail = sumAvailable(exactItems, ing.unit, name, produceOpts);
    // Unverifiable quantities stay optimistic for non-produce ingredients
    // (legacy behavior), but a profiled produce item — or any bread/cheese
    // ingredient, which always requires a loaf/slice/cube profile — with an
    // unsupported conversion must NOT count as available.
    const hasProduceProfile = !!require('./produceConversionService').getProfile(name)
      || isBreadFamilyName(name) || isCheeseFamilyName(name);
    const exactSufficient = exactItems.length > 0 &&
      ((!exactAvail.known && !hasProduceProfile) || (exactAvail.known && exactAvail.total >= required));
    const daysLeft = exactItems.length ? soonestDaysLeft(exactItems) : Infinity;

    if (exactSufficient) {
      const converted = exactAvail.estimated === true;
      detail.status = AVAILABILITY_STATUS.AVAILABLE;
      detail.availabilityState = converted ? 'CONVERTED_MATCH' : 'EXACT_MATCH';
      detail.availableQuantity = exactAvail.total;
      detail.availableUnit = ing.unit;
      detail.matchType = converted ? 'converted' : 'exact';
      if (converted && exactAvail.conversion) {
        detail.conversion = exactAvail.conversion;
        detail.conversionNote = buildConversionNote(ing, exactAvail.conversion);
      }
      detail.inventoryItem = exactItems[0]?.name;
      detail.daysLeft = daysLeft === Infinity ? null : daysLeft;
      satisfiedCount += 1;
      matched.push({ name, quantity: ing.quantity, unit: ing.unit, status: 'AVAILABLE', inventoryItem: detail.inventoryItem });
      if (daysLeft <= 3 && daysLeft >= 0) {
        expiringCount += 1;
        expiringNames.push(name);
      }
      results.push(detail);
      continue;
    }

    // --- approved substitutions ---
    let substituteHit = null;
    if (exactAvail.known) {
      const deficit = Math.max(0, required - exactAvail.total);
      for (const sub of substitutions) {
        if (!sameIngredient(sub.originalIngredient, name)) continue;
        // A substitute must never bypass an allergy restriction.
        if (userAllergies.length && ingredientHasAllergy(sub.substituteIngredient, userAllergies)) continue;
        const subItems = usable.filter((item) => sameIngredient(item.name, sub.substituteIngredient));
        if (!subItems.length) continue;
        const ratio = sub.quantityRatio || 1;
        const needed = deficit > 0 ? deficit * ratio : required * ratio;
        const subAvail = sumAvailable(subItems, ing.unit, sub.substituteIngredient, produceOpts);
        if (!subAvail.known || subAvail.total >= needed) {
          substituteHit = {
            substituteIngredient: sub.substituteIngredient,
            substituteQuantity: Math.round(needed * 100) / 100,
            substituteUnit: ing.unit,
            ratio,
            instructionAdjustment: sub.instructionAdjustment || null,
            conversionRule: sub.conversionRule || null,
            availableQuantity: subAvail.total,
          };
          break;
        }
      }
    } else {
      // Quantity unverifiable for the exact item — still try substitutes.
      for (const sub of substitutions) {
        if (!sameIngredient(sub.originalIngredient, name)) continue;
        if (userAllergies.length && ingredientHasAllergy(sub.substituteIngredient, userAllergies)) continue;
        const subItems = usable.filter((item) => sameIngredient(item.name, sub.substituteIngredient));
        if (!subItems.length) continue;
        substituteHit = {
          substituteIngredient: sub.substituteIngredient,
          substituteQuantity: Math.round(required * (sub.quantityRatio || 1) * 100) / 100,
          substituteUnit: ing.unit,
          ratio: sub.quantityRatio || 1,
          instructionAdjustment: sub.instructionAdjustment || null,
          conversionRule: sub.conversionRule || null,
          availableQuantity: null,
        };
        break;
      }
    }

    if (substituteHit) {
      detail.status = AVAILABILITY_STATUS.SUBSTITUTE_AVAILABLE;
      detail.matchType = 'substitute';
      detail.substitute = substituteHit;
      detail.availableQuantity = exactAvail.total;
      detail.hasPartialExact = exactItems.length > 0;
      substituteCount += 1;
      substituted.push({
        name,
        required,
        unit: ing.unit,
        substituteIngredient: substituteHit.substituteIngredient,
        substituteQuantity: substituteHit.substituteQuantity,
        substituteUnit: substituteHit.substituteUnit,
        note: substituteHit.instructionAdjustment,
        status: 'SUBSTITUTE_AVAILABLE',
      });
      results.push(detail);
      continue;
    }

    // --- missing ---
    detail.status = AVAILABILITY_STATUS.MISSING;
    detail.matchType = 'none';
    detail.availableQuantity = exactAvail.total;
    detail.hasPartialExact = exactItems.length > 0 && exactAvail.known && exactAvail.total > 0 && exactAvail.total < required;
    if (detail.hasPartialExact) {
      partial.push({ name, required, unit: ing.unit, available: exactAvail.total });
    }
    missing.push(name);
    results.push(detail);
  }

  const availability = requiredCount > 0 ? (satisfiedCount / requiredCount) * 100 : 0;
  const substituteCoverage = requiredCount > 0 ? (substituteCount / requiredCount) * 100 : 0;

  return {
    results,
    matched,
    missing,
    partial,
    substituted,
    matchedNames: matched.map((m) => m.name),
    missingNames: missing,
    substitutedNames: substituted.map((s) => s.name),
    requiredCount,
    satisfiedCount,
    substituteCount,
    availability: Math.min(100, Math.round(availability * 10) / 10),
    substituteCoverage: Math.min(100, Math.round(substituteCoverage * 10) / 10),
    canCook: requiredCount > 0 && satisfiedCount === requiredCount,
    canCookWithSubstitutes: requiredCount > 0 && satisfiedCount + substituteCount === requiredCount,
    expiringCount,
    expiringNames: [...new Set(expiringNames)],
  };
}

module.exports = { matchIngredientRequirements, AVAILABILITY_STATUS };
