import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { MOODS } from '../utils/helpers';
import MoodCard from '../components/MoodCard';
import RecipeCard from '../components/RecipeCard';
import CookRecipeModal from '../components/CookRecipeModal';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function Mood() {
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [recommendations, setRecommendations] = useState({ readyToCook: [], needsIngredients: [] });
  const [loading, setLoading] = useState(false);
  const [cookRecipe, setCookRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [refinePanelOpen, setRefinePanelOpen] = useState(false);

  // Filter states
  const [timeAvailable, setTimeAvailable] = useState('Any time');
  const [mealSize, setMealSize] = useState('Any');
  const [caloriePreference, setCaloriePreference] = useState('No preference');
  const [sickPreferences, setSickPreferences] = useState({ warm: false, mild: false, soft: false });
  const [cravingFlavor, setCravingFlavor] = useState(null);
  const [cravingTemperature, setCravingTemperature] = useState(null);
  const [useIngredientFirst, setUseIngredientFirst] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedServings, setSelectedServings] = useState(null);
  const [availableEquipment, setAvailableEquipment] = useState([]);
  const [maxBudget, setMaxBudget] = useState(null);
  const [budgetType, setBudgetType] = useState('total'); // 'total' or 'shopping'

  // Load inventory on mount
  useEffect(() => {
    const loadInventory = async () => {
      try {
        const res = await API.get('/food');
        const usableItems = res.data.filter(item => {
          const expiryDate = new Date(item.expiryDate);
          const today = new Date();
          return expiryDate >= today; // Only non-expired items
        });
        setInventoryItems(usableItems);
      } catch (e) {
        console.error('Failed to load inventory:', e);
      }
    };
    loadInventory();
  }, []);

  const handleMoodToggle = (mood) => {
    if (selectedMoods.includes(mood)) {
      // Deselect if already selected
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else if (selectedMoods.length < 2) {
      // Select if less than 2 selected
      setSelectedMoods([...selectedMoods, mood]);
    } else {
      // Already have 2 selected, show message
      toast.error('You can select up to 2 moods. Deselect one first.');
    }
  };

  const fetchRecommendations = async () => {
    if (selectedMoods.length === 0) {
      toast.error('Please select at least one mood');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const filters = {
        timeAvailable,
        mealSize,
        caloriePreference,
        cravingFlavor,
        cravingTemperature,
        useIngredientFirst,
        selectedServings,
        availableEquipment,
        maxBudget,
        budgetType,
      };

      if (selectedMoods.includes('Sick')) {
        filters.sickPreferences = sickPreferences;
      }

      const res = await API.post('/mood/recommendations', { moods: selectedMoods, filters });
      setRecommendations({
        readyToCook: res.data.readyToCook || [],
        needsIngredients: res.data.needsIngredients || [],
      });
      toast.success(res.data.message);
    } catch (e) {
      console.error('Mood recommendations error:', e);
      setError(e.response?.data?.message || 'Failed to get mood recommendations');
      toast.error('Failed to get mood recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = () => {
    if (selectedMoods.length > 0) {
      fetchRecommendations();
    }
  };

  const handleCook = async (recipe, substitutions = []) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`, {
        servings: recipe.selectedServings,
        substitutions,
      });
      toast.success(res.data.message);
      // Refresh recommendations to update ingredient availability
      if (selectedMoods.length > 0) {
        fetchRecommendations();
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

  const handleModalClose = () => {
    setCookRecipe(null);
  };

  const openCookModal = (recipe) => {
    setCookRecipe(recipe);
  };

  const handleFeedback = async (recipeId, helpful) => {
    try {
      // Send feedback for the first selected mood
      const mood = selectedMoods[0];
      await API.post('/mood/feedback', { recipeId, mood, helpful });
      toast.success(helpful ? 'Thanks for your feedback!' : 'Thanks for letting us know!');
    } catch (e) {
      toast.error('Failed to save feedback');
    }
  };

  const clearFilters = () => {
    setTimeAvailable('Any time');
    setMealSize('Any');
    setCaloriePreference('No preference');
    setSickPreferences({ warm: false, mild: false, soft: false });
    if (selectedMoods.length > 0) {
      fetchRecommendations();
    }
  };

  const resetAll = () => {
    setSelectedMoods([]);
    setTimeAvailable('Any time');
    setMealSize('Any');
    setCaloriePreference('No preference');
    setSickPreferences({ warm: false, mild: false, soft: false });
    setCravingFlavor(null);
    setCravingTemperature(null);
    setUseIngredientFirst(null);
    setSelectedServings(null);
    setAvailableEquipment([]);
    setMaxBudget(null);
    setBudgetType('total');
    setRecommendations({ readyToCook: [], needsIngredients: [] });
    setError(null);
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-charcoal mb-2">😊 How are you feeling?</h1>
      <p className="text-charcoal/60 mb-8">Pick your mood and we'll suggest the perfect meal from your pantry</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {MOODS.map((mood) => (
          <MoodCard key={mood.id} mood={mood} selected={selectedMoods.includes(mood.id)} onClick={handleMoodToggle} />
        ))}
      </div>

      {selectedMoods.length > 0 && (
        <>
          {/* Refine Suggestions Collapsible Panel */}
          <div className="card mb-6">
            <button
              onClick={() => setRefinePanelOpen(!refinePanelOpen)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <h3 className="font-bold text-charcoal">🔧 Refine my suggestions</h3>
              <span className="text-2xl transition-transform">{refinePanelOpen ? '−' : '+'}</span>
            </button>

            {refinePanelOpen && (
              <div className="px-4 pb-4 pt-2 border-t border-primary/10">
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Time Filter */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">Time Available</label>
                    <select
                      value={timeAvailable}
                      onChange={(e) => { setTimeAvailable(e.target.value); handleFilterChange(); }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none"
                    >
                      <option value="Any time">Any time</option>
                      <option value="10 minutes">10 minutes</option>
                      <option value="20 minutes">20 minutes</option>
                      <option value="30 minutes">30 minutes</option>
                    </select>
                  </div>

                  {/* Meal Size Filter */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">Meal Size</label>
                    <select
                      value={mealSize}
                      onChange={(e) => { setMealSize(e.target.value); handleFilterChange(); }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none"
                    >
                      <option value="Any">Any</option>
                      <option value="Snack">Snack</option>
                      <option value="Light meal">Light meal</option>
                      <option value="Full meal">Full meal</option>
                    </select>
                  </div>

                  {/* Calorie Preference */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">Calories per serving</label>
                    <select
                      value={caloriePreference}
                      onChange={(e) => { setCaloriePreference(e.target.value); handleFilterChange(); }}
                      className="w-full px-4 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none"
                    >
                      <option value="No preference">No preference</option>
                      <option value="Snack">Under 300 cal</option>
                      <option value="Light meal">300-500 cal</option>
                      <option value="Full meal">500-800 cal</option>
                    </select>
                  </div>
                </div>

                {/* Craving Preferences */}
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <label className="block text-sm font-medium text-charcoal mb-2">Cravings (optional)</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Flavor */}
                    <div>
                      <label className="block text-xs text-charcoal/50 mb-1">Flavor</label>
                      <select
                        value={cravingFlavor || ''}
                        onChange={(e) => { setCravingFlavor(e.target.value || null); handleFilterChange(); }}
                        className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                      >
                        <option value="">No preference</option>
                        <option value="sweet">Sweet</option>
                        <option value="savoury">Savoury</option>
                        <option value="spicy">Spicy</option>
                        <option value="mild">Mild</option>
                      </select>
                    </div>

                    {/* Temperature */}
                    <div>
                      <label className="block text-xs text-charcoal/50 mb-1">Temperature</label>
                      <select
                        value={cravingTemperature || ''}
                        onChange={(e) => { setCravingTemperature(e.target.value || null); handleFilterChange(); }}
                        className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                      >
                        <option value="">No preference</option>
                        <option value="warm">Warm</option>
                        <option value="cold">Cold</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Use This Ingredient First */}
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <label className="block text-sm font-medium text-charcoal mb-2">Use this ingredient first (optional)</label>
                  <select
                    value={useIngredientFirst || ''}
                    onChange={(e) => { setUseIngredientFirst(e.target.value || null); handleFilterChange(); }}
                    className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                  >
                    <option value="">No preference</option>
                    {inventoryItems.map((item) => (
                      <option key={item._id} value={item.name}>
                        {item.name} ({item.quantity} {item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Number of Servings */}
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <label className="block text-sm font-medium text-charcoal mb-2">Number of servings (optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={selectedServings || ''}
                      onChange={(e) => {
                        const val = e.target.value ? Math.min(12, Math.max(1, parseInt(e.target.value))) : null;
                        setSelectedServings(val);
                        handleFilterChange();
                      }}
                      placeholder="Use recipe default"
                      className="w-24 px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                    />
                    <span className="text-sm text-charcoal/50">servings (max 12)</span>
                  </div>
                </div>

                {/* Available Equipment */}
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <label className="block text-sm font-medium text-charcoal mb-2">Available equipment (optional)</label>
                  <div className="flex flex-wrap gap-2">
                    {['Stove', 'Oven', 'Microwave', 'Blender', 'Rice Cooker', 'Air Fryer'].map((eq) => (
                      <label key={eq} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={availableEquipment.includes(eq)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAvailableEquipment([...availableEquipment, eq]);
                            } else {
                              setAvailableEquipment(availableEquipment.filter(item => item !== eq));
                            }
                            handleFilterChange();
                          }}
                          className="w-4 h-4 rounded border-2 border-primary/20"
                        />
                        <span className="text-sm">{eq}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={availableEquipment.includes('No-cook')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAvailableEquipment([...availableEquipment, 'No-cook']);
                          } else {
                            setAvailableEquipment(availableEquipment.filter(item => item !== 'No-cook'));
                          }
                          handleFilterChange();
                        }}
                        className="w-4 h-4 rounded border-2 border-primary/20"
                      />
                      <span className="text-sm">No-cook recipes only</span>
                    </label>
                  </div>
                </div>

                {/* Budget Filter */}
                <div className="mt-4 pt-4 border-t border-primary/10">
                  <label className="block text-sm font-medium text-charcoal mb-2">Maximum budget (optional)</label>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-charcoal/50 mb-1">Budget limit (LKR)</label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={maxBudget || ''}
                        onChange={(e) => {
                          const val = e.target.value ? Math.max(0, parseFloat(e.target.value)) : null;
                          setMaxBudget(val);
                          handleFilterChange();
                        }}
                        placeholder="No limit"
                        className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal/50 mb-1">Budget type</label>
                      <select
                        value={budgetType}
                        onChange={(e) => { setBudgetType(e.target.value); handleFilterChange(); }}
                        className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                      >
                        <option value="total">Total ingredient value</option>
                        <option value="shopping">Additional shopping cost only</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Sick-specific preferences */}
                {selectedMoods.includes('Sick') && (
                  <div className="mt-4 pt-4 border-t border-primary/10">
                    <label className="block text-sm font-medium text-charcoal mb-2">Food preferences</label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sickPreferences.warm}
                          onChange={(e) => { setSickPreferences({ ...sickPreferences, warm: e.target.checked }); handleFilterChange(); }}
                          className="w-4 h-4 rounded border-2 border-primary/20"
                        />
                        <span className="text-sm">Warm</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sickPreferences.mild}
                          onChange={(e) => { setSickPreferences({ ...sickPreferences, mild: e.target.checked }); handleFilterChange(); }}
                          className="w-4 h-4 rounded border-2 border-primary/20"
                        />
                        <span className="text-sm">Mild</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sickPreferences.soft}
                          onChange={(e) => { setSickPreferences({ ...sickPreferences, soft: e.target.checked }); handleFilterChange(); }}
                          className="w-4 h-4 rounded border-2 border-primary/20"
                        />
                        <span className="text-sm">Soft</span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-primary/10 flex gap-2">
                  <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={clearFilters}>
                    Reset Filters
                  </CuteButton>
                  <CuteButton variant="primary" className="!py-1.5 !px-4 text-sm" onClick={() => { setRefinePanelOpen(false); fetchRecommendations(); }}>
                    Apply Filters
                  </CuteButton>
                </div>
              </div>
            )}
          </div>

          {loading && <LoadingSpinner />}

          {error && (
            <div className="card text-center py-12">
              <div className="text-5xl mb-3">⚠️</div>
              <p className="text-charcoal/60 mb-4">{error}</p>
              <CuteButton onClick={() => fetchRecommendations()}>Retry</CuteButton>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-charcoal">
                  {selectedMoods.length === 1
                    ? `Meals for when you're feeling ${selectedMoods[0].toLowerCase()} ${MOODS.find((m) => m.id === selectedMoods[0])?.emoji}`
                    : `Meals for when you're feeling ${selectedMoods.join(' + ')}`
                  }
                </h2>
                <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={resetAll}>
                  Reset
                </CuteButton>
              </div>

              {/* Ready to Cook */}
              {recommendations.readyToCook.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-charcoal mb-4">
                    ✅ Ready to Cook ({recommendations.readyToCook.length})
                  </h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.readyToCook.map((r) => (
                      <RecipeCard
                        key={r._id}
                        recipe={r}
                        onCook={openCookModal}
                        showReasons={true}
                        onFeedback={handleFeedback}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Needs Ingredients */}
              {recommendations.needsIngredients.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-bold text-charcoal mb-4">
                    🛒 Needs Ingredients ({recommendations.needsIngredients.length})
                  </h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recommendations.needsIngredients.map((r) => (
                      <RecipeCard
                        key={r._id}
                        recipe={r}
                        onCook={openCookModal}
                        showReasons={true}
                        onFeedback={handleFeedback}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {recommendations.readyToCook.length === 0 && recommendations.needsIngredients.length === 0 && (
                <div className="card text-center py-12">
                  <div className="text-5xl mb-3">🤷</div>
                  <p className="text-charcoal/60 mb-4">No matching recipes found with your current filters.</p>
                  <p className="text-sm text-charcoal/40 mb-4">Try adjusting your preferences or updating your pantry.</p>
                  <CuteButton onClick={clearFilters}>Clear Filters</CuteButton>
                </div>
              )}
            </>
          )}
        </>
      )}

      <CookRecipeModal
        isOpen={!!cookRecipe}
        onClose={handleModalClose}
        recipe={cookRecipe}
        onConfirm={handleCook}
      />
    </div>
  );
}
