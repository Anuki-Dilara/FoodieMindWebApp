// Unit conversion utilities for inventory management
const { normalizeUnit, convertMassToVolume, convertVolumeToMass, formatConversionDisplay } = require('./ingredientConversions');

const LIQUID_UNITS = ['ml', 'l', 'cups'];
const WEIGHT_UNITS = ['g', 'kg'];
const COUNT_UNITS = ['pieces', 'packets'];
const VOLUME_UNITS = ['ml', 'l', 'cups', 'tablespoons', 'teaspoons'];

const UNIT_TO_BASE = {
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  pieces: { base: 'pieces', factor: 1 },
  packets: { base: 'packets', factor: 1 },
  cups: { base: 'ml', factor: 240 },
  tablespoons: { base: 'ml', factor: 15 },
  teaspoons: { base: 'ml', factor: 5 },
  // Count-like units: one unit ≈ one countable item
  can: { base: 'pieces', factor: 1 },
  loaf: { base: 'pieces', factor: 1 },
  bunch: { base: 'pieces', factor: 1 },
  bulb: { base: 'pieces', factor: 1 },
  // Produce-specific count units (real conversion via produce profiles)
  head: { base: 'pieces', factor: 1 },
  clove: { base: 'pieces', factor: 1 },
  stalk: { base: 'pieces', factor: 1 },
  ear: { base: 'pieces', factor: 1 },
  cob: { base: 'pieces', factor: 1 },
  wedge: { base: 'pieces', factor: 1 },
  slice: { base: 'pieces', factor: 1 },
  segment: { base: 'pieces', factor: 1 },
  pod: { base: 'pieces', factor: 1 },
  sprig: { base: 'pieces', factor: 1 },
  whole: { base: 'pieces', factor: 1 },
  cube: { base: 'pieces', factor: 1 },
};

function getUnitType(unit) {
  const normalized = normalizeUnit(unit);
  if (LIQUID_UNITS.includes(normalized) || normalized === 'tablespoons' || normalized === 'teaspoons') return 'liquid';
  if (WEIGHT_UNITS.includes(normalized)) return 'weight';
  return 'count';
}

function convertToBase(quantity, unit) {
  const normalized = normalizeUnit(unit);
  const config = UNIT_TO_BASE[normalized];
  if (!config) return { quantity, baseUnit: normalized };
  return { quantity: quantity * config.factor, baseUnit: config.base };
}

function convertFromBase(quantity, baseUnit, targetUnit) {
  const normalizedTarget = normalizeUnit(targetUnit);
  const config = UNIT_TO_BASE[normalizedTarget];
  if (!config || config.base !== baseUnit) {
    return { quantity, unit: baseUnit };
  }
  return { quantity: quantity / config.factor, unit: normalizedTarget };
}

function canConvert(unit1, unit2, ingredientName = null, options = {}) {
  const normalized1 = normalizeUnit(unit1);
  const normalized2 = normalizeUnit(unit2);
  
  const type1 = getUnitType(normalized1);
  const type2 = getUnitType(normalized2);
  
  // Same type can always convert within same base
  if (type1 === type2) {
    const base1 = UNIT_TO_BASE[normalized1]?.base;
    const base2 = UNIT_TO_BASE[normalized2]?.base;
    if (base1 === base2) {
      // Produce count units still need an ingredient profile to be meaningful
      // (e.g. 3 cloves != 3 pieces of garlic).
      if (ingredientName && type1 === 'count' && normalized1 !== normalized2) {
        return require('./produceConversionService').isProduceConvertible(unit1, unit2, ingredientName);
      }
      return true;
    }
  }
  
  // Mass-volume conversion requires ingredient profile
  if ((type1 === 'weight' && type2 === 'liquid') || (type1 === 'liquid' && type2 === 'weight')) {
    if (ingredientName) {
      if (require('./produceConversionService').isProduceConvertible(unit1, unit2, ingredientName)) return true;
      const profile = require('./ingredientConversions').getIngredientConversionProfile(ingredientName);
      return profile !== null;
    }
    return false;
  }
  
  // Weight/count and volume/count pairs need an ingredient-specific profile
  if (ingredientName) {
    return require('./produceConversionService').isProduceConvertible(unit1, unit2, ingredientName);
  }
  
  return false;
}

function convertQuantity(quantity, fromUnit, toUnit, ingredientName = null, options = {}) {
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);

  // Same unit — exact, never an estimate
  if (normalizedFrom === normalizedTo) {
    return { success: true, quantity, unit: normalizedTo, isEstimate: false };
  }

  // Ingredient-specific produce conversions (count <-> weight/volume) take
  // precedence when a profile exists for this ingredient.
  const produceResult = require('./produceConversionService').tryConvert(
    quantity, fromUnit, toUnit, ingredientName, options
  );
  if (produceResult) return produceResult;

  // Bread/cheese loaf<->slice/cube conversions REQUIRE an ingredient profile —
  // the generic count fallback would wrongly treat 1 loaf = 1 slice etc.
  if (requiresConversionProfile(ingredientName, normalizedFrom, normalizedTo)) {
    return { success: false, message: `No ${ingredientName} conversion profile available for these units` };
  }

  // Direct unit conversion within same type
  if (canConvert(normalizedFrom, normalizedTo)) {
    const base = convertToBase(quantity, normalizedFrom);
    const converted = convertFromBase(base.quantity, base.baseUnit, normalizedTo);
    return { success: true, quantity: converted.quantity, unit: converted.unit, isEstimate: false };
  }
  
  // Mass-volume conversion
  if (getUnitType(normalizedFrom) === 'weight' && getUnitType(normalizedTo) === 'liquid') {
    return convertMassToVolume(quantity, normalizedTo, ingredientName);
  }
  
  if (getUnitType(normalizedFrom) === 'liquid' && getUnitType(normalizedTo) === 'weight') {
    return convertVolumeToMass(quantity, normalizedFrom, ingredientName);
  }
  
  return { success: false, message: 'Cannot convert between these units' };
}

function deductQuantity(currentQty, currentUnit, consumedQty, consumedUnit, ingredientName = null, options = {}) {
  const normalizedCurrent = normalizeUnit(currentUnit);
  const normalizedConsumed = normalizeUnit(consumedUnit);
  
  if (!canConvert(normalizedCurrent, normalizedConsumed, ingredientName, options)) {
    throw new Error(`Cannot convert between ${currentUnit} and ${consumedUnit}`);
  }

  // Convert both to same unit for calculation
  const conversion = convertQuantity(consumedQty, normalizedConsumed, normalizedCurrent, ingredientName, options);
  if (!conversion.success) {
    throw new Error(conversion.message);
  }
  
  const consumedInCurrentUnit = conversion.quantity;
  const remaining = currentQty - consumedInCurrentUnit;

  if (remaining <= 0) {
    return { quantity: 0, unit: normalizedCurrent, isEmpty: true, isEstimate: conversion.isEstimate };
  }

  return {
    quantity: Math.round(remaining * 100) / 100,
    unit: normalizedCurrent,
    isEmpty: false,
    isEstimate: conversion.isEstimate
  };
}

function formatQuantity(quantity, unit) {
  if (quantity === 0) return '0';
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`;
}

// Canonical ingredient aliases: maps a normalized name to the canonical name
// used for matching. Only true synonyms / regional spellings are mapped —
// different foods are never merged.
const INGREDIENT_ALIASES = {
  'dhal': 'red lentil',
  'thurdhal': 'red lentil',
  'parippu': 'red lentil',
  'chilli': 'chili',
  'chilly': 'chili',
  'chiles': 'chili',
  'green chilly': 'chili',
  'green chilli': 'chili',
  'chilli powder': 'chili powder',
  'chilly powder': 'chili powder',
  'chile powder': 'chili powder',
  'spring onion': 'green onion',
  'capsicum': 'bell pepper',
  'yoghurt': 'yogurt',
  'curd': 'yogurt',
  'beancurd': 'tofu',
  'white rice': 'rice',
  'wheat flour': 'flour',
  'red onion': 'onion',
  'chicken breast': 'chicken',
  'cooking oil': 'oil',
  'black pepper': 'pepper',
  'turmeric powder': 'turmeric',
  'cinnamon stick': 'cinnamon',
  // Sri Lankan / local produce names -> confirmed English identities
  'b onion': 'onion',
  'big onion': 'onion',
  'white onion': 'onion',
  'rathala': 'sweet potato',
  'karawila': 'bitter gourd',
  'wattakka': 'pumpkin',
  'murunga': 'drumstick',
  'kola gowa': 'cabbage',
  'cilantro': 'coriander',
  'coriander leaf': 'coriander',
  'coriander leaves': 'coriander',
  'mint leaf': 'mint',
  'mint leaves': 'mint',
  'corn on the cob': 'sweet corn',
  'corn cob': 'sweet corn',
  'sweetcorn': 'sweet corn',
  'bell capsicum': 'bell pepper',
  'green chili': 'chili',
  'green chillie': 'chili',
  // Bread synonyms — verified equivalents only. Different bread types
  // (white/whole wheat/sourdough/…) remain distinct canonical identities.
  'loaf of bread': 'bread',
  'bread loaf': 'bread',
  'toast': 'bread',
  'sandwich bread': 'white bread',
  'sandwich loaf': 'white bread',
  'white sandwich bread': 'white bread',
  'brown bread': 'whole wheat bread',
  'wholemeal bread': 'whole wheat bread',
  'whole wheat': 'whole wheat bread',
  'wheat bread': 'whole wheat bread',
  'sourdough': 'sourdough bread',
  'dinner roll': 'bread roll',
  'gluten free bread': 'gluten-free bread',
  'celiac bread': 'gluten-free bread',
  // Cheese synonyms — verified equivalents only. Different cheese types
  // (cheddar/mozzarella/parmesan/…) remain distinct canonical identities.
  'cheddar': 'cheddar cheese',
  'mozzarella cheese': 'mozzarella',
  'american cheese': 'processed cheese',
  'cheese slice': 'processed cheese',
  'cheese slices': 'processed cheese',
  'gouda cheese': 'gouda',
  'swiss': 'swiss cheese',
  'parmesan cheese': 'parmesan',
  'feta cheese': 'feta',
  'monterey jack cheese': 'monterey jack',
  'jack cheese': 'monterey jack',
  'provolone cheese': 'provolone',
  'colby cheese': 'colby',
  'colby jack': 'colby',
  'ricotta cheese': 'ricotta',
  'halloumi cheese': 'halloumi',
};

// Bread-family canonical names (incl. 'bread roll'). Used to block the
// generic count fallback for loaf<->slice pairs — those conversions are only
// valid through an ingredient-specific bread profile.
function isBreadFamilyName(name) {
  try {
    const ca = normalizeIngredientName(name);
    return ca === 'bread' || ca.endsWith(' bread') || ca === 'bread roll' || ca.endsWith(' bread roll');
  } catch (e) {
    return false;
  }
}

// Cheese-family canonical names (generic 'cheese' and '* cheese').
function isCheeseFamilyName(name) {
  try {
    const ca = normalizeIngredientName(name);
    return ca === 'cheese' || ca.endsWith(' cheese');
  } catch (e) {
    return false;
  }
}

// Units whose conversions are only meaningful through an ingredient-specific
// profile — never via the generic count fallback.
const PROFILE_REQUIRED_UNITS = new Set(['loaf', 'slice', 'cube']);

// True when this ingredient+unit pair MUST go through a conversion profile:
// bread/cheese families for loaf/slice/cube units.
function requiresConversionProfile(name, fromUnit, toUnit) {
  const nf = normalizeUnit(fromUnit);
  const nt = normalizeUnit(toUnit);
  const needs = PROFILE_REQUIRED_UNITS.has(nf) || PROFILE_REQUIRED_UNITS.has(nt);
  if (!needs || !name) return false;
  return isBreadFamilyName(name) || isCheeseFamilyName(name);
}

function canonicalIngredientName(normalized) {
  return INGREDIENT_ALIASES[normalized] || normalized;
}

function normalizeIngredientName(name) {
  // Validate input type
  if (typeof name !== 'string') {
    throw new Error(`normalizeIngredientName expects a string, got ${typeof name}`);
  }
  
  if (!name) {
    throw new Error('normalizeIngredientName received empty string');
  }
  
  // Common preparation words to strip
  const preparationWords = [
    'sliced', 'chopped', 'diced', 'minced', 'crushed', 'grated', 'peeled',
    'cooked', 'raw', 'fresh', 'dried', 'frozen', 'canned', 'ground',
    'whole', 'halved', 'quartered', 'cubed', 'shredded', 'mashed'
  ];
  
  let normalized = name.toLowerCase().trim();

  // Drop parenthetical notes, e.g. "Dhal (Red Lentils)" -> "dhal"
  normalized = normalized.replace(/\(.*?\)/g, ' ');
  
  // Remove preparation words
  preparationWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\s*`, 'gi');
    normalized = normalized.replace(regex, '');
  });
  
  // Remove common plural suffixes
  normalized = normalized.replace(/(ies)$/i, 'y'); // e.g., berries -> berry
  normalized = normalized.replace(/(ves)$/i, 'f'); // e.g., tomatoes -> tomato (rough approximation)
  normalized = normalized.replace(/(o|a|e|s|x|z|ch|sh)es$/i, '$1'); // e.g., tomatoes -> tomato, dishes -> dish (but not noodles -> noodl)
  normalized = normalized.replace(/s$/i, '');     // e.g., bananas -> banana
  
  normalized = normalized.trim().replace(/\s+/g, ' ');
  return canonicalIngredientName(normalized);
}

module.exports = {
  convertToBase,
  convertFromBase,
  canConvert,
  convertQuantity,
  deductQuantity,
  formatQuantity,
  normalizeIngredientName,
  INGREDIENT_ALIASES,
  canonicalIngredientName,
  normalizeUnit,
  getUnitType,
  isBreadFamilyName,
  isCheeseFamilyName,
  requiresConversionProfile,
  UNIT_TO_BASE,
  formatConversionDisplay,
};
