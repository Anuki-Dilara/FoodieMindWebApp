// Ingredient-specific conversion registry
// Source: King Arthur Baking Ingredient Weight Chart and standard culinary references

const UNIT_ALIASES = {
  // Volume units
  'l': 'l',
  'L': 'l',
  'litre': 'l',
  'litres': 'l',
  'liter': 'l',
  'liters': 'l',
  'ml': 'ml',
  'millilitre': 'ml',
  'millilitres': 'ml',
  'milliliter': 'ml',
  'milliliters': 'ml',
  'cups': 'cups',
  'cup': 'cups',
  'tablespoons': 'tablespoons',
  'tablespoon': 'tablespoons',
  'tbsp': 'tablespoons',
  'teaspoons': 'teaspoons',
  'teaspoon': 'teaspoons',
  'tsp': 'teaspoons',
  
  // Weight units
  'kg': 'kg',
  'kilogram': 'kg',
  'kilograms': 'kg',
  'g': 'g',
  'gram': 'g',
  'grams': 'g',
  
  // Count units
  'pieces': 'pieces',
  'piece': 'pieces',
  'packets': 'packets',
  'packet': 'packets',
  'slices': 'pieces',
  'slice': 'pieces',
};

function normalizeUnit(unit) {
  if (!unit) return null;
  const normalized = unit.toLowerCase().trim();
  return UNIT_ALIASES[normalized] || normalized;
}

// Ingredient-specific mass-volume conversion profiles
// Source: King Arthur Baking Ingredient Weight Chart (https://www.kingarthurbaking.com/learn/ingredient-weight-chart)
const INGREDIENT_CONVERSIONS = {
  // Salts (specific types require different densities)
  'fine table salt': {
    gramsPerTablespoon: 18,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'fine'
  },
  'coarse salt': {
    gramsPerTablespoon: 12,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'coarse'
  },
  'salt': {
    gramsPerTablespoon: 18, // Default to fine table salt
    source: 'King Arthur Baking (default to fine)',
    isEstimate: true,
    preparation: 'fine (default)'
  },
  
  // Sweeteners
  'honey': {
    gramsPerTablespoon: 21,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'liquid'
  },
  'sugar': {
    gramsPerTablespoon: 12.5,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'granulated'
  },
  'brown sugar': {
    gramsPerTablespoon: 14,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'packed'
  },
  
  // Fats
  'butter': {
    gramsPerTablespoon: 14.125, // 113g / 8 tablespoons
    source: 'Standard culinary reference',
    isEstimate: false,
    preparation: 'solid'
  },
  'oil': {
    gramsPerTablespoon: 14,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'liquid'
  },
  'coconut oil': {
    gramsPerTablespoon: 13.6,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'solid/liquid'
  },
  
  // Spices
  'cinnamon': {
    gramsPerTablespoon: 7.8,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'ground'
  },
  'ground cinnamon': {
    gramsPerTablespoon: 7.8,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'ground'
  },
  'curry powder': {
    gramsPerTablespoon: 8,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'ground'
  },
  'turmeric': {
    gramsPerTablespoon: 9,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'ground'
  },
  'ginger': {
    gramsPerTablespoon: 5,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'ground'
  },
  'garlic': {
    gramsPerTablespoon: 9,
    source: 'Standard culinary reference',
    isEstimate: true,
    preparation: 'minced'
  },
  
  // Dry ingredients
  'flour': {
    gramsPerTablespoon: 8,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'all-purpose'
  },
  'all-purpose flour': {
    gramsPerTablespoon: 8,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'all-purpose'
  },
  'baking powder': {
    gramsPerTablespoon: 12,
    source: 'King Arthur Baking',
    isEstimate: true,
    preparation: 'powder'
  },
};

function getIngredientConversionProfile(ingredientName) {
  const normalized = ingredientName.toLowerCase().trim();
  
  // Check for exact match first
  if (INGREDIENT_CONVERSIONS[normalized]) {
    return INGREDIENT_CONVERSIONS[normalized];
  }
  
  // Check for partial matches (e.g., "ground cinnamon" matches "cinnamon")
  for (const [key, profile] of Object.entries(INGREDIENT_CONVERSIONS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return profile;
    }
  }
  
  return null; // No conversion profile available
}

function convertMassToVolume(grams, toUnit, ingredientName) {
  const profile = getIngredientConversionProfile(ingredientName);
  if (!profile) {
    return { success: false, message: 'Conversion information needed' };
  }
  
  if (toUnit === 'tablespoons' || toUnit === 'tbsp') {
    const tablespoons = grams / profile.gramsPerTablespoon;
    return { 
      success: true, 
      quantity: tablespoons, 
      unit: 'tablespoons',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  if (toUnit === 'teaspoons' || toUnit === 'tsp') {
    const teaspoons = grams / (profile.gramsPerTablespoon / 3);
    return { 
      success: true, 
      quantity: teaspoons, 
      unit: 'teaspoons',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  if (toUnit === 'ml' && profile.gramsPerMilliliter) {
    const ml = grams / profile.gramsPerMilliliter;
    return { 
      success: true, 
      quantity: ml, 
      unit: 'ml',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  return { success: false, message: 'Unsupported target unit for mass-volume conversion' };
}

function convertVolumeToMass(volume, fromUnit, ingredientName) {
  const profile = getIngredientConversionProfile(ingredientName);
  if (!profile) {
    return { success: false, message: 'Conversion information needed' };
  }
  
  if (fromUnit === 'tablespoons' || fromUnit === 'tbsp') {
    const grams = volume * profile.gramsPerTablespoon;
    return { 
      success: true, 
      quantity: grams, 
      unit: 'g',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  if (fromUnit === 'teaspoons' || fromUnit === 'tsp') {
    const grams = volume * (profile.gramsPerTablespoon / 3);
    return { 
      success: true, 
      quantity: grams, 
      unit: 'g',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  if (fromUnit === 'ml' && profile.gramsPerMilliliter) {
    const grams = volume * profile.gramsPerMilliliter;
    return { 
      success: true, 
      quantity: grams, 
      unit: 'g',
      isEstimate: profile.isEstimate,
      source: profile.source
    };
  }
  
  return { success: false, message: 'Unsupported source unit for volume-mass conversion' };
}

function formatConversionDisplay(quantity, unit, convertedQuantity, convertedUnit, isEstimate) {
  const displayQty = Math.round(convertedQuantity * 100) / 100;
  const symbol = isEstimate ? '≈' : '=';
  return `${quantity} ${unit} ${symbol} ${displayQty} ${convertedUnit}`;
}

module.exports = {
  UNIT_ALIASES,
  normalizeUnit,
  INGREDIENT_CONVERSIONS,
  getIngredientConversionProfile,
  convertMassToVolume,
  convertVolumeToMass,
  formatConversionDisplay,
};