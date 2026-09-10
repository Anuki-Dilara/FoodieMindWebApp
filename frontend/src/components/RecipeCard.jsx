import { Link } from 'react-router-dom';
import { useState } from 'react';
import CuteButton from './CuteButton';

export default function RecipeCard({ recipe, onCook, onAddToPlanner, showActions = true, showReasons = false, onFeedback }) {
  const [feedback, setFeedback] = useState(null);

  const handleFeedback = (helpful) => {
    setFeedback(helpful);
    onFeedback?.(recipe._id, helpful);
  };

  return (
    <div className="card animate-fade-in overflow-hidden">
      <div className="h-40 -mx-6 -mt-6 mb-4 bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center overflow-hidden">
        {recipe.image ? (
          <img src={recipe.image} alt={recipe.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-6xl">🍳</span>
        )}
      </div>

      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-lg text-charcoal">{recipe.name}</h3>
        {recipe.matchPercentage !== undefined && (
          <span className="bg-accent/50 text-charcoal text-xs font-bold px-2 py-1 rounded-lg">
            {recipe.matchPercentage}% match
          </span>
        )}
      </div>

      {recipe.allergyWarning && (
        <div className="bg-danger/10 text-danger text-xs font-semibold px-3 py-1.5 rounded-lg mb-2">
          ⚠️ Contains allergens
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        <span className="text-xs bg-info/20 text-charcoal px-2 py-1 rounded-lg">⏱ {recipe.cookingTime} min</span>
        <span className="text-xs bg-primary/20 text-charcoal px-2 py-1 rounded-lg">{recipe.difficulty}</span>
        {recipe.dietaryType?.slice(0, 2).map((d) => (
          <span key={d} className="text-xs bg-secondary/30 text-charcoal px-2 py-1 rounded-lg">{d}</span>
        ))}
      </div>

      {/* Recommendation reasons */}
      {showReasons && recipe.reasons && recipe.reasons.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/50 mb-1">💡 Why this recipe:</p>
          <div className="space-y-1">
            {recipe.reasons.map((reason, i) => (
              <p key={i} className="text-xs text-charcoal/70 italic">{reason}</p>
            ))}
          </div>
        </div>
      )}

      {/* Calories display */}
      {recipe.nutrition?.calories && recipe.servings && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/50">
            📊 {Math.round(recipe.nutrition.calories / recipe.servings)} cal per serving {recipe.nutrition.isEstimated && '(estimated)'}
            {recipe.servings > 1 && (
              <span className="ml-1">({recipe.servings} servings)</span>
            )}
          </p>
        </div>
      )}

      {/* Budget display */}
      {recipe.totalCost !== undefined && (
        <div className="mb-3">
          {recipe.completePricing || recipe.totalCost > 0 ? (
            <p className="text-xs text-charcoal/50">
              💰 Rs. {recipe.totalCost.toLocaleString()} total cost
              {recipe.shoppingCost > 0 && (
                <span className="ml-1">(+ Rs. {recipe.shoppingCost.toLocaleString()} shopping)</span>
              )}
              {!recipe.completePricing && (
                <span className="ml-1 text-warning">(partial estimate)</span>
              )}
            </p>
          ) : (
            <p className="text-xs text-charcoal/50">
              💰 Cost estimate unavailable
            </p>
          )}
        </div>
      )}

      {recipe.matchedIngredients?.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-charcoal/50 mb-1">✅ Matched:</p>
          <div className="flex flex-wrap gap-1">
            {recipe.matchedIngredients.map((m, i) => (
              <span key={i} className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">{m.name}</span>
            ))}
          </div>
        </div>
      )}

      {recipe.missingIngredients?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/50 mb-1">❌ Missing:</p>
          <div className="flex flex-wrap gap-1">
            {recipe.missingIngredients.map((m, i) => (
              <span key={i} className="text-xs bg-danger/10 text-danger px-2 py-0.5 rounded-full">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Feedback section */}
      {showReasons && onFeedback && (
        <div className="mb-3 pt-3 border-t border-primary/10">
          <p className="text-xs text-charcoal/50 mb-2">Was this suggestion helpful?</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleFeedback(true)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                feedback === true
                  ? 'bg-success text-white'
                  : 'bg-success/20 text-success hover:bg-success/30'
              }`}
            >
              👍
            </button>
            <button
              onClick={() => handleFeedback(false)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                feedback === false
                  ? 'bg-danger text-white'
                  : 'bg-danger/20 text-danger hover:bg-danger/30'
              }`}
            >
              👎
            </button>
          </div>
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 mt-4">
          <CuteButton variant="primary" className="flex-1 !py-2 text-sm" onClick={() => onCook?.(recipe)}>
            👨‍🍳 Cook this
          </CuteButton>
          <CuteButton variant="outline" className="flex-1 !py-2 text-sm" onClick={() => onAddToPlanner?.(recipe)}>
            📅 Add to Planner
          </CuteButton>
        </div>
      )}
    </div>
  );
}
