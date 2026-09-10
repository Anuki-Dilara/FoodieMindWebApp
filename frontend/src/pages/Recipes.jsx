import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

  useEffect(() => {
    API.get('/recipes/recommendations')
      .then((res) => setRecommendations(res.data.recommendations))
      .catch(() => toast.error('Failed to load recipes'))
      .finally(() => setLoading(false));
  }, []);

  const handleCook = async (recipe) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`);
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to cook recipe');
    }
  };

  const handleAddToPlanner = (recipe) => {
    navigate('/meal-planner', { state: { recipeId: recipe._id, recipeName: recipe.name } });
    toast.success('Go to Meal Planner to schedule this recipe!');
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-charcoal mb-2">👨‍🍳 AI Recipe Recommendations</h1>
      <p className="text-charcoal/60 mb-6">
        Recipes matched to your pantry ingredients, preferences, and expiring items
      </p>

      {loading ? <LoadingSpinner /> : recommendations.length === 0 ? (
        <EmptyState
          emoji="🍳"
          title="No recipes found yet"
          message="Add items to your pantry and set your dietary preferences to get personalized recommendations!"
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
