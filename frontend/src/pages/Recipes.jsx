import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../utils/api';
import RecipeCard from '../components/RecipeCard';
import CookRecipeModal from '../components/CookRecipeModal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export default function Recipes() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cookRecipe, setCookRecipe] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ingredient = searchParams.get('ingredient');

  useEffect(() => {
    setLoading(true);
    setRecommendations([]);
    
    const params = ingredient ? { ingredient } : {};
    API.get('/recipes/recommendations', { params })
      .then((res) => setRecommendations(res.data.recommendations))
      .catch(() => toast.error('Failed to load recipes'))
      .finally(() => setLoading(false));
  }, [ingredient]);

  const handleCook = async (recipe) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`);
      toast.success(res.data.message);
      // Refresh recommendations to update ingredient availability
      const params = ingredient ? { ingredient } : {};
      const newRes = await API.get('/recipes/recommendations', { params });
      setRecommendations(newRes.data.recommendations);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to cook recipe');
      throw e; // Re-throw to keep modal open
    }
  };

  const handleAddToPlanner = (recipe) => {
    navigate('/meal-planner', { state: { recipeId: recipe._id, recipeName: recipe.name } });
    toast.success('Go to Meal Planner to schedule this recipe!');
  };

  const handleClearFilter = () => {
    setSearchParams({});
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-charcoal">
          {ingredient ? `Recipes using ${ingredient}` : '👨‍🍳 AI Recipe Recommendations'}
        </h1>
        {ingredient && (
          <button
            onClick={handleClearFilter}
            className="text-sm text-primary hover:text-primary/80 underline"
          >
            Show all recommendations
          </button>
        )}
      </div>
      <p className="text-charcoal/60 mb-6">
        {ingredient
          ? `Recipes containing ${ingredient} that match your preferences`
          : 'Recipes matched to your pantry ingredients, preferences, and expiring items'
        }
      </p>

      {loading ? <LoadingSpinner /> : recommendations.length === 0 ? (
        <EmptyState
          emoji="🍳"
          title={ingredient ? `No recipes found containing ${ingredient}` : 'No recipes found yet'}
          message={
            ingredient
              ? `No recipes found containing ${ingredient} that match your preferences.`
              : 'Add items to your pantry and set your dietary preferences to get personalized recommendations!'
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {recommendations.map((r) => (
            <RecipeCard
              key={r._id}
              recipe={r}
              onCook={setCookRecipe}
              onAddToPlanner={handleAddToPlanner}
            />
          ))}
        </div>
      )}

      <CookRecipeModal
        isOpen={!!cookRecipe}
        onClose={() => setCookRecipe(null)}
        recipe={cookRecipe}
        onConfirm={handleCook}
      />
    </div>
  );
}
