const IngredientSubstitution = require('../models/IngredientSubstitution');
const { ingredientExactMatch } = require('../utils/recipeEngine');
const { convertQuantity } = require('../utils/unitConversion');

async function findSubstitutions(missingIngredients, inventory, recipeType = null) {
  const availableSubstitutions = [];

  for (const missing of missingIngredients) {
    const substitutes = await IngredientSubstitution.find({
      originalIngredient: missing.name,
      isActive: true,
    });

    for (const sub of substitutes) {
      // Check if substitute is in inventory
      const matchingItems = inventory.filter((item) =>
        ingredientExactMatch(sub.substituteIngredient, item.name)
      );

      if (matchingItems.length === 0) continue;

      // Check if suitable for recipe type
      if (recipeType && sub.unsuitableRecipeTypes?.includes(recipeType)) {
        continue;
      }

      // Calculate substitute quantity
      const substituteQuantity = missing.quantity * sub.quantityRatio;

      // Check if sufficient quantity of substitute is available
      let totalAvailable = 0;
      for (const item of matchingItems) {
        try {
          const conversion = convertQuantity(item.quantity, item.unit, missing.unit, sub.substituteIngredient);
          if (conversion.success) {
            totalAvailable += conversion.quantity;
          }
        } catch (e) {
          // Conversion error
        }
      }

      if (totalAvailable >= substituteQuantity) {
        availableSubstitutions.push({
          originalIngredient: missing.name,
          substituteIngredient: sub.substituteIngredient,
          originalQuantity: missing.quantity,
          originalUnit: missing.unit,
          substituteQuantity,
          substituteUnit: missing.unit,
          conversionRule: sub.conversionRule,
          instructionAdjustment: sub.instructionAdjustment,
          allergenInformation: sub.allergenInformation,
          dietaryNotes: sub.dietaryNotes,
          substitutionId: sub._id,
        });
      }
    }
  }

  return availableSubstitutions;
}

async function applySubstitution(recipe, substitution, user) {
  // Recheck allergies and dietary restrictions
  if (user.allergies?.length > 0) {
    const hasAllergy = user.allergies.some((allergy) =>
      substitution.substituteIngredient.toLowerCase().includes(allergy.toLowerCase())
    );
    if (hasAllergy) {
      return { success: false, reason: 'Allergy conflict with substitute' };
    }
  }

  if (user.dietaryPreferences?.length > 0) {
    // Check if substitute violates dietary preferences
    // This is a simplified check - could be more sophisticated
    if (substitution.dietaryNotes?.includes('vegan') && !user.dietaryPreferences.includes('vegan')) {
      // Not necessarily a conflict, but could be
    }
  }

  // Apply substitution to recipe
  const updatedIngredients = recipe.ingredients.map((ing) => {
    if (ing.name === substitution.originalIngredient) {
      return {
        ...ing,
        name: substitution.substituteIngredient,
        quantity: substitution.substituteQuantity,
        unit: substitution.substituteUnit,
        _substituted: true,
        _originalName: substitution.originalIngredient,
      };
    }
    return ing;
  });

  // Update instructions if needed
  const updatedInstructions = substitution.instructionAdjustment
    ? [
        ...recipe.instructions,
        `Substitution note: ${substitution.instructionAdjustment}`,
      ]
    : recipe.instructions;

  return {
    success: true,
    updatedRecipe: {
      ...recipe.toObject ? recipe.toObject() : recipe,
      ingredients: updatedIngredients,
      instructions: updatedInstructions,
    },
  };
}

module.exports = {
  findSubstitutions,
  applySubstitution,
};
