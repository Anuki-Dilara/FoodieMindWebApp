/**
 * External recipe API integration — Spoonacular (primary) and TheMealDB (fallback).
 */
const axios = require('axios');
const { normalizeIngredientName } = require('../utils/unitConversion');

const SPOONACULAR_BASE = process.env.SPOONACULAR_BASE_URL || 'https://api.spoonacular.com';
const THEMEALDB_BASE = process.env.THEMEALDB_BASE_URL || 'https://www.themealdb.com/api/json/v1/1';

function normalizeSpoonacularRecipe(apiRecipe, detail = null) {
  const info = detail || apiRecipe;
  const ingredients = [];
  if (info.extendedIngredients) {
    info.extendedIngredients.forEach((ing) => {
      ingredients.push({
        name: ing.name || ing.originalName || '',
        quantity: ing.amount || 1,
        unit: ing.unit || 'pieces',
      });
    });
  } else if (apiRecipe.usedIngredients || apiRecipe.missedIngredients) {
    [...(apiRecipe.usedIngredients || []), ...(apiRecipe.missedIngredients || [])].forEach((ing) => {
      ingredients.push({ name: ing.name, quantity: 1, unit: 'pieces' });
    });
  }

  return {
    name: info.title || apiRecipe.title,
    description: info.summary ? info.summary.replace(/<[^>]+>/g, '').slice(0, 300) : '',
    ingredients,
    instructions: info.instructions
      ? info.instructions.replace(/<[^>]+>/g, '').split(/\.\s+/).filter(Boolean).slice(0, 8)
      : ['Follow the recipe instructions from Spoonacular.'],
    cookingTime: info.readyInMinutes || apiRecipe.readyInMinutes || 30,
    difficulty: (info.readyInMinutes || 30) <= 20 ? 'Beginner' : (info.readyInMinutes || 30) <= 45 ? 'Intermediate' : 'Advanced',
    dietaryType: info.diets || info.dietaryTags || [],
    moodTags: [],
    image: info.image || apiRecipe.image,
    source: 'spoonacular',
    externalId: String(info.id || apiRecipe.id),
    isAIGenerated: false,
  };
}

function parseTheMealDBIngredient(meal, index) {
  const name = meal[`strIngredient${index}`];
  const measure = meal[`strMeasure${index}`] || '';
  if (!name?.trim()) return null;

  const measureMatch = measure.trim().match(/^([\d./]+)\s*(.*)$/);
  let quantity = 1;
  let unit = 'pieces';
  if (measureMatch) {
    const num = measureMatch[1].includes('/') ? 1 : parseFloat(measureMatch[1]) || 1;
    quantity = num;
    unit = measureMatch[2]?.trim() || 'pieces';
  }

  return { name: name.trim(), quantity, unit: unit || 'pieces' };
}

function normalizeTheMealDBRecipe(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i += 1) {
    const ing = parseTheMealDBIngredient(meal, i);
    if (ing) ingredients.push(ing);
  }

  const instructions = meal.strInstructions
    ? meal.strInstructions.split(/\r?\n/).filter((s) => s.trim()).slice(0, 10)
    : ['Follow TheMealDB recipe instructions.'];

  return {
    name: meal.strMeal,
    description: `${meal.strMeal} — ${meal.strCategory || 'Meal'} from ${meal.strArea || 'international'} cuisine.`,
    ingredients,
    instructions,
    cookingTime: 30,
    difficulty: 'Intermediate',
    dietaryType: [meal.strCategory].filter(Boolean),
    moodTags: [],
    image: meal.strMealThumb,
    source: 'themealdb',
    externalId: meal.idMeal,
    isAIGenerated: false,
  };
}

async function fetchSpoonacularDetails(id, apiKey) {
  try {
    const res = await axios.get(`${SPOONACULAR_BASE}/recipes/${id}/information`, {
      params: { apiKey, includeNutrition: false },
      timeout: 8000,
    });
    return res.data;
  } catch {
    return null;
  }
}

async function fetchRecipesFromSpoonacular(inventoryItems, selectedMood, userPreferences) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey || apiKey === 'your_spoonacular_api_key') return [];

  try {
    const ingredients = inventoryItems.map((i) => i.name).join(',');
    if (!ingredients) return [];

    const res = await axios.get(`${SPOONACULAR_BASE}/recipes/findByIngredients`, {
      params: { ingredients, number: 8, ranking: 2, apiKey },
      timeout: 8000,
    });

    if (!Array.isArray(res.data) || res.data.length === 0) return [];

    const recipes = [];
    for (const item of res.data.slice(0, 5)) {
      const detail = await fetchSpoonacularDetails(item.id, apiKey);
      recipes.push(normalizeSpoonacularRecipe(item, detail));
    }
    return recipes;
  } catch (err) {
    console.log('Spoonacular API unavailable:', err.message);
    return [];
  }
}

async function fetchRecipesFromTheMealDB(inventoryItems) {
  try {
    const searchTerms = inventoryItems.slice(0, 3).map((i) => {
      if (typeof i.name !== 'string') {
        console.error('Inventory item name is not a string:', i);
        return null;
      }
      return normalizeIngredientName(i.name);
    }).filter(Boolean);
    const recipes = [];
    const seen = new Set();

    for (const term of searchTerms) {
      if (!term) continue;
      try {
        const res = await axios.get(`${THEMEALDB_BASE}/filter.php`, {
          params: { i: term },
          timeout: 6000,
        });
        const meals = res.data?.meals || [];
        for (const meal of meals.slice(0, 3)) {
          if (seen.has(meal.idMeal)) continue;
          seen.add(meal.idMeal);
          const detailRes = await axios.get(`${THEMEALDB_BASE}/lookup.php`, {
            params: { i: meal.idMeal },
            timeout: 6000,
          });
          const full = detailRes.data?.meals?.[0];
          if (full) recipes.push(normalizeTheMealDBRecipe(full));
        }
      } catch {
        // Try next ingredient
      }
    }

    // Fallback: random meals if ingredient search yields nothing
    if (recipes.length === 0) {
      const randomRes = await axios.get(`${THEMEALDB_BASE}/random.php`, { timeout: 6000 });
      const meal = randomRes.data?.meals?.[0];
      if (meal) recipes.push(normalizeTheMealDBRecipe(meal));
    }

    return recipes;
  } catch (err) {
    console.log('TheMealDB API unavailable:', err.message);
    return [];
  }
}

async function getExternalRecipes(inventoryItems, selectedMood, userPreferences) {
  let recipes = await fetchRecipesFromSpoonacular(inventoryItems, selectedMood, userPreferences);

  if (recipes.length === 0) {
    recipes = await fetchRecipesFromTheMealDB(inventoryItems, selectedMood, userPreferences);
  }

  return recipes;
}

module.exports = {
  fetchRecipesFromSpoonacular,
  fetchRecipesFromTheMealDB,
  normalizeSpoonacularRecipe,
  normalizeTheMealDBRecipe,
  getExternalRecipes,
};
