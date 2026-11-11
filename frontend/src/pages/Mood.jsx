import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { MOODS } from '../utils/helpers';
import MoodCard from '../components/MoodCard';
import RecipeCard from '../components/RecipeCard';
import CookRecipeModal from '../components/CookRecipeModal';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

const TIME_OPTIONS = ['Any time', '15 minutes', '30 minutes', '45 minutes', '60 minutes'];
const SERVING_OPTIONS = [null, 1, 2, 3, 4, 5, 6, 8, 10, 12];
const EQUIPMENT_OPTIONS = ['Stove', 'Oven', 'Microwave', 'Blender', 'Rice Cooker', 'Air Fryer'];

const DEFAULT_FILTERS = {
  timeAvailable: 'Any time',
  servings: null,
  useIngredientFirst: null,
  equipment: [],
  noCookOnly: false,
};

export default function Mood() {
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [recommendations, setRecommendations] = useState({ readyToCook: [], needsIngredients: [], alternativesAvailable: true });
  const [loading, setLoading] = useState(false);
  const [cookRecipe, setCookRecipe] = useState(null);
  const [error, setError] = useState(null);
  const [refinePanelOpen, setRefinePanelOpen] = useState(false);
  const [seenRecipeIds, setSeenRecipeIds] = useState(new Set());
  const [ingredientSearch, setIngredientSearch] = useState('');

  // The four essential filters — every change auto-refreshes recommendations.
  const [timeAvailable, setTimeAvailable] = useState(DEFAULT_FILTERS.timeAvailable);
  const [servings, setServings] = useState(DEFAULT_FILTERS.servings);
  const [useIngredientFirst, setUseIngredientFirst] = useState(DEFAULT_FILTERS.useIngredientFirst);
  const [equipment, setEquipment] = useState(DEFAULT_FILTERS.equipment);
  const [noCookOnly, setNoCookOnly] = useState(DEFAULT_FILTERS.noCookOnly);

  const [inventoryItems, setInventoryItems] = useState([]);

  // Stale-request protection: only the latest request may write results.
  const requestSeq = useRef(0);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  // Load pantry once for the ingredient-first picker.
  useEffect(() => {
    const loadInventory = async () => {
      try {
        const res = await API.get('/food');
        const usableItems = (res.data || []).filter((item) => {
          const expiryDate = new Date(item.expiryDate);
          return expiryDate >= new Date();
        });
        setInventoryItems(usableItems);
      } catch (e) {
        console.error('Failed to load inventory:', e);
      }
    };
    loadInventory();
  }, []);

  const buildFilters = useCallback(() => ({
    timeAvailable,
    selectedServings: servings,
    useIngredientFirst,
    equipment,
    noCookOnly,
  }), [timeAvailable, servings, useIngredientFirst, equipment, noCookOnly]);

  const fetchRecommendations = useCallback(async (excludeSeen = false, filtersOverride = null) => {
    if (selectedMoods.length === 0) return;

    // Invalidate any in-flight request and abort its HTTP call.
    requestSeq.current += 1;
    const seq = requestSeq.current;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const filters = { ...(filtersOverride || buildFilters()) };
      if (excludeSeen && seenRecipeIds.size > 0) {
        filters.excludeSeenRecipeIds = Array.from(seenRecipeIds);
      }

      const res = await API.post('/mood/recommendations',
        { moods: selectedMoods, filters },
        { signal: controller.signal }
      );

      // A newer request started while this one was in flight — discard.
      if (seq !== requestSeq.current) return;

      setRecommendations({
        readyToCook: res.data.readyToCook || [],
        needsIngredients: res.data.needsIngredients || [],
        alternativesAvailable: res.data.alternativesAvailable !== false,
        ingredientFirstNote: res.data.ingredientFirstNote || null,
      });

      const newSeenIds = new Set(seenRecipeIds);
      [...(res.data.readyToCook || []), ...(res.data.needsIngredients || [])].forEach((r) => newSeenIds.add(r._id));
      setSeenRecipeIds(newSeenIds);

      if (res.data.message) toast.success(res.data.message);
    } catch (e) {
      if (e.name === 'CanceledError' || e.code === 'ERR_CANCELED' || e.name === 'AbortError') return;
      if (seq !== requestSeq.current) return;
      console.error('Mood recommendations error:', e);
      setError(e.response?.data?.message || 'Failed to get mood recommendations');
      toast.error('Failed to get mood recommendations');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [selectedMoods, buildFilters, seenRecipeIds]);

  // Mood changes: clear stale results and fetch immediately.
  useEffect(() => {
    setRecommendations({ readyToCook: [], needsIngredients: [], alternativesAvailable: true, ingredientFirstNote: null });
    setError(null);
    setSeenRecipeIds(new Set());
    if (selectedMoods.length > 0) {
      fetchRecommendations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMoods]);

  // Filter changes: debounced auto-refresh — no Apply button needed.
  useEffect(() => {
    if (selectedMoods.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setRecommendations({ readyToCook: [], needsIngredients: [], alternativesAvailable: true, ingredientFirstNote: null });
      fetchRecommendations();
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeAvailable, servings, useIngredientFirst, equipment, noCookOnly]);

  const handleMoodToggle = (mood) => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter((m) => m !== mood));
    } else if (selectedMoods.length < 2) {
      setSelectedMoods([...selectedMoods, mood]);
    } else {
      toast.error('You can select up to 2 moods. Deselect one first.');
    }
  };

  const toggleEquipment = (eq) => {
    setEquipment((prev) => prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]);
  };

  const resetFilters = () => {
    setTimeAvailable(DEFAULT_FILTERS.timeAvailable);
    setServings(DEFAULT_FILTERS.servings);
    setUseIngredientFirst(DEFAULT_FILTERS.useIngredientFirst);
    setEquipment(DEFAULT_FILTERS.equipment);
    setNoCookOnly(DEFAULT_FILTERS.noCookOnly);
    setIngredientSearch('');
    // State effects trigger the refresh automatically; fetch explicitly too
    // in case the user clicks reset while values are already default.
    if (selectedMoods.length > 0) {
      setRecommendations({ readyToCook: [], needsIngredients: [], alternativesAvailable: true, ingredientFirstNote: null });
      fetchRecommendations(false, {
        timeAvailable: DEFAULT_FILTERS.timeAvailable,
        selectedServings: null,
        useIngredientFirst: null,
        equipment: [],
        noCookOnly: false,
      });
    }
  };

  const hasActiveFilters =
    timeAvailable !== DEFAULT_FILTERS.timeAvailable ||
    servings !== DEFAULT_FILTERS.servings ||
    useIngredientFirst !== DEFAULT_FILTERS.useIngredientFirst ||
    equipment.length > 0 ||
    noCookOnly;

  const activeChips = [];
  if (timeAvailable !== 'Any time') activeChips.push(`${timeAvailable}`);
  if (servings) activeChips.push(`${servings} serving${servings > 1 ? 's' : ''}`);
  if (useIngredientFirst) activeChips.push(`${useIngredientFirst} first`);
  equipment.forEach((e) => activeChips.push(e));
  if (noCookOnly) activeChips.push('No-cook only');

  const filteredIngredients = inventoryItems.filter((item) =>
    !ingredientSearch || item.name.toLowerCase().includes(ingredientSearch.toLowerCase())
  );

  const handleCook = async (recipe, substitutions = []) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`, {
        servings: recipe.selectedServings || recipe.servings,
        substitutions,
      });
      toast.success(res.data.message);
      if (selectedMoods.length > 0) fetchRecommendations();
    } catch (e) {
      const message = e.response?.data?.message || 'Failed to cook recipe';
      if (e.response?.data?.shortages) {
        const shortageDetails = e.response.data.shortages.map((s) =>
          `${s.ingredient}: need ${s.required} ${s.unit}, have ${s.available} ${s.unitAvailable || s.unit}`
        ).join(', ');
        toast.error(`${message}. ${shortageDetails}`);
      } else {
        toast.error(message);
      }
      throw e;
    }
  };

  const handleModalClose = () => setCookRecipe(null);
  const openCookModal = (recipe) => setCookRecipe(recipe);

  const handleFeedback = async (recipeId, helpful) => {
    try {
      await Promise.all(
        selectedMoods.map((mood) => API.post('/mood/feedback', { recipeId, mood, helpful }))
      );
      toast.success(helpful ? 'Thanks for your feedback!' : 'Thanks for letting us know!');
    } catch (e) {
      toast.error('Failed to save feedback');
    }
  };

  const resetAll = () => {
    setSelectedMoods([]);
    resetFilters();
    setRecommendations({ readyToCook: [], needsIngredients: [], alternativesAvailable: true, ingredientFirstNote: null });
    setError(null);
    setSeenRecipeIds(new Set());
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
          {/* Refine Suggestions — four essential filters, auto-applied */}
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
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. Time Available */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">⏱️ Time available</label>
                    <select
                      value={timeAvailable}
                      onChange={(e) => setTimeAvailable(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                    >
                      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* 2. Number of Servings */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">🍽️ Servings</label>
                    <select
                      value={servings ?? ''}
                      onChange={(e) => setServings(e.target.value === '' ? null : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                    >
                      <option value="">Recipe default</option>
                      {SERVING_OPTIONS.filter(Boolean).map((n) => (
                        <option key={n} value={n}>{n} serving{n > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Use This Ingredient First */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">🥬 Use first (from pantry)</label>
                    <input
                      className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm mb-1"
                      placeholder="Search pantry…"
                      value={ingredientSearch}
                      onChange={(e) => setIngredientSearch(e.target.value)}
                    />
                    <select
                      value={useIngredientFirst ?? ''}
                      onChange={(e) => setUseIngredientFirst(e.target.value || null)}
                      className="w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm"
                      size={4}
                    >
                      <option value="">No preference</option>
                      {filteredIngredients.map((item) => {
                        const expiring = new Date(item.expiryDate) <= new Date(Date.now() + 3 * 86400000);
                        return (
                          <option key={item._id} value={item.name}>
                            {item.name} ({item.quantity} {item.unit}){expiring ? ' · expiring soon' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* 4. Cooking Setup */}
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">🔥 Cooking setup</label>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-2">
                      {EQUIPMENT_OPTIONS.map((eq) => (
                        <label key={eq} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={equipment.includes(eq)}
                            onChange={() => toggleEquipment(eq)}
                            className="w-4 h-4 rounded border-2 border-primary/20"
                          />
                          {eq}
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={noCookOnly}
                        onChange={(e) => setNoCookOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-2 border-primary/20"
                      />
                      No-cook recipes only
                    </label>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-primary/10 flex items-center justify-between">
                  <p className="text-xs text-charcoal/50">Filters apply automatically as you change them.</p>
                  {hasActiveFilters && (
                    <CuteButton variant="outline" className="!py-1 !px-3 text-sm" onClick={resetFilters}>
                      ↺ Reset filters
                    </CuteButton>
                  )}
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
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-xl font-bold text-charcoal">
                  {selectedMoods.length === 1
                    ? `Meals for when you're feeling ${selectedMoods[0].toLowerCase()} ${MOODS.find((m) => m.id === selectedMoods[0])?.emoji}`
                    : `Meals for when you're feeling ${selectedMoods.join(' + ')}`
                  }
                </h2>
                <div className="flex gap-2">
                  {recommendations.alternativesAvailable && (
                    <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={() => fetchRecommendations(true)}>
                      Show different ideas
                    </CuteButton>
                  )}
                  <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={resetAll}>
                    Reset
                  </CuteButton>
                </div>
              </div>

              {/* Active filter chips */}
              {activeChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {activeChips.map((chip, i) => (
                    <span key={i} className="text-xs bg-primary/20 text-charcoal px-3 py-1 rounded-full">
                      {chip}
                    </span>
                  ))}
                  <button onClick={resetFilters} className="text-xs text-danger hover:underline">
                    Clear all
                  </button>
                </div>
              )}

              {recommendations.ingredientFirstNote && (
                <p className="text-sm text-charcoal/60 bg-cream rounded-xl px-4 py-2 mb-4">
                  ℹ️ {recommendations.ingredientFirstNote}
                </p>
              )}

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
                  {recommendations.alternativesAvailable && (
                    <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={() => fetchRecommendations(true)}>
                      Show different ideas
                    </CuteButton>
                  )}
                  <CuteButton onClick={resetFilters}>Clear Filters</CuteButton>
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
