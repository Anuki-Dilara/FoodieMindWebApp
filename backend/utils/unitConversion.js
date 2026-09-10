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

function canConvert(unit1, unit2, ingredientName = null) {
  const normalized1 = normalizeUnit(unit1);
  const normalized2 = normalizeUnit(unit2);
  
  const type1 = getUnitType(normalized1);
  const type2 = getUnitType(normalized2);
  
  // Same type can always convert within same base
  if (type1 === type2) {
    const base1 = UNIT_TO_BASE[normalized1]?.base;
    const base2 = UNIT_TO_BASE[normalized2]?.base;
    return base1 === base2;
  }
  
  // Mass-volume conversion requires ingredient profile
  if ((type1 === 'weight' && type2 === 'liquid') || (type1 === 'liquid' && type2 === 'weight')) {
    if (!ingredientName) return false;
    const profile = require('./ingredientConversions').getIngredientConversionProfile(ingredientName);
    return profile !== null;
  }
  
  return false;
}

function convertQuantity(quantity, fromUnit, toUnit, ingredientName = null) {
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);
  
  // Same unit
  if (normalizedFrom === normalizedTo) {
    return { success: true, quantity, unit: normalizedTo, isEstimate: false };
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

function deductQuantity(currentQty, currentUnit, consumedQty, consumedUnit, ingredientName = null) {
  const normalizedCurrent = normalizeUnit(currentUnit);
  const normalizedConsumed = normalizeUnit(consumedUnit);
  
  if (!canConvert(normalizedCurrent, normalizedConsumed, ingredientName)) {
    throw new Error(`Cannot convert between ${currentUnit} and ${consumedUnit}`);
  }

  // Convert both to same unit for calculation
  const conversion = convertQuantity(consumedQty, normalizedConsumed, normalizedCurrent, ingredientName);
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
  
  // Remove preparation words
  preparationWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\s*`, 'gi');
    normalized = normalized.replace(regex, '');
  });
  
  // Remove common plural suffixes
  normalized = normalized.replace(/(ies)$/i, 'y'); // e.g., berries -> berry
  normalized = normalized.replace(/(ves)$/i, 'f'); // e.g., tomatoes -> tomato (rough approximation)
  normalized = normalized.replace(/(es)$/i, '');   // e.g., potatoes -> potato
  normalized = normalized.replace(/s$/i, '');     // e.g., bananas -> banana
  
  return normalized.trim();
}

module.exports = {
  convertToBase,
  convertFromBase,
  canConvert,
  convertQuantity,
  deductQuantity,
  formatQuantity,
  normalizeIngredientName,
  normalizeUnit,
  getUnitType,
  UNIT_TO_BASE,
  formatConversionDisplay,
};
