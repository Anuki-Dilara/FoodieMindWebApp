import { useState } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { MOODS } from '../utils/helpers';
import MoodCard from '../components/MoodCard';
import RecipeCard from '../components/RecipeCard';
import CookRecipeModal from '../components/CookRecipeModal';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function Mood() {
  const [selectedMood, setSelectedMood] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cookRecipe, setCookRecipe] = useState(null);

  const fetchRecommendations = async (mood) => {
    setSelectedMood(mood);
    setLoading(true);
    try {
      const res = await API.post('/mood/recommendations', { mood });
      setRecommendations(res.data.recommendations);
      toast.success(res.data.message);
    } catch (e) {
      toast.error('Failed to get mood recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleCook = async (recipe) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`);
      toast.success(res.data.message);
      // Refresh recommendations to update ingredient availability
      if (selectedMood) {
        const moodRes = await API.post('/mood/recommendations', { mood: selectedMood });
        setRecommendations(moodRes.data.recommendations);
      }
    } catch (e) {
      const message = e.response?.data?.message || 'Failed to cook recipe';
      if (e.response?.data?.shortages) {
        const shortageDetails = e.response.data.shortages.map(s => 
          `${s.ingredient}: need ${s.required} ${s.unit}, have ${s.available} ${s.unitAvailable || s.unit}`
        ).join(', ');
        toast.error(`${message}. ${shortageDetails}`);
      } else {
        toast.error(message);
      }
      throw e; // Re-throw to keep modal open
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-charcoal mb-2">😊 How are you feeling?</h1>
      <p className="text-charcoal/60 mb-8">Pick your mood and we'll suggest the perfect meal from your pantry</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {MOODS.map((mood) => (
          <MoodCard key={mood.id} mood={mood} selected={selectedMood === mood.id} onClick={fetchRecommendations} />
        ))}
      </div>

      {loading && <LoadingSpinner />}

      {!loading && selectedMood && (
        <div>
          <h2 className="text-xl font-bold text-charcoal mb-4">
            Meals for when you're feeling {selectedMood.toLowerCase()} {MOODS.find((m) => m.id === selectedMood)?.emoji}
          </h2>
          {recommendations.length === 0 ? (
            <div className="card text-center py-12">
              <div className="text-5xl mb-3">🤷</div>
              <p className="text-charcoal/60">No matching recipes found. Try updating your pantry or preferences!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendations.map((r) => (
                <RecipeCard key={r._id} recipe={r} onCook={setCookRecipe} />
              ))}
            </div>
          )}
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
