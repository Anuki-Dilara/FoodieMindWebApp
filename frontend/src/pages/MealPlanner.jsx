import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { MEAL_TYPES, formatDate, formatLKR } from '../utils/helpers';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';
import ConfirmDialog from '../components/ConfirmDialog';

export default function MealPlanner() {
  const location = useLocation();
  const [meals, setMeals] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteMeal, setDeleteMeal] = useState(null);
  const [form, setForm] = useState({
    recipeId: location.state?.recipeId || '',
    date: new Date().toISOString().split('T')[0],
    mealType: 'Dinner',
  });

  const fetchData = async () => {
    try {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      const end = new Date();
      end.setDate(end.getDate() + 30);
      const [mealsRes, recipesRes] = await Promise.all([
        API.get('/meal-planner', { params: { startDate: start.toISOString(), endDate: end.toISOString() } }),
        API.get('/recipes'),
      ]);
      setMeals(mealsRes.data.meals);
      setRecipes(recipesRes.data.recipes);
    } catch (e) {
      toast.error('Failed to load meal planner');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (location.state?.recipeId) setShowAdd(true);
  }, [location.state]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await API.post('/meal-planner', form);
      toast.success('Meal planned!');
      setShowAdd(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to plan meal');
    }
  };

  const handleDelete = async () => {
    try {
      await API.delete(`/meal-planner/${deleteMeal._id}`);
      toast.success('Meal removed');
      setDeleteMeal(null);
      fetchData();
    } catch (e) {
      toast.error('Failed to remove meal');
    }
  };

  const grouped = meals.reduce((acc, meal) => {
    const key = formatDate(meal.date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(meal);
    return acc;
  }, {});

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">📅 Meal Planner</h1>
          <p className="text-charcoal/60">Plan your meals for the week ahead</p>
        </div>
        <CuteButton variant="primary" onClick={() => setShowAdd(true)}>+ Plan a Meal</CuteButton>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-3">📅</div>
          <p className="text-charcoal/60 mb-4">No meals planned yet. Start planning your week!</p>
          <CuteButton variant="primary" onClick={() => setShowAdd(true)}>Plan Your First Meal</CuteButton>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayMeals]) => (
            <div key={date} className="card">
              <h3 className="font-bold text-charcoal mb-3">{date}</h3>
              <div className="space-y-3">
                {dayMeals.map((meal) => (
                  <div key={meal._id} className="flex items-center justify-between p-3 bg-cream rounded-xl">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-primary/20 px-2 py-0.5 rounded-lg font-semibold">{meal.mealType}</span>
                        <span className="font-semibold">{meal.recipeName}</span>
                      </div>
                      {meal.missingIngredients?.length > 0 && (
                        <p className="text-xs text-danger mt-1">
                          ⚠️ Missing: {meal.missingIngredients.join(', ')}
                        </p>
                      )}
                      {meal.estimatedCost > 0 && (
                        <p className="text-xs text-charcoal/50">Est. cost: {formatLKR(meal.estimatedCost)}</p>
                      )}
                    </div>
                    <CuteButton variant="ghost" className="!px-2 text-danger" onClick={() => setDeleteMeal(meal)}>✕</CuteButton>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-soft max-w-md w-full p-6 animate-fade-in">
            <h2 className="text-xl font-bold mb-4">📅 Plan a Meal</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Recipe</label>
                <select className="input-field" value={form.recipeId} onChange={(e) => setForm({ ...form, recipeId: e.target.value })} required>
                  <option value="">Select a recipe</option>
                  {recipes.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Date</label>
                <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Meal Type</label>
                <select className="input-field" value={form.mealType} onChange={(e) => setForm({ ...form, mealType: e.target.value })}>
                  {MEAL_TYPES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <CuteButton type="submit" variant="primary" className="flex-1">Add to Planner</CuteButton>
                <CuteButton type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</CuteButton>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteMeal} onClose={() => setDeleteMeal(null)} onConfirm={handleDelete}
        title="Remove planned meal?" message={`Remove ${deleteMeal?.recipeName} from your planner?`}
      />
    </div>
  );
}
