const mongoose = require('mongoose');
const FoodItem = require('../models/FoodItem');
const { convertToBase } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');

const DAY_MS = 24 * 60 * 60 * 1000;

// Exactly 50 demo pantry items. expiryDays / purchasedDaysAgo are relative so
// dates stay realistic on every seed run. A handful expire within 3 days so the
// expiry-priority recommendation feature can be demonstrated.
const DEMO_INVENTORY = [
  // --- Grains and carbohydrates ---
  { name: 'White Rice', quantity: 2, unit: 'kg', category: 'Grains and Cereals', expiryDays: 365, purchasedDaysAgo: 30, storageLocation: 'Pantry', price: 420, notes: 'Samba rice' },
  { name: 'Red Rice', quantity: 1, unit: 'kg', category: 'Grains and Cereals', expiryDays: 365, purchasedDaysAgo: 30, storageLocation: 'Pantry', price: 380 },
  { name: 'Basmati Rice', quantity: 500, unit: 'g', category: 'Grains and Cereals', expiryDays: 365, purchasedDaysAgo: 20, storageLocation: 'Pantry', price: 320 },
  { name: 'Dhal (Red Lentils)', quantity: 500, unit: 'g', category: 'Legumes', expiryDays: 365, purchasedDaysAgo: 45, storageLocation: 'Pantry', price: 280 },
  { name: 'Chickpeas', quantity: 500, unit: 'g', category: 'Legumes', expiryDays: 365, purchasedDaysAgo: 45, storageLocation: 'Pantry', price: 320 },
  { name: 'Oats', quantity: 500, unit: 'g', category: 'Grains and Cereals', expiryDays: 240, purchasedDaysAgo: 20, storageLocation: 'Pantry', price: 300 },
  { name: 'Wheat Flour', quantity: 1, unit: 'kg', category: 'Grains and Cereals', expiryDays: 240, purchasedDaysAgo: 15, storageLocation: 'Pantry', price: 380 },
  { name: 'Pasta', quantity: 500, unit: 'g', category: 'Grains and Cereals', expiryDays: 365, purchasedDaysAgo: 25, storageLocation: 'Pantry', price: 300 },
  { name: 'Rice Noodles', quantity: 400, unit: 'g', category: 'Grains and Cereals', expiryDays: 365, purchasedDaysAgo: 25, storageLocation: 'Pantry', price: 260 },
  { name: 'Bread', quantity: 1, unit: 'loaf', category: 'Bakery', expiryDays: 4, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 220, notes: 'Sandwich loaf', slicesPerLoaf: 18 },

  // --- Vegetables and herbs ---
  { name: 'Potatoes', quantity: 6, unit: 'pieces', category: 'Vegetables', expiryDays: 10, purchasedDaysAgo: 2, storageLocation: 'Pantry', price: 180 },
  { name: 'Onions', quantity: 8, unit: 'pieces', category: 'Vegetables', expiryDays: 14, purchasedDaysAgo: 3, storageLocation: 'Pantry', price: 160 },
  { name: 'Tomatoes', quantity: 4, unit: 'pieces', category: 'Vegetables', expiryDays: 2, purchasedDaysAgo: 2, storageLocation: 'Fridge', price: 240 },
  { name: 'Carrots', quantity: 8, unit: 'pieces', category: 'Vegetables', expiryDays: 7, purchasedDaysAgo: 2, storageLocation: 'Pantry', price: 140 },
  { name: 'Green Beans', quantity: 250, unit: 'g', category: 'Vegetables', expiryDays: 4, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 120 },
  { name: 'Cabbage', quantity: 1, unit: 'head', category: 'Vegetables', expiryDays: 7, purchasedDaysAgo: 2, storageLocation: 'Fridge', price: 150 },
  { name: 'Spinach', quantity: 1, unit: 'bunch', category: 'Vegetables', expiryDays: 2, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 100 },
  { name: 'Pumpkin', quantity: 500, unit: 'g', category: 'Vegetables', expiryDays: 10, purchasedDaysAgo: 2, storageLocation: 'Pantry', price: 130 },
  { name: 'Cucumber', quantity: 2, unit: 'pieces', category: 'Vegetables', expiryDays: 5, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 80 },
  { name: 'Bell Peppers', quantity: 2, unit: 'pieces', category: 'Vegetables', expiryDays: 6, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 160 },
  { name: 'Garlic', quantity: 2, unit: 'bulb', category: 'Herbs and Spices', expiryDays: 30, purchasedDaysAgo: 5, storageLocation: 'Pantry', price: 60 },
  { name: 'Ginger', quantity: 150, unit: 'g', category: 'Herbs and Spices', expiryDays: 21, purchasedDaysAgo: 3, storageLocation: 'Fridge', price: 90 },
  { name: 'Green Chillies', quantity: 100, unit: 'g', category: 'Herbs and Spices', expiryDays: 3, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 80 },
  { name: 'Curry Leaves', quantity: 1, unit: 'bunch', category: 'Herbs and Spices', expiryDays: 2, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 60 },
  { name: 'Coconut', quantity: 1, unit: 'pieces', category: 'Fruits', expiryDays: 5, purchasedDaysAgo: 1, storageLocation: 'Pantry', price: 120 },

  // --- Fruits ---
  { name: 'Bananas', quantity: 6, unit: 'pieces', category: 'Fruits', expiryDays: 4, purchasedDaysAgo: 1, storageLocation: 'Counter', price: 120 },
  { name: 'Apples', quantity: 4, unit: 'pieces', category: 'Fruits', expiryDays: 10, purchasedDaysAgo: 2, storageLocation: 'Fridge', price: 200 },
  { name: 'Papaya', quantity: 1, unit: 'pieces', category: 'Fruits', expiryDays: 4, purchasedDaysAgo: 1, storageLocation: 'Counter', price: 150 },
  { name: 'Lime', quantity: 6, unit: 'pieces', category: 'Fruits', expiryDays: 10, purchasedDaysAgo: 2, storageLocation: 'Counter', price: 90 },
  { name: 'Mangoes', quantity: 2, unit: 'pieces', category: 'Fruits', expiryDays: 2, purchasedDaysAgo: 1, storageLocation: 'Counter', price: 140 },

  // --- Protein sources ---
  { name: 'Eggs', quantity: 10, unit: 'pieces', category: 'Protein', expiryDays: 14, purchasedDaysAgo: 2, storageLocation: 'Fridge', price: 280 },
  { name: 'Chicken', quantity: 750, unit: 'g', category: 'Protein', expiryDays: 3, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 650 },
  { name: 'Fresh Fish', quantity: 500, unit: 'g', category: 'Protein', expiryDays: 2, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 550 },
  { name: 'Canned Tuna', quantity: 2, unit: 'can', category: 'Canned and Packaged Foods', expiryDays: 365, purchasedDaysAgo: 40, storageLocation: 'Pantry', price: 420 },
  { name: 'Tofu', quantity: 300, unit: 'g', category: 'Protein', expiryDays: 7, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 380 },

  // --- Dairy products ---
  { name: 'Milk', quantity: 1, unit: 'l', category: 'Dairy', expiryDays: 7, purchasedDaysAgo: 1, storageLocation: 'Fridge', price: 320 },
  { name: 'Yoghurt', quantity: 500, unit: 'g', category: 'Dairy', expiryDays: 10, purchasedDaysAgo: 2, storageLocation: 'Fridge', price: 260 },
  { name: 'Cheese', quantity: 200, unit: 'g', category: 'Dairy', expiryDays: 30, purchasedDaysAgo: 5, storageLocation: 'Fridge', price: 480, slicePack: { weightGrams: 200, slices: 10 } },
  { name: 'Butter', quantity: 200, unit: 'g', category: 'Dairy', expiryDays: 60, purchasedDaysAgo: 7, storageLocation: 'Fridge', price: 420 },

  // --- Nuts and pantry ingredients ---
  { name: 'Peanuts', quantity: 200, unit: 'g', category: 'Nuts and Seeds', expiryDays: 180, purchasedDaysAgo: 20, storageLocation: 'Pantry', price: 180 },
  { name: 'Cashew Nuts', quantity: 100, unit: 'g', category: 'Nuts and Seeds', expiryDays: 180, purchasedDaysAgo: 20, storageLocation: 'Pantry', price: 260 },
  { name: 'Cooking Oil', quantity: 1, unit: 'l', category: 'Cooking Essentials', expiryDays: 365, purchasedDaysAgo: 30, storageLocation: 'Pantry', price: 450 },
  { name: 'Salt', quantity: 500, unit: 'g', category: 'Cooking Essentials', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 80 },
  { name: 'Sugar', quantity: 500, unit: 'g', category: 'Cooking Essentials', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 160 },
  { name: 'Black Pepper', quantity: 50, unit: 'g', category: 'Herbs and Spices', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 120 },
  { name: 'Turmeric Powder', quantity: 50, unit: 'g', category: 'Herbs and Spices', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 100 },
  { name: 'Chilli Powder', quantity: 100, unit: 'g', category: 'Herbs and Spices', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 140 },
  { name: 'Cinnamon Sticks', quantity: 2, unit: 'pieces', category: 'Herbs and Spices', expiryDays: 365, purchasedDaysAgo: 60, storageLocation: 'Pantry', price: 110 },
  { name: 'Soy Sauce', quantity: 150, unit: 'ml', category: 'Canned and Packaged Foods', expiryDays: 365, purchasedDaysAgo: 40, storageLocation: 'Pantry', price: 180 },
  { name: 'Tomato Paste', quantity: 1, unit: 'can', category: 'Canned and Packaged Foods', expiryDays: 365, purchasedDaysAgo: 40, storageLocation: 'Pantry', price: 150 },
];

/**
 * Idempotently seeds exactly DEMO_INVENTORY.length food items for the demo
 * user. Upserts by (userId, name, isSeed) and removes stale seed records that
 * are no longer in the list. Never touches non-seed or other users' items.
 */
// Legacy sample items created by the original seedData.js seeder (before the
// isSeed flag existed). They are seeder artifacts, not user-created data, so
// they are adopted as seed records and then removed by the stale cleanup below.
const LEGACY_SEED_NAMES = ['Milk', 'Bread', 'Eggs', 'Banana', 'Rice', 'Tomato'];

async function upsertSeedInventory(demoUser) {
  const now = Date.now();
  const names = DEMO_INVENTORY.map((i) => i.name);
  let created = 0;
  let updated = 0;

  // One-time migration: adopt legacy seeder artifacts so the stale-record
  // cleanup can retire them. Scoped to the demo user and exact legacy names.
  await FoodItem.updateMany(
    { userId: demoUser._id, isSeed: { $ne: true }, name: { $in: LEGACY_SEED_NAMES } },
    { $set: { isSeed: true } }
  );

  for (const item of DEMO_INVENTORY) {
    const expiryDate = new Date(now + item.expiryDays * DAY_MS);
    const purchaseDate = new Date(now - item.purchasedDaysAgo * DAY_MS);
    const base = convertToBase(item.quantity, item.unit);
    const { status } = getExpiryStatus(expiryDate);

    const filter = { userId: demoUser._id, name: item.name, isSeed: true };
    const update = {
      userId: demoUser._id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      baseQuantity: base.quantity,
      unit: item.unit,
      baseUnit: base.baseUnit,
      purchaseDate,
      expiryDate,
      storageLocation: item.storageLocation || 'Pantry',
      price: item.price || 0,
      notes: item.notes || '',
      status,
      isSeed: true,
      slicesPerLoaf: item.slicesPerLoaf ?? null,
      slicePack: item.slicePack
        ? { weightGrams: item.slicePack.weightGrams, slices: item.slicePack.slices }
        : { weightGrams: null, slices: null },
    };

    const existing = await FoodItem.findOne(filter);
    if (existing) {
      Object.assign(existing, update);
      await existing.save();
      updated++;
    } else {
      await FoodItem.create(update);
      created++;
    }
  }

  // Remove seed records that are no longer part of the demo list
  // (only isSeed items belonging to the demo user — user data is untouched).
  const stale = await FoodItem.deleteMany({
    userId: demoUser._id,
    isSeed: true,
    name: { $nin: names },
  });

  return { created, updated, removed: stale.deletedCount, total: await FoodItem.countDocuments({ userId: demoUser._id, isSeed: true }) };
}

// Standalone runner: node seed/seedInventory.js
if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
      const User = require('../models/User');
      const demoUser = await User.findOne({ email: 'demo@moodmeal.com' });
      if (!demoUser) {
        console.error('Demo user demo@moodmeal.com not found. Run npm run seed first.');
        process.exit(1);
      }
      const result = await upsertSeedInventory(demoUser);
      console.log('Demo inventory seeded:', result);
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Inventory seeding failed:', err.message);
      process.exit(1);
    });
}

module.exports = { upsertSeedInventory, DEMO_INVENTORY };
