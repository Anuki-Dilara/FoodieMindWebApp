import { Link } from 'react-router-dom';
import CuteButton from './CuteButton';

export default function RecipeCard({ recipe, onCook, onAddToPlanner, showActions = true }) {
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
        <span className="bg-accent/50 text-charcoal text-xs font-bold px-2 py-1 rounded-lg">
          {recipe.matchPercentage}% match
        </span>
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
