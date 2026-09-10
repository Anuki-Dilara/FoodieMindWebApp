// Unit conversion utilities for inventory management

const LIQUID_UNITS = ['ml', 'l', 'cups'];
const WEIGHT_UNITS = ['g', 'kg'];
const COUNT_UNITS = ['pieces', 'packets'];

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
  if (LIQUID_UNITS.includes(unit) || unit === 'tablespoons' || unit === 'teaspoons') return 'liquid';
  if (WEIGHT_UNITS.includes(unit)) return 'weight';
  return 'count';
}

function convertToBase(quantity, unit) {
  const config = UNIT_TO_BASE[unit];
  if (!config) return { quantity, baseUnit: unit };
  return { quantity: quantity * config.factor, baseUnit: config.base };
}

function convertFromBase(quantity, baseUnit, targetUnit) {
  const config = UNIT_TO_BASE[targetUnit];
  if (!config || config.base !== baseUnit) {
    return { quantity, unit: baseUnit };
  }
  return { quantity: quantity / config.factor, unit: targetUnit };
}

function canConvert(unit1, unit2) {
  const type1 = getUnitType(unit1);
  const type2 = getUnitType(unit2);
  if (type1 !== type2) return false;
  const base1 = UNIT_TO_BASE[unit1]?.base;
  const base2 = UNIT_TO_BASE[unit2]?.base;
  return base1 === base2;
}

function deductQuantity(currentQty, currentUnit, consumedQty, consumedUnit) {
  if (!canConvert(currentUnit, consumedUnit)) {
    throw new Error(`Cannot convert between ${currentUnit} and ${consumedUnit}`);
  }

  const current = convertToBase(currentQty, currentUnit);
  const consumed = convertToBase(consumedQty, consumedUnit);

  const remaining = current.quantity - consumed.quantity;

  if (remaining <= 0) {
    return { quantity: 0, unit: current.baseUnit, isEmpty: true };
  }

  const display = convertFromBase(remaining, current.baseUnit, currentUnit);
  return {
    quantity: Math.round(display.quantity * 100) / 100,
    unit: display.unit,
    baseQuantity: remaining,
    baseUnit: current.baseUnit,
    isEmpty: false,
  };
}

function formatQuantity(quantity, unit) {
  if (quantity === 0) return '0';
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unit}`;
}

function normalizeIngredientName(name) {
  return name.toLowerCase().trim().replace(/s$/, '');
}

module.exports = {
  convertToBase,
  convertFromBase,
  canConvert,
  deductQuantity,
  formatQuantity,
  normalizeIngredientName,
  getUnitType,
  UNIT_TO_BASE,
};
