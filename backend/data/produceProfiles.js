// Comprehensive ingredient-specific conversion profiles for fruits, vegetables
// and fresh herbs. All gram values are culinary estimates (never exact
// measurements); every profile is flagged `estimated: true`.
//
// Profile shape:
//   key            canonical ingredient name (normalizeIngredientName output)
//   name           display name
//   category       'vegetable' | 'fruit' | 'herb'
//   countUnits     { unit: gramsPerUnit | { d: defaultGrams, xs,s,m,l,xl } }
//                  units: piece, whole, head, bulb, clove, bunch, stalk, ear,
//                  cob, wedge, slice, segment, pod, sprig
//   cupsChopped    grams per 1 cup chopped (drives cup/tbsp/tsp/ml density)
//   preferredUnit  suggested inventory unit
//   confidence     'high' | 'medium' | 'low'
//   source         basis of the values
//
// Tuple format:
//   [key, name, category, countUnits, cupsChopped, preferredUnit, confidence]

const RAW_PROFILES = [
  // ---------------- Vegetables ----------------
  ['onion', 'Onion', 'vegetable', { piece: { xs: 50, s: 80, m: 120, l: 180, xl: 250, d: 120 } }, 160, 'pieces', 'high'],
  ['shallot', 'Shallot', 'vegetable', { piece: { s: 25, m: 40, l: 60, d: 40 } }, 110, 'pieces', 'medium'],
  ['carrot', 'Carrot', 'vegetable', { piece: { xs: 25, s: 40, m: 60, l: 90, xl: 130, d: 60 } }, 110, 'pieces', 'high'],
  ['potato', 'Potato', 'vegetable', { piece: { xs: 50, s: 100, m: 170, l: 250, xl: 350, d: 170 } }, 150, 'pieces', 'high'],
  ['sweet potato', 'Sweet Potato', 'vegetable', { piece: { s: 150, m: 250, l: 400, d: 250 } }, 133, 'pieces', 'medium'],
  ['tomato', 'Tomato', 'vegetable', { piece: { xs: 50, s: 80, m: 120, l: 180, xl: 250, d: 120 } }, 180, 'pieces', 'high'],
  ['cherry tomato', 'Cherry Tomato', 'vegetable', { piece: { d: 15 } }, 150, 'pieces', 'medium'],
  ['cabbage', 'Cabbage', 'vegetable', { head: { s: 700, m: 1000, l: 1500, d: 1000 }, piece: { d: 1000 } }, 90, 'head', 'medium'],
  ['beetroot', 'Beetroot', 'vegetable', { piece: { s: 50, m: 100, l: 180, d: 100 }, bunch: { d: 250 } }, 136, 'pieces', 'medium'],
  ['cucumber', 'Cucumber', 'vegetable', { piece: { s: 200, m: 300, l: 400, d: 300 } }, 120, 'pieces', 'medium'],
  ['pumpkin', 'Pumpkin', 'vegetable', { piece: { d: 1200 }, wedge: { d: 300 } }, 116, 'kg', 'low'],
  ['bell pepper', 'Bell Pepper', 'vegetable', { piece: { s: 80, m: 120, l: 180, xl: 250, d: 120 } }, 150, 'pieces', 'medium'],
  ['eggplant', 'Eggplant', 'vegetable', { piece: { s: 200, m: 300, l: 450, d: 300 } }, 90, 'pieces', 'low'],
  ['okra', 'Okra', 'vegetable', { piece: { d: 10 }, pod: { d: 10 } }, 100, 'g', 'low'],
  ['broccoli', 'Broccoli', 'vegetable', { head: { d: 400 }, piece: { d: 150 } }, 90, 'head', 'medium'],
  ['cauliflower', 'Cauliflower', 'vegetable', { head: { d: 600 } }, 100, 'head', 'medium'],
  ['radish', 'Radish', 'vegetable', { piece: { d: 15 }, bunch: { d: 200 } }, 120, 'bunch', 'medium'],
  ['daikon', 'Daikon', 'vegetable', { piece: { d: 800 } }, 90, 'pieces', 'low'],
  ['zucchini', 'Zucchini', 'vegetable', { piece: { s: 200, m: 300, l: 400, d: 300 } }, 120, 'pieces', 'medium'],
  ['lettuce', 'Lettuce', 'vegetable', { head: { d: 500 } }, 60, 'head', 'medium'],
  ['spinach', 'Spinach', 'vegetable', { bunch: { d: 250 } }, 30, 'bunch', 'medium'],
  ['kale', 'Kale', 'vegetable', { bunch: { d: 200 } }, 65, 'bunch', 'low'],
  ['green bean', 'Green Beans', 'vegetable', { bunch: { d: 200 }, pod: { d: 3 } }, 120, 'g', 'low'],
  ['pea', 'Peas', 'vegetable', { pod: { d: 3 } }, 145, 'g', 'low'],
  ['sweet corn', 'Sweet Corn', 'vegetable', { ear: { d: 400 }, cob: { d: 250 } }, 150, 'ear', 'low'],
  ['bitter gourd', 'Bitter Gourd', 'vegetable', { piece: { d: 200 } }, 90, 'pieces', 'low'],
  ['bottle gourd', 'Bottle Gourd', 'vegetable', { piece: { d: 500 } }, 110, 'pieces', 'low'],
  ['snake gourd', 'Snake Gourd', 'vegetable', { piece: { d: 400 } }, 95, 'pieces', 'low'],
  ['ridge gourd', 'Ridge Gourd', 'vegetable', { piece: { d: 400 } }, 105, 'pieces', 'low'],
  ['drumstick', 'Drumstick', 'vegetable', { piece: { d: 100 } }, 65, 'pieces', 'low'],
  ['turnip', 'Turnip', 'vegetable', { piece: { d: 150 } }, 125, 'pieces', 'medium'],
  ['celery', 'Celery', 'vegetable', { stalk: { d: 40 } }, 100, 'stalk', 'medium'],
  ['leek', 'Leek', 'vegetable', { stalk: { d: 100 }, piece: { d: 300 } }, 90, 'stalk', 'low'],
  ['asparagus', 'Asparagus', 'vegetable', { stalk: { d: 15 } }, 130, 'g', 'medium'],
  ['mushroom', 'Mushroom', 'vegetable', { piece: { s: 10, m: 20, l: 35, d: 20 } }, 80, 'pieces', 'medium'],
  ['ginger', 'Ginger', 'vegetable', { piece: { d: 30 } }, 90, 'g', 'medium'],
  ['garlic', 'Garlic', 'vegetable', { clove: { d: 3 }, bulb: { d: 50 }, piece: { d: 50 } }, 130, 'bulb', 'high'],
  ['chili', 'Chilli', 'vegetable', { piece: { d: 5 }, pod: { d: 5 } }, 70, 'g', 'low'],
  ['gotukola', 'Gotukola', 'vegetable', { bunch: { d: 50 } }, 25, 'bunch', 'low'],
  ['nivithi', 'Nivithi', 'vegetable', { bunch: { d: 50 } }, 25, 'bunch', 'low'],

  // ---------------- Fruits ----------------
  ['banana', 'Banana', 'fruit', { piece: { s: 80, m: 120, l: 180, d: 120 } }, 150, 'pieces', 'high'],
  ['apple', 'Apple', 'fruit', { piece: { s: 100, m: 180, l: 250, d: 180 } }, 120, 'pieces', 'high'],
  ['mango', 'Mango', 'fruit', { piece: { s: 200, m: 300, l: 450, d: 300 } }, 160, 'pieces', 'medium'],
  ['papaya', 'Papaya', 'fruit', { piece: { d: 1200 } }, 140, 'pieces', 'medium'],
  ['pineapple', 'Pineapple', 'fruit', { piece: { d: 1500 }, wedge: { d: 400 } }, 160, 'pieces', 'low'],
  ['watermelon', 'Watermelon', 'fruit', { wedge: { d: 800 }, piece: { d: 3000 } }, 150, 'wedge', 'low'],
  ['cantaloupe', 'Cantaloupe', 'fruit', { piece: { d: 1200 } }, 160, 'pieces', 'low'],
  ['orange', 'Orange', 'fruit', { piece: { s: 100, m: 150, l: 220, d: 150 } }, 170, 'pieces', 'high'],
  ['lime', 'Lime', 'fruit', { piece: { s: 40, m: 60, l: 80, d: 60 } }, 70, 'pieces', 'high'],
  ['lemon', 'Lemon', 'fruit', { piece: { s: 60, m: 90, l: 120, d: 90 } }, 80, 'pieces', 'high'],
  ['avocado', 'Avocado', 'fruit', { piece: { s: 120, m: 200, l: 350, d: 200 } }, 150, 'pieces', 'medium'],
  ['grape', 'Grapes', 'fruit', { bunch: { d: 300 } }, 150, 'bunch', 'low'],
  ['guava', 'Guava', 'fruit', { piece: { d: 200 } }, 160, 'pieces', 'low'],
  ['pomegranate', 'Pomegranate', 'fruit', { piece: { d: 300 } }, 170, 'pieces', 'low'],
  ['pear', 'Pear', 'fruit', { piece: { s: 120, m: 200, l: 280, d: 200 } }, 140, 'pieces', 'medium'],
  ['peach', 'Peach', 'fruit', { piece: { d: 150 } }, 150, 'pieces', 'medium'],
  ['plum', 'Plum', 'fruit', { piece: { d: 70 } }, 150, 'pieces', 'low'],
  ['strawberry', 'Strawberry', 'fruit', { piece: { d: 15 } }, 160, 'pieces', 'low'],
  ['blueberry', 'Blueberries', 'fruit', { bunch: { d: 140 } }, 145, 'g', 'low'],
  ['coconut', 'Coconut', 'fruit', { piece: { d: 800 } }, 80, 'pieces', 'low'],
  ['jackfruit', 'Jackfruit', 'fruit', { piece: { d: 3500 } }, 160, 'pieces', 'low'],
  ['passion fruit', 'Passion Fruit', 'fruit', { piece: { d: 40 } }, null, 'pieces', 'low'],
  ['dragon fruit', 'Dragon Fruit', 'fruit', { piece: { d: 300 } }, 170, 'pieces', 'low'],
  ['kiwi', 'Kiwi', 'fruit', { piece: { d: 80 } }, 170, 'pieces', 'medium'],
  ['grapefruit', 'Grapefruit', 'fruit', { piece: { d: 400 } }, 220, 'pieces', 'medium'],
  ['rambutan', 'Rambutan', 'fruit', { piece: { d: 40 }, bunch: { d: 250 } }, null, 'bunch', 'low'],
  ['mangosteen', 'Mangosteen', 'fruit', { piece: { d: 50 } }, null, 'pieces', 'low'],
  ['wood apple', 'Wood Apple', 'fruit', { piece: { d: 800 } }, null, 'pieces', 'low'],
  ['melon', 'Melon', 'fruit', { piece: { d: 1200 }, wedge: { d: 500 } }, 160, 'wedge', 'low'],

  // ---------------- Fresh herbs ----------------
  ['coriander', 'Coriander', 'herb', { bunch: { d: 30 }, sprig: { d: 1 } }, 16, 'bunch', 'medium'],
  ['mint', 'Mint', 'herb', { bunch: { d: 20 }, sprig: { d: 1 } }, 20, 'bunch', 'low'],
  ['parsley', 'Parsley', 'herb', { bunch: { d: 30 }, sprig: { d: 1 } }, 55, 'bunch', 'medium'],
  ['curry leaf', 'Curry Leaves', 'herb', { bunch: { d: 15 }, sprig: { d: 0.5 } }, null, 'bunch', 'low'],
  ['green onion', 'Green Onion', 'herb', { piece: { d: 15 }, stalk: { d: 15 }, bunch: { d: 100 } }, 90, 'bunch', 'medium'],
  ['basil', 'Basil', 'herb', { bunch: { d: 30 }, sprig: { d: 1 } }, 20, 'bunch', 'low'],
  ['rosemary', 'Rosemary', 'herb', { sprig: { d: 1 }, bunch: { d: 20 } }, 55, 'bunch', 'low'],
  ['thyme', 'Thyme', 'herb', { sprig: { d: 1 }, bunch: { d: 15 } }, null, 'bunch', 'low'],
  ['lemongrass', 'Lemongrass', 'herb', { stalk: { d: 30 } }, null, 'stalk', 'medium'],
  ['dill', 'Dill', 'herb', { bunch: { d: 10 }, sprig: { d: 1 } }, 25, 'bunch', 'low'],
];

// Cup/tbsp/tsp form multipliers applied to the ingredient-specific chopped-cup
// weight. Culinary estimates only — every result stays flagged `estimated`.
const FORM_FACTORS = {
  whole: 1.15,
  chopped: 1.0,
  diced: 0.95,
  sliced: 0.85,
  grated: 0.7,
  mashed: 1.3,
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function buildProfile([key, name, category, countUnits, cupsChopped, preferredUnit, confidence]) {
  const cups = {};
  if (cupsChopped != null) {
    for (const [form, factor] of Object.entries(FORM_FACTORS)) {
      cups[form] = round2(cupsChopped * factor);
    }
  }
  // Density (g per ml) derived from the chopped-cup weight: 1 cup = 240 ml.
  const density = cupsChopped != null ? round2(cupsChopped / 240) : null;

  const supportedUnits = ['g', 'kg'];
  if (Object.keys(countUnits || {}).length) supportedUnits.push('pieces');
  if (cupsChopped != null) supportedUnits.push('cups', 'tablespoons', 'teaspoons', 'ml', 'l');

  return {
    key,
    name,
    category,
    countUnits: countUnits || {},
    cups,
    density,
    preferredUnit: preferredUnit || 'g',
    supportedUnits,
    confidence,
    estimated: true,
    enabled: true,
    source: 'FoodieMind produce conversion catalogue (culinary estimates)',
  };
}

// ---------------- Bakery: bread loaf <-> slice conversions ----------------
// Bread uses the same ingredient-specific conversion service. `bread` metadata
// drives loaf<->slice math:
//   sliceGrams      average grams per slice (also the 'piece'/'slice' count unit)
//   slicesPerLoaf   default slices per loaf, or null when the loaf cannot be
//                   converted until the user/admin supplies a slice count.
//                   A per-item `slicesPerLoaf` value on the inventory record
//                   always overrides this default — a universal slice count is
//                   never assumed.
// 'loaf' is deliberately absent from countUnits when slicesPerLoaf is null;
// the service injects it dynamically when a slice count is known.
const BREAD_SOURCE = 'FoodieMind bread conversion catalogue (culinary estimates)';

function breadProfile(key, name, { sliceGrams, slicesPerLoaf, loafGrams, confidence, breadType, preferredUnit }) {
  const countUnits = {
    piece: { d: sliceGrams },
    slice: { d: sliceGrams },
  };
  if (loafGrams != null) countUnits.loaf = { d: loafGrams };
  const units = ['g', 'kg', 'pieces', 'slice', 'loaf'];
  return {
    key,
    name,
    category: 'bakery',
    countUnits,
    cups: {},
    density: null,
    preferredUnit: preferredUnit || 'slice',
    supportedUnits: units,
    confidence,
    estimated: true,
    enabled: true,
    source: BREAD_SOURCE,
    bread: { breadType, sliceGrams, slicesPerLoaf },
  };
}

// ---------------- Dairy: cheese slice/cube/volume conversions ----------------
// Cheese uses the same ingredient-specific conversion service. Slice weights
// vary by thickness, mapped onto the size keys: xs/s = thin, m/d = standard,
// l/xl = thick. `cheese` metadata marks the profile; a per-item `slicePack`
// ({weightGrams, slices}) overrides the STANDARD slice weight for that item.
const CHEESE_SOURCE = 'FoodieMind cheese conversion catalogue (culinary estimates)';

function cheeseProfile(key, name, { slice, cube, cups, confidence, cheeseType, preferredUnit }) {
  const countUnits = {};
  if (slice) {
    countUnits.slice = slice;
    countUnits.piece = { d: slice.d ?? slice.m ?? 20 };
  }
  if (cube != null) countUnits.cube = { d: cube };
  const units = ['g', 'kg'];
  if (slice) units.push('slice', 'slices', 'pieces');
  if (cube != null) units.push('cube');
  if (cups && Object.keys(cups).length) units.push('cups', 'tablespoons', 'teaspoons');
  return {
    key,
    name,
    category: 'dairy',
    countUnits,
    cups: cups || {},
    density: null,
    preferredUnit: preferredUnit || 'g',
    supportedUnits: units,
    confidence,
    estimated: true,
    enabled: true,
    source: CHEESE_SOURCE,
    cheese: { cheeseType, sliceGrams: slice?.d ?? null },
  };
}

// Slice defs use size keys: xs/s thin, m/d standard, l/xl thick.
const BREAD_PROFILES = {
  // Generic "bread" has NO default slice count — the user or an admin must
  // supply slicesPerLoaf before loaf<->slice conversions are possible.
  bread: breadProfile('bread', 'Bread', {
    sliceGrams: 25, slicesPerLoaf: null, loafGrams: null,
    confidence: 'low', breadType: 'generic', preferredUnit: 'slice',
  }),
  'white bread': breadProfile('white bread', 'White Bread', {
    sliceGrams: 25, slicesPerLoaf: 18, loafGrams: 450,
    confidence: 'medium', breadType: 'white', preferredUnit: 'slice',
  }),
  'whole wheat bread': breadProfile('whole wheat bread', 'Whole Wheat Bread', {
    sliceGrams: 28, slicesPerLoaf: 16, loafGrams: 448,
    confidence: 'medium', breadType: 'whole wheat', preferredUnit: 'slice',
  }),
  'multigrain bread': breadProfile('multigrain bread', 'Multigrain Bread', {
    sliceGrams: 26, slicesPerLoaf: 18, loafGrams: 468,
    confidence: 'low', breadType: 'multigrain', preferredUnit: 'slice',
  }),
  'milk bread': breadProfile('milk bread', 'Milk Bread', {
    sliceGrams: 35, slicesPerLoaf: 12, loafGrams: 420,
    confidence: 'low', breadType: 'milk', preferredUnit: 'slice',
  }),
  'sourdough bread': breadProfile('sourdough bread', 'Sourdough Bread', {
    sliceGrams: 50, slicesPerLoaf: 16, loafGrams: 800,
    confidence: 'medium', breadType: 'sourdough', preferredUnit: 'slice',
  }),
  'gluten-free bread': breadProfile('gluten-free bread', 'Gluten-Free Bread', {
    sliceGrams: 32, slicesPerLoaf: 14, loafGrams: 448,
    confidence: 'low', breadType: 'gluten free', preferredUnit: 'slice',
  }),
  // Bread rolls are a different product: count/weight only, never loaf/slice.
  'bread roll': {
    key: 'bread roll',
    name: 'Bread Roll',
    category: 'bakery',
    countUnits: { piece: { d: 50 }, whole: { d: 50 } },
    cups: {},
    density: null,
    preferredUnit: 'pieces',
    supportedUnits: ['g', 'kg', 'pieces'],
    confidence: 'medium',
    estimated: true,
    enabled: true,
    source: BREAD_SOURCE,
    bread: { breadType: 'roll', sliceGrams: null, slicesPerLoaf: null },
  },
};

const CHEESE_PROFILES = {
  cheese: cheeseProfile('cheese', 'Cheese', {
    slice: { xs: 15, s: 15, m: 20, l: 30, xl: 30, d: 20 },
    cube: 15,
    confidence: 'low', cheeseType: 'generic', preferredUnit: 'g',
  }),
  'cheddar cheese': cheeseProfile('cheddar cheese', 'Cheddar Cheese', {
    slice: { xs: 18, s: 18, m: 28, l: 40, xl: 40, d: 28 },
    cube: 20,
    cups: { grated: 113, shredded: 113 },
    confidence: 'medium', cheeseType: 'cheddar', preferredUnit: 'g',
  }),
  mozzarella: cheeseProfile('mozzarella', 'Mozzarella', {
    slice: { xs: 20, s: 20, m: 30, l: 45, xl: 45, d: 30 },
    cube: 25,
    cups: { shredded: 112, grated: 112 },
    confidence: 'medium', cheeseType: 'mozzarella', preferredUnit: 'g',
  }),
  'processed cheese': cheeseProfile('processed cheese', 'Processed Cheese', {
    slice: { xs: 12, s: 12, m: 20, l: 28, xl: 28, d: 20 },
    cube: 15,
    confidence: 'medium', cheeseType: 'processed', preferredUnit: 'g',
  }),
  gouda: cheeseProfile('gouda', 'Gouda', {
    slice: { xs: 20, s: 20, m: 30, l: 45, xl: 45, d: 30 },
    cube: 25,
    cups: { grated: 100 },
    confidence: 'low', cheeseType: 'gouda', preferredUnit: 'g',
  }),
  'swiss cheese': cheeseProfile('swiss cheese', 'Swiss Cheese', {
    slice: { xs: 18, s: 18, m: 28, l: 40, xl: 40, d: 28 },
    cube: 25,
    confidence: 'low', cheeseType: 'swiss', preferredUnit: 'g',
  }),
  parmesan: cheeseProfile('parmesan', 'Parmesan', {
    slice: { xs: 5, s: 5, m: 10, l: 15, xl: 15, d: 10 },
    cube: 8,
    cups: { grated: 100, shredded: 100 },
    confidence: 'medium', cheeseType: 'parmesan', preferredUnit: 'g',
  }),
  'cream cheese': cheeseProfile('cream cheese', 'Cream Cheese', {
    slice: { xs: 20, s: 20, m: 28, l: 40, xl: 40, d: 28 },
    cube: 15,
    cups: { whole: 230 },
    confidence: 'low', cheeseType: 'cream', preferredUnit: 'g',
  }),
  feta: cheeseProfile('feta', 'Feta', {
    slice: { xs: 15, s: 15, m: 25, l: 35, xl: 35, d: 25 },
    cube: 15,
    cups: { whole: 150 },
    confidence: 'low', cheeseType: 'feta', preferredUnit: 'g',
  }),
  'cottage cheese': cheeseProfile('cottage cheese', 'Cottage Cheese', {
    cups: { whole: 226 },
    confidence: 'medium', cheeseType: 'cottage', preferredUnit: 'g',
  }),
  'monterey jack': cheeseProfile('monterey jack', 'Monterey Jack', {
    slice: { xs: 18, s: 18, m: 28, l: 40, xl: 40, d: 28 },
    cube: 20,
    cups: { grated: 113, shredded: 113 },
    confidence: 'low', cheeseType: 'monterey jack', preferredUnit: 'g',
  }),
  provolone: cheeseProfile('provolone', 'Provolone', {
    slice: { xs: 18, s: 18, m: 28, l: 40, xl: 40, d: 28 },
    cube: 20,
    confidence: 'low', cheeseType: 'provolone', preferredUnit: 'g',
  }),
  colby: cheeseProfile('colby', 'Colby', {
    slice: { xs: 18, s: 18, m: 28, l: 40, xl: 40, d: 28 },
    cube: 20,
    cups: { grated: 113, shredded: 113 },
    confidence: 'low', cheeseType: 'colby', preferredUnit: 'g',
  }),
  ricotta: cheeseProfile('ricotta', 'Ricotta', {
    cups: { whole: 246 },
    confidence: 'medium', cheeseType: 'ricotta', preferredUnit: 'g',
  }),
  halloumi: cheeseProfile('halloumi', 'Halloumi', {
    slice: { xs: 20, s: 20, m: 30, l: 45, xl: 45, d: 30 },
    cube: 20,
    confidence: 'low', cheeseType: 'halloumi', preferredUnit: 'g',
  }),
};

const PRODUCE_PROFILES = {};
for (const raw of RAW_PROFILES) {
  const profile = buildProfile(raw);
  PRODUCE_PROFILES[profile.key] = profile;
}
Object.assign(PRODUCE_PROFILES, BREAD_PROFILES, CHEESE_PROFILES);

module.exports = { PRODUCE_PROFILES, RAW_PROFILES, BREAD_PROFILES, CHEESE_PROFILES, FORM_FACTORS };
