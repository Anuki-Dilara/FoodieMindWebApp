export const formatLKR = (amount) =>
  `LKR ${Number(amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 0 })}`;

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' });

export const CATEGORIES = [
  'Dairy', 'Fruits', 'Vegetables', 'Meat', 'Fish', 'Bakery',
  'Grains', 'Canned food', 'Snacks', 'Drinks', 'Spices', 'Other',
  'Grains and Cereals', 'Legumes', 'Herbs and Spices',
  'Nuts and Seeds', 'Cooking Essentials', 'Canned and Packaged Foods',
  'Protein',
];

export const UNITS = [
  'ml', 'l', 'g', 'kg', 'pieces', 'packets', 'cups', 'tablespoons',
  'teaspoons', 'tbsp', 'tsp', 'bunch', 'bulb', 'loaf', 'can',
  // Produce-specific count units
  'head', 'clove', 'stalk', 'ear', 'cob', 'wedge', 'slice',
  'segment', 'pod', 'sprig', 'whole', 'cube',
];

export const PRODUCE_SIZES = [
  { value: '', label: 'Any size' },
  { value: 'xs', label: 'Extra small' },
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

export const PRODUCE_FORMS = [
  { value: '', label: 'Any form' },
  { value: 'whole', label: 'Whole' },
  { value: 'chopped', label: 'Chopped' },
  { value: 'diced', label: 'Diced' },
  { value: 'sliced', label: 'Sliced' },
  { value: 'grated', label: 'Grated' },
  { value: 'shredded', label: 'Shredded' },
  { value: 'mashed', label: 'Mashed' },
];

// Rough "running low" thresholds per unit family, used for the low-stock badge.
export const isLowStock = (item) => {
  if (!item || item.status === 'Expired') return false;
  const q = Number(item.quantity) || 0;
  const u = item.unit;
  if (['kg', 'g'].includes(u)) return u === 'kg' ? q <= 0.5 : q <= 100;
  if (['l', 'ml'].includes(u)) return u === 'l' ? q <= 0.25 : q <= 100;
  return q <= 2; // pieces, packets, cups, bunch, bulb, loaf, can, etc.
};

export const ALLERGIES = ['Milk', 'Eggs', 'Nuts', 'Seafood', 'Gluten', 'Soy', 'Wheat', 'Other'];

export const DIETARY_PREFS = [
  'Vegetarian', 'Vegan', 'Non-vegetarian', 'Low sugar', 'Low fat',
  'High protein', 'Healthy meals', 'Sri Lankan meals', 'Quick meals',
];

export const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export const MOODS = [
  { id: 'Happy', emoji: '😊', label: 'Happy', color: 'bg-accent' },
  { id: 'Tired', emoji: '😴', label: 'Tired', color: 'bg-info/30' },
  { id: 'Sick', emoji: '🤒', label: 'Sick', color: 'bg-primary/30' },
  { id: 'Stressed', emoji: '😰', label: 'Stressed', color: 'bg-secondary/50' },
  { id: 'Energetic', emoji: '⚡', label: 'Energetic', color: 'bg-success/30' },
  { id: 'Lazy', emoji: '🦥', label: 'Lazy', color: 'bg-cream' },
  { id: 'Sad', emoji: '😢', label: 'Sad', color: 'bg-info/20' },
  { id: 'Hungry', emoji: '🍽️', label: 'Hungry', color: 'bg-warning/30' },
];

export const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const NOTIF_ICONS = {
  expiring_soon: '⏰',
  expired: '🚫',
  missing_ingredients: '🛒',
  budget_warning: '💰',
  shopping_reminder: '🛍️',
  recipe_suggestion: '👨‍🍳',
  general: '🔔',
};

export const getStatusBadgeClass = (status) => {
  if (status === 'Fresh') return 'badge-fresh';
  if (status === 'Use Soon') return 'badge-soon';
  return 'badge-expired';
};
