import { useState, useEffect } from 'react';
import CuteButton from './CuteButton';
import API from '../utils/api';

export default function CookRecipeModal({ isOpen, onClose, recipe, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const [ingredientAvailability, setIngredientAvailability] = useState([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  useEffect(() => {
    if (isOpen && recipe) {
      fetchIngredientAvailability();
    }
  }, [isOpen, recipe]);

  const fetchIngredientAvailability = async () => {
    setCheckingAvailability(true);
    try {
      const res = await API.get(`/recipes/${recipe._id}/ingredient-check`);
      setIngredientAvailability(res.data.ingredients || []);
    } catch (error) {
      console.error('Failed to check ingredient availability:', error);
      setIngredientAvailability([]);
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleCook = async () => {
    setLoading(true);
    try {
      await onConfirm(recipe);
      onClose();
    } catch (error) {
      // Keep modal open on error
    } finally {
      setLoading(false);
    }
  };

  const getIngredientStatus = (ing) => {
    const availability = ingredientAvailability.find(a => a.name === ing.name);
    if (!availability) return { status: 'missing', color: 'text-danger', icon: '❌' };
    if (availability.hasEnough) return { status: 'available', color: 'text-success', icon: '✅' };
    return { status: 'insufficient', color: 'text-warning', icon: '⚠️' };
  };

  const canCookRecipe = () => {
    if (checkingAvailability) return false;
    return ingredientAvailability.length > 0 && ingredientAvailability.every(ing => 
      ing.hasEnough || ing.status === 'optional'
    );
  };

  const getCookingMessage = () => {
    if (checkingAvailability) return 'Checking ingredient availability...';
    
    const needsConversion = ingredientAvailability.some(ing => ing.status === 'conversion_needed');
    if (needsConversion) {
      return 'Some ingredients need conversion information. Add the missing conversion details to enable cooking.';
    }
    
    if (canCookRecipe()) return 'You have enough ingredients to cook this recipe.';
    return 'You don\'t have enough ingredients to cook this recipe. Add the missing quantities to your inventory first.';
  };

  if (!isOpen || !recipe) return null;

  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft max-w-2xl w-full animate-fade-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-primary/10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-charcoal mb-1">👨‍🍳 Cook {recipe.name}?</h2>
              <div className="flex items-center gap-4 text-sm text-charcoal/60">
                <span>⏱ {recipe.cookingTime} min</span>
                <span>🍽 {recipe.servings} servings</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-charcoal/40 hover:text-charcoal transition-colors p-1"
              disabled={loading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Recipe Image */}
          <div className="mb-6">
            {recipe.image ? (
              <img
                src={recipe.image}
                alt={recipe.name}
                className="w-full h-48 object-cover rounded-xl"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="w-full h-48 bg-gradient-to-br from-primary/30 to-secondary/30 rounded-xl flex items-center justify-center">
              <span className="text-6xl">🍳</span>
            </div>
          </div>

          {/* Recipe Meta */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs bg-info/20 text-charcoal px-3 py-1 rounded-lg">{recipe.mealType}</span>
            <span className="text-xs bg-primary/20 text-charcoal px-3 py-1 rounded-lg">{recipe.difficulty}</span>
            {recipe.dietaryType?.slice(0, 2).map((d) => (
              <span key={d} className="text-xs bg-secondary/30 text-charcoal px-3 py-1 rounded-lg">{d}</span>
            ))}
          </div>

          {/* Description */}
          <div className="mb-6">
            <h3 className="font-semibold text-charcoal mb-2">📝 Description</h3>
            <p className="text-sm text-charcoal/70">{recipe.description}</p>
          </div>

          {/* Ingredients */}
          <div className="mb-6">
            <h3 className="font-semibold text-charcoal mb-3">🥣 Ingredients</h3>
            <div className="bg-cream rounded-xl p-4 space-y-2">
              {recipe.ingredients?.map((ing, i) => {
                const { status, color, icon } = getIngredientStatus(ing);
                const availability = ingredientAvailability.find(a => a.name === ing.name);

                // Build conversion display
                let conversionDisplay = null;
                let requiredDisplay = `${ing.quantity} ${ing.unit}`;

                if (availability && availability.requiredInOriginalUnit) {
                  const req = availability.requiredInOriginalUnit;
                  requiredDisplay = `${ing.quantity} ${ing.unit} ≈ ${req.quantity} ${req.unit}`;
                }

                if (availability && availability.conversionInfo && availability.conversionInfo.isEstimate) {
                  const conv = availability.conversionInfo;
                  conversionDisplay = (
                    <div className="text-xs text-charcoal/50 italic">
                      {conv.originalQuantity} {conv.originalUnit} ≈ {conv.convertedQuantity} {conv.convertedUnit} (estimated)
                    </div>
                  );
                }

                return (
                  <div key={i} className="flex justify-between items-start py-2 border-b border-primary/10 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={color}>{icon}</span>
                      <span className="text-sm">{ing.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">Required: {requiredDisplay}</div>
                      {availability && (
                        <>
                          <div className="text-xs text-charcoal/60">
                            Available: {availability.available} {availability.unitAvailable || availability.unit}
                            {availability.remaining !== undefined && availability.remaining > 0 && (
                              <span className="text-success ml-2">• After cooking: {availability.remaining} {ing.unit}</span>
                            )}
                          </div>
                          {status === 'insufficient' && availability.missing > 0 && (
                            <div className="text-xs text-warning">
                              Short: {availability.missing} {ing.unit}
                            </div>
                          )}
                          {availability.missingInfo && (
                            <div className="text-xs text-warning">
                              {availability.missingInfo}
                            </div>
                          )}
                          {conversionDisplay}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Instructions */}
          <div className="mb-6">
            <h3 className="font-semibold text-charcoal mb-3">👩‍🍳 Cooking Instructions</h3>
            <div className="bg-cream rounded-xl p-4 space-y-3">
              {recipe.instructions?.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-charcoal/80 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Nutrition */}
          {recipe.nutrition && (
            <div className="mb-6">
              <h3 className="font-semibold text-charcoal mb-3">💡 Estimated Nutrition — Per Serving</h3>
              <div className="bg-cream rounded-xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-charcoal/50">Calories</div>
                    <div className="font-semibold text-charcoal">{recipe.nutrition.calories} kcal</div>
                  </div>
                  <div>
                    <div className="text-xs text-charcoal/50">Protein</div>
                    <div className="font-semibold text-charcoal">{recipe.nutrition.protein} g</div>
                  </div>
                  <div>
                    <div className="text-xs text-charcoal/50">Carbohydrates</div>
                    <div className="font-semibold text-charcoal">{recipe.nutrition.carbohydrates} g</div>
                  </div>
                  <div>
                    <div className="text-xs text-charcoal/50">Fat</div>
                    <div className="font-semibold text-charcoal">{recipe.nutrition.fat} g</div>
                  </div>
                </div>
                {recipe.nutrition.isEstimated && (
                  <p className="text-xs text-charcoal/50 mt-3 italic">* Nutritional values are estimates</p>
                )}
              </div>
            </div>
          )}

          {/* Notice */}
          <div className={`rounded-xl p-4 mb-4 ${canCookRecipe() ? 'bg-success/10 border border-success/20' : 'bg-warning/10 border border-warning/20'}`}>
            <p className="text-sm text-charcoal/70">
              <span className="font-semibold">Cooking notice:</span> Cooking will deduct the required quantities from your inventory.
            </p>
            <p className="text-sm mt-2 text-charcoal/60">
              {getCookingMessage()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-primary/10">
          <div className="flex gap-3">
            <CuteButton
              variant="primary"
              className={`flex-1 ${!canCookRecipe() ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={handleCook}
              disabled={loading || !canCookRecipe()}
            >
              {loading ? 'Cooking...' : '🎉 Confirm Cooking'}
            </CuteButton>
            <CuteButton variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </CuteButton>
          </div>
        </div>
      </div>
    </div>
  );
}
