import { useState } from 'react';
import CuteButton from './CuteButton';

export default function RecipeCard({ recipe, onCook, onAddToPlanner, showActions = true, showReasons = false, onFeedback }) {
  const [feedback, setFeedback] = useState(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const handleFeedback = (helpful) => {
    setFeedback(helpful);
    onFeedback?.(recipe._id, helpful);
  };

  const breakdownRows = recipe.breakdown ? [
    ['Mood suitability', recipe.breakdown.moodSuitability],
    ['Pantry match', recipe.breakdown.pantryAvailability],
    ['Cooking time', recipe.breakdown.cookingTimeSuitability],
    ['Expiry priority', recipe.breakdown.expiryPriority],
    ['Nutrition & prefs', recipe.breakdown.nutritionPreference],
  ].filter(([, v]) => v !== undefined) : [];
  const feedbackAdj = recipe.breakdown?.feedbackAdjustment || 0;

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
        <div className="flex gap-1.5 flex-shrink-0">
          {recipe.score !== undefined && (
            <span className="bg-primary text-white text-xs font-bold px-2 py-1 rounded-lg" title="Mood suitability score">
              {Math.round(recipe.score)}%
            </span>
          )}
          {recipe.matchPercentage !== undefined && (
            <span className="bg-accent/50 text-charcoal text-xs font-bold px-2 py-1 rounded-lg">
              {recipe.matchPercentage}% match
            </span>
          )}
        </div>
      </div>

      {recipe.allergyWarning && (
        <div className="bg-danger/10 text-danger text-xs font-semibold px-3 py-1.5 rounded-lg mb-2">
          ⚠️ Contains allergens
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        <span className="text-xs bg-info/20 text-charcoal px-2 py-1 rounded-lg">⏱ {recipe.totalTime || recipe.cookingTime} min total</span>
        {recipe.handsOnTime !== undefined && (
          <span className="text-xs bg-secondary/40 text-charcoal px-2 py-1 rounded-lg">✋ {recipe.handsOnTime} min hands-on</span>
        )}
        <span className="text-xs bg-primary/20 text-charcoal px-2 py-1 rounded-lg">{recipe.difficulty}</span>
        {recipe.servings && (
          <span className="text-xs bg-cream text-charcoal px-2 py-1 rounded-lg">
            Serves {recipe.servings}
            {recipe.originalServings && recipe.originalServings !== recipe.servings && ` (was ${recipe.originalServings})`}
          </span>
        )}
        {recipe.dietaryType?.slice(0, 2).map((d) => (
          <span key={d} className="text-xs bg-secondary/30 text-charcoal px-2 py-1 rounded-lg">{d}</span>
        ))}
      </div>

      {/* Recommendation explanation */}
      {showReasons && recipe.explanation && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/70 italic">💡 {recipe.explanation}</p>
        </div>
      )}

      {/* Recommendation reasons */}
      {showReasons && !recipe.explanation && recipe.reasons && recipe.reasons.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/50 mb-1">💡 Why this recipe:</p>
          <div className="space-y-1">
            {recipe.reasons.slice(0, 4).map((reason, i) => (
              <p key={i} className="text-xs text-charcoal/70">• {reason}</p>
            ))}
          </div>
        </div>
      )}

      {/* Per-serving nutrition */}
      {(recipe.caloriesPerServing || recipe.nutrition?.calories) && (
        <div className="mb-3">
          <p className="text-xs text-charcoal/50">
            📊 {Math.round(recipe.caloriesPerServing ?? recipe.nutrition.calories)} cal · {Math.round(recipe.proteinPerServing ?? recipe.nutrition.protein ?? 0)}g protein · {Math.round(recipe.fibrePerServing ?? recipe.nutrition.fibre ?? 0)}g fibre per serving
            {(recipe.nutrition?.isEstimated ?? recipe.isEstimated) && ' (estimated)'}
          </p>
          {recipe.totalNutrition && recipe.selectedServings && recipe.selectedServings !== recipe.originalServings && (
            <p className="text-xs text-charcoal/40 mt-0.5">
              ≈ {recipe.totalNutrition.calories} kcal · {recipe.totalNutrition.protein}g protein total for {recipe.selectedServings} servings
            </p>
          )}
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

      {recipe.pantryAvailability !== undefined && (
        <div className="mb-2">
          <p className="text-xs text-charcoal/50">🧺 {Math.round(recipe.pantryAvailability)}% of ingredients in your pantry</p>
        </div>
      )}

      {/* Ingredient availability — three states when status data is present */}
      {recipe.ingredientStatuses?.length > 0 ? (
        <div className="mb-3 space-y-2">
          {(['AVAILABLE', 'SUBSTITUTE_AVAILABLE', 'MISSING'] ).map((status) => {
            const items = recipe.ingredientStatuses.filter((r) => r.status === status);
            if (!items.length) return null;
            const styles = {
              AVAILABLE: { label: 'Available', cls: 'bg-success/20 text-success', icon: '✅' },
              SUBSTITUTE_AVAILABLE: { label: 'Substitute available', cls: 'bg-warning/20 text-warning', icon: '🔄' },
              MISSING: { label: 'Missing', cls: 'bg-danger/10 text-danger', icon: '❌' },
            }[status];
            return (
              <div key={status}>
                <p className="text-xs text-charcoal/50 mb-1">{styles.icon} {styles.label}:</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((r, i) => (
                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${styles.cls}`}
                      title={r.conversionNote || r.substitute?.instructionAdjustment || ''}>
                      {r.name}
                      {r.matchType === 'converted' && ' ≈'}
                      {r.status === 'SUBSTITUTE_AVAILABLE' && r.substitute && ` → ${r.substitute.substituteIngredient}`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {recipe.substitutedIngredients?.map((s, i) => s.note && (
            <p key={i} className="text-xs text-warning italic">💡 {s.name}: {s.note}</p>
          ))}
          {recipe.ingredientStatuses?.filter((r) => r.conversionNote).map((r, i) => (
            <p key={`conv-${i}`} className="text-xs text-info italic">≈ {r.name}: {r.conversionNote}</p>
          ))}
        </div>
      ) : (
        <>
          {recipe.matchedIngredients?.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-charcoal/50 mb-1">✅ Matched:</p>
              <div className="flex flex-wrap gap-1">
                {recipe.matchedIngredients.map((m, i) => (
                  <span key={i} className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">{m.name || m}</span>
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
        </>
      )}

      {/* Score breakdown (recommendation debugging info) */}
      {showReasons && recipe.breakdown && breakdownRows.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="text-xs text-primary font-semibold hover:underline"
          >
            {showBreakdown ? '▾' : '▸'} Score breakdown{recipe.breakdown.moods ? ` (${recipe.breakdown.moods.join(' + ')})` : ''}
          </button>
          {showBreakdown && (
            <div className="mt-2 space-y-1">
              {breakdownRows.map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-charcoal/60">{label}</span>
                  <div className="flex-1 h-2 bg-cream rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
                  </div>
                  <span className="w-8 text-right font-semibold">{Math.round(value)}</span>
                </div>
              ))}
              {feedbackAdj !== 0 && (
                <p className="text-xs text-charcoal/60">Feedback adjustment: {feedbackAdj > 0 ? '+' : ''}{feedbackAdj}</p>
              )}
              <p className="text-xs font-bold text-charcoal pt-1">
                Final score: {Math.round(recipe.score)}
              </p>
            </div>
          )}
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
