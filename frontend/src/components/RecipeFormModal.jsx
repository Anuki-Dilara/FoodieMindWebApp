import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import CuteButton from './CuteButton';
import { MOODS, PRODUCE_SIZES, PRODUCE_FORMS } from '../utils/helpers';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Beginner', 'Intermediate', 'Advanced'];
const METHODS = [
  { value: 'stovetop', label: 'Stovetop' },
  { value: 'oven', label: 'Oven' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'no-cook', label: 'No-cook' },
  { value: 'mixed', label: 'Mixed' },
];
const EFFORTS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
const TEMPERATURES = [
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'room-temperature', label: 'Room temperature' },
  { value: 'any', label: 'Any' },
];
const UNITS = ['g', 'kg', 'ml', 'l', 'pieces', 'cups', 'tablespoons', 'teaspoons', 'packets',
  'bunch', 'bulb', 'head', 'clove', 'stalk', 'ear', 'cob', 'wedge', 'slice',
  'segment', 'pod', 'sprig', 'whole', 'can', 'loaf', 'cube'];

const csv = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
const arr = (v) => (Array.isArray(v) ? v : []);

const emptyForm = {
  name: '', description: '', mealType: 'Dinner', difficulty: 'Easy',
  cookingTime: 30, servings: 2,
  ingredients: [{ name: '', quantity: 1, unit: 'pieces', size: '', form: '', isOptional: false }],
  instructions: [''],
  nutrition: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fibre: 0, isEstimated: true },
  preparation: { handsOnTime: 10, totalSteps: 5, effort: 'Medium', method: 'stovetop', equipment: [] },
  equipmentText: '',
  moodTags: [], dietaryType: [], tags: [], flavourProfile: [], texture: [], ingredientCategories: [],
  foodTemperature: 'any', comfortScore: 3, colourVariety: 2, image: '',
  dietaryText: '', tagsText: '', flavourText: '', textureText: '', categoriesText: '',
};

function formFromRecipe(r) {
  if (!r) return { ...emptyForm, ingredients: [{ name: '', quantity: 1, unit: 'pieces', size: '', form: '', isOptional: false }], instructions: [''] };
  return {
    ...emptyForm,
    name: r.name || '',
    description: r.description || '',
    mealType: r.mealType || 'Dinner',
    difficulty: r.difficulty || 'Easy',
    cookingTime: r.cookingTime || 30,
    servings: r.servings || 2,
    ingredients: arr(r.ingredients).length ? arr(r.ingredients).map((i) => ({
      name: i.name || '', quantity: i.quantity ?? 1, unit: i.unit || 'pieces',
      size: i.size || '', form: i.form || '', isOptional: !!i.isOptional,
    })) : [{ name: '', quantity: 1, unit: 'pieces', size: '', form: '', isOptional: false }],
    instructions: arr(r.instructions).length ? arr(r.instructions) : [''],
    nutrition: { calories: 0, protein: 0, carbohydrates: 0, fat: 0, fibre: 0, isEstimated: true, ...(r.nutrition || {}) },
    preparation: {
      handsOnTime: r.preparation?.handsOnTime ?? 10,
      totalSteps: r.preparation?.totalSteps ?? 5,
      effort: r.preparation?.effort || 'Medium',
      method: r.preparation?.method || 'stovetop',
      equipment: arr(r.preparation?.equipment),
    },
    equipmentText: arr(r.preparation?.equipment).join(', '),
    moodTags: arr(r.moodTags),
    dietaryType: arr(r.dietaryType),
    tags: arr(r.tags),
    flavourProfile: arr(r.flavourProfile),
    texture: arr(r.texture),
    ingredientCategories: arr(r.ingredientCategories),
    foodTemperature: r.foodTemperature || 'any',
    comfortScore: r.comfortScore ?? 3,
    colourVariety: r.colourVariety ?? 2,
    image: r.image || '',
    dietaryText: arr(r.dietaryType).join(', '),
    tagsText: arr(r.tags).join(', '),
    flavourText: arr(r.flavourProfile).join(', '),
    textureText: arr(r.texture).join(', '),
    categoriesText: arr(r.ingredientCategories).join(', '),
  };
}

export default function RecipeFormModal({ isOpen, onClose, recipe, onSaved }) {
  const [form, setForm] = useState(formFromRecipe(null));
  const [saving, setSaving] = useState(false);
  const isEdit = !!recipe?._id;

  useEffect(() => {
    if (isOpen) setForm(formFromRecipe(recipe));
  }, [isOpen, recipe]);

  if (!isOpen) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setNested = (group, key, value) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));

  const setIngredient = (i, key, value) =>
    setForm((f) => {
      const ingredients = [...f.ingredients];
      ingredients[i] = { ...ingredients[i], [key]: value };
      return { ...f, ingredients };
    });

  const setInstruction = (i, value) =>
    setForm((f) => {
      const instructions = [...f.instructions];
      instructions[i] = value;
      return { ...f, instructions };
    });

  const toggleMood = (mood) =>
    set('moodTags', form.moodTags.includes(mood)
      ? form.moodTags.filter((m) => m !== mood)
      : [...form.moodTags, mood]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Recipe name is required');
    const validIngredients = form.ingredients.filter((i) => i.name.trim());
    if (validIngredients.length === 0) return toast.error('Add at least one ingredient');

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      mealType: form.mealType,
      difficulty: form.difficulty,
      cookingTime: Number(form.cookingTime),
      servings: Number(form.servings),
      ingredients: validIngredients.map((i) => ({
        name: i.name.trim(),
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'pieces',
        size: i.size || undefined,
        form: i.form || undefined,
        isOptional: !!i.isOptional,
      })),
      instructions: form.instructions.map((s) => s.trim()).filter(Boolean),
      nutrition: {
        calories: Number(form.nutrition.calories) || 0,
        protein: Number(form.nutrition.protein) || 0,
        carbohydrates: Number(form.nutrition.carbohydrates) || 0,
        fat: Number(form.nutrition.fat) || 0,
        fibre: Number(form.nutrition.fibre) || 0,
        isEstimated: form.nutrition.isEstimated,
      },
      preparation: {
        handsOnTime: Number(form.preparation.handsOnTime) || 0,
        totalSteps: Number(form.preparation.totalSteps) || 1,
        effort: form.preparation.effort,
        method: form.preparation.method,
        equipment: csv(form.equipmentText),
      },
      moodTags: form.moodTags,
      dietaryType: csv(form.dietaryText),
      tags: csv(form.tagsText),
      flavourProfile: csv(form.flavourText),
      texture: csv(form.textureText),
      ingredientCategories: csv(form.categoriesText),
      foodTemperature: form.foodTemperature,
      comfortScore: Number(form.comfortScore),
      colourVariety: Number(form.colourVariety),
      image: form.image.trim(),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await API.put(`/admin/recipes/${recipe._id}`, payload);
        toast.success('Recipe updated');
      } else {
        await API.post('/admin/recipes', payload);
        toast.success('Recipe created');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      const msg = err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Failed to save recipe';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl border-2 border-primary/20 bg-white focus:border-primary focus:outline-none text-sm';
  const labelCls = 'block text-xs font-medium text-charcoal/70 mb-1';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto p-4">
      <div className="card w-full max-w-3xl my-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-charcoal">{isEdit ? `Edit: ${recipe.name}` : 'Add New Recipe'}</h2>
          <button onClick={onClose} className="text-2xl text-charcoal/40 hover:text-charcoal">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Recipe name *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>Meal type</label>
              <select className={inputCls} value={form.mealType} onChange={(e) => set('mealType', e.target.value)}>
                {MEAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls}>Description</label>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Difficulty</label>
              <select className={inputCls} value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Image URL (optional)</label>
              <input className={inputCls} value={form.image} onChange={(e) => set('image', e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {/* Times & servings */}
          <div>
            <h3 className="font-bold text-charcoal mb-2">⏱ Time & Servings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Total time (min)</label>
                <input type="number" min="1" max="600" className={inputCls} value={form.cookingTime} onChange={(e) => set('cookingTime', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Hands-on prep (min)</label>
                <input type="number" min="0" max="600" className={inputCls} value={form.preparation.handsOnTime} onChange={(e) => setNested('preparation', 'handsOnTime', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Servings</label>
                <input type="number" min="1" max="50" className={inputCls} value={form.servings} onChange={(e) => set('servings', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Prep steps</label>
                <input type="number" min="1" max="50" className={inputCls} value={form.preparation.totalSteps} onChange={(e) => setNested('preparation', 'totalSteps', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Preparation attributes */}
          <div>
            <h3 className="font-bold text-charcoal mb-2">🍳 Preparation</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Effort</label>
                <select className={inputCls} value={form.preparation.effort} onChange={(e) => setNested('preparation', 'effort', e.target.value)}>
                  {EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Cooking method</label>
                <select className={inputCls} value={form.preparation.method} onChange={(e) => setNested('preparation', 'method', e.target.value)}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Equipment (comma separated)</label>
                <input className={inputCls} value={form.equipmentText} onChange={(e) => set('equipmentText', e.target.value)} placeholder="pot, knife, cutting board" />
              </div>
            </div>
          </div>

          {/* Mood attributes */}
          <div>
            <h3 className="font-bold text-charcoal mb-2">😊 Mood Suitability</h3>
            <div className="mb-3">
              <label className={labelCls}>Mood tags (select all that genuinely apply)</label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => toggleMood(m.id)}
                    className={`px-3 py-1.5 rounded-xl text-sm border-2 transition-all ${
                      form.moodTags.includes(m.id)
                        ? 'bg-primary border-primary text-charcoal font-semibold'
                        : 'bg-white border-primary/20 text-charcoal/60 hover:border-primary/50'
                    }`}
                  >
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Food temperature</label>
                <select className={inputCls} value={form.foodTemperature} onChange={(e) => set('foodTemperature', e.target.value)}>
                  {TEMPERATURES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Comfort level (1–5)</label>
                <select className={inputCls} value={form.comfortScore} onChange={(e) => set('comfortScore', e.target.value)}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Colour variety (0–6)</label>
                <input type="number" min="0" max="6" className={inputCls} value={form.colourVariety} onChange={(e) => set('colourVariety', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Texture (comma separated)</label>
                <input className={inputCls} value={form.textureText} onChange={(e) => set('textureText', e.target.value)} placeholder="soft, creamy, crispy" />
              </div>
              <div>
                <label className={labelCls}>Flavour profile (comma separated)</label>
                <input className={inputCls} value={form.flavourText} onChange={(e) => set('flavourText', e.target.value)} placeholder="mild, sweet, savoury, spicy" />
              </div>
              <div>
                <label className={labelCls}>Tags (comma separated)</label>
                <input className={inputCls} value={form.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="warm, comfort, fresh, colorful" />
              </div>
              <div>
                <label className={labelCls}>Ingredient categories</label>
                <input className={inputCls} value={form.categoriesText} onChange={(e) => set('categoriesText', e.target.value)} placeholder="protein, vegetables, grains" />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Dietary types (comma separated)</label>
                <input className={inputCls} value={form.dietaryText} onChange={(e) => set('dietaryText', e.target.value)} placeholder="Vegetarian, Quick meals, Healthy meals" />
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-charcoal">🥕 Ingredients</h3>
              <CuteButton type="button" variant="outline" className="!py-1 !px-3 text-xs" onClick={() => set('ingredients', [...form.ingredients, { name: '', quantity: 1, unit: 'pieces', isOptional: false }])}>
                + Add
              </CuteButton>
            </div>
            <div className="space-y-2">
              {form.ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={`${inputCls} flex-1`} placeholder="Ingredient name" value={ing.name} onChange={(e) => setIngredient(i, 'name', e.target.value)} />
                  <input type="number" min="0" step="any" className={`${inputCls} w-20`} placeholder="Qty" value={ing.quantity} onChange={(e) => setIngredient(i, 'quantity', e.target.value)} />
                  <select className={`${inputCls} w-32`} value={ing.unit} onChange={(e) => setIngredient(i, 'unit', e.target.value)}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select className={`${inputCls} w-24`} value={ing.size || ''} onChange={(e) => setIngredient(i, 'size', e.target.value)} title="Produce size">
                    {PRODUCE_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <select className={`${inputCls} w-28`} value={ing.form || ''} onChange={(e) => setIngredient(i, 'form', e.target.value)} title="Preparation form">
                    {PRODUCE_FORMS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-charcoal/60 whitespace-nowrap">
                    <input type="checkbox" checked={ing.isOptional} onChange={(e) => setIngredient(i, 'isOptional', e.target.checked)} className="w-4 h-4" />
                    Optional
                  </label>
                  <button type="button" onClick={() => set('ingredients', form.ingredients.filter((_, j) => j !== i))} className="text-danger text-lg px-1">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-charcoal">📝 Instructions (one step per line)</h3>
              <CuteButton type="button" variant="outline" className="!py-1 !px-3 text-xs" onClick={() => set('instructions', [...form.instructions, ''])}>
                + Add step
              </CuteButton>
            </div>
            <div className="space-y-2">
              {form.instructions.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-sm font-bold text-charcoal/40 mt-2 w-6">{i + 1}.</span>
                  <textarea className={`${inputCls} flex-1`} rows={2} value={step} onChange={(e) => setInstruction(i, e.target.value)} />
                  <button type="button" onClick={() => set('instructions', form.instructions.filter((_, j) => j !== i))} className="text-danger text-lg px-1 mt-1">×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Nutrition per serving */}
          <div>
            <h3 className="font-bold text-charcoal mb-2">📊 Nutrition per serving (estimates)</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              {['calories', 'protein', 'carbohydrates', 'fat', 'fibre'].map((k) => (
                <div key={k}>
                  <label className={labelCls}>{k} {k === 'calories' ? '(kcal)' : '(g)'}</label>
                  <input type="number" min="0" step="any" className={inputCls} value={form.nutrition[k]} onChange={(e) => setNested('nutrition', k, e.target.value)} />
                </div>
              ))}
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-charcoal/70">
                  <input type="checkbox" checked={form.nutrition.isEstimated} onChange={(e) => setNested('nutrition', 'isEstimated', e.target.checked)} className="w-4 h-4" />
                  Estimated
                </label>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <CuteButton type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Recipe'}
            </CuteButton>
            <CuteButton type="button" variant="outline" onClick={onClose}>Cancel</CuteButton>
          </div>
        </form>
      </div>
    </div>
  );
}
