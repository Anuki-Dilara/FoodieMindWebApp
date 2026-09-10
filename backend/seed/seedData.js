require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const User = require('../models/User');
const Recipe = require('../models/Recipe');
const FoodItem = require('../models/FoodItem');
const Budget = require('../models/Budget');
const Notification = require('../models/Notification');
const { convertToBase } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');

const sampleRecipes = [
  {
    name: 'French Toast',
    description: 'Classic sweet breakfast with bread, eggs, and milk',
    ingredients: [
      { name: 'bread', quantity: 4, unit: 'pieces' },
      { name: 'eggs', quantity: 2, unit: 'pieces' },
      { name: 'milk', quantity: 200, unit: 'ml' },
    ],
    instructions: ['Beat eggs and milk', 'Dip bread slices', 'Cook on pan until golden'],
    cookingTime: 15,
    difficulty: 'Easy',
    dietaryType: ['Quick meals', 'Healthy meals'],
    moodTags: ['Happy', 'Tired', 'Lazy'],
    image: 'https://images.unsplash.com/photo-1484723091739-337303230763?w=400',
  },
  {
    name: 'Egg Sandwich',
    description: 'Quick and filling egg sandwich',
    ingredients: [
      { name: 'bread', quantity: 2, unit: 'pieces' },
      { name: 'eggs', quantity: 2, unit: 'pieces' },
      { name: 'cheese', quantity: 2, unit: 'pieces' },
    ],
    instructions: ['Fry eggs', 'Toast bread', 'Assemble sandwich with cheese'],
    cookingTime: 10,
    difficulty: 'Easy',
    dietaryType: ['Quick meals', 'High protein'],
    moodTags: ['Tired', 'Lazy', 'Hungry'],
    image: 'https://images.unsplash.com/photo-1528735602781-7a9e5883270e?w=400',
  },
  {
    name: 'Pancakes',
    description: 'Fluffy pancakes for a cozy breakfast',
    ingredients: [
      { name: 'flour', quantity: 200, unit: 'g' },
      { name: 'eggs', quantity: 2, unit: 'pieces' },
      { name: 'milk', quantity: 300, unit: 'ml' },
    ],
    instructions: ['Mix dry ingredients', 'Add eggs and milk', 'Cook on griddle'],
    cookingTime: 25,
    difficulty: 'Medium',
    dietaryType: ['Quick meals'],
    moodTags: ['Happy', 'Sad', 'Hungry'],
    image: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
  },
  {
    name: 'Vegetable Fried Rice',
    description: 'Colorful Sri Lankan style fried rice',
    ingredients: [
      { name: 'rice', quantity: 300, unit: 'g' },
      { name: 'carrots', quantity: 100, unit: 'g' },
      { name: 'beans', quantity: 100, unit: 'g' },
      { name: 'eggs', quantity: 2, unit: 'pieces' },
    ],
    instructions: ['Cook rice', 'Stir fry vegetables', 'Add eggs and mix'],
    cookingTime: 30,
    difficulty: 'Medium',
    dietaryType: ['Vegetarian', 'Sri Lankan meals', 'Healthy meals'],
    moodTags: ['Energetic', 'Happy'],
    image: 'https://images.unsplash.com/photo-160313387287-582f115f3977?w=400',
  },
  {
    name: 'Milk Rice',
    description: 'Traditional Sri Lankan kiribath',
    ingredients: [
      { name: 'rice', quantity: 500, unit: 'g' },
      { name: 'coconut milk', quantity: 400, unit: 'ml' },
      { name: 'salt', quantity: 1, unit: 'teaspoons' },
    ],
    instructions: ['Cook rice with coconut milk', 'Add salt', 'Press and cut into pieces'],
    cookingTime: 45,
    difficulty: 'Medium',
    dietaryType: ['Sri Lankan meals', 'Vegetarian'],
    moodTags: ['Happy', 'Sick'],
    image: 'https://images.unsplash.com/photo-1586201375761-8386500e0a0b?w=400',
  },
  {
    name: 'Chicken Curry',
    description: 'Spicy Sri Lankan chicken curry',
    ingredients: [
      { name: 'chicken', quantity: 500, unit: 'g' },
      { name: 'onion', quantity: 2, unit: 'pieces' },
      { name: 'garlic', quantity: 4, unit: 'pieces' },
      { name: 'curry powder', quantity: 2, unit: 'tablespoons' },
    ],
    instructions: ['Sauté onions and garlic', 'Add chicken and curry powder', 'Simmer until cooked'],
    cookingTime: 50,
    difficulty: 'Hard',
    dietaryType: ['Non-vegetarian', 'Sri Lankan meals', 'High protein'],
    moodTags: ['Stressed', 'Sad', 'Hungry', 'Energetic'],
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9cc416?w=400',
  },
  {
    name: 'Vegetable Soup',
    description: 'Warm and comforting vegetable soup',
    ingredients: [
      { name: 'carrots', quantity: 200, unit: 'g' },
      { name: 'potato', quantity: 200, unit: 'g' },
      { name: 'beans', quantity: 100, unit: 'g' },
      { name: 'onion', quantity: 1, unit: 'pieces' },
    ],
    instructions: ['Chop vegetables', 'Boil in water', 'Season and serve warm'],
    cookingTime: 35,
    difficulty: 'Easy',
    dietaryType: ['Vegetarian', 'Healthy meals', 'Low fat'],
    moodTags: ['Sick', 'Stressed', 'Tired'],
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400',
  },
  {
    name: 'Fruit Smoothie',
    description: 'Refreshing and colorful fruit smoothie',
    ingredients: [
      { name: 'banana', quantity: 2, unit: 'pieces' },
      { name: 'milk', quantity: 300, unit: 'ml' },
      { name: 'honey', quantity: 2, unit: 'tablespoons' },
    ],
    instructions: ['Blend all ingredients', 'Serve chilled'],
    cookingTime: 5,
    difficulty: 'Easy',
    dietaryType: ['Healthy meals', 'Quick meals'],
    moodTags: ['Happy', 'Energetic', 'Lazy'],
    image: 'https://images.unsplash.com/photo-1505252585467-1260642a47d1?w=400',
  },
  {
    name: 'Omelette',
    description: 'Simple and protein-rich omelette',
    ingredients: [
      { name: 'eggs', quantity: 3, unit: 'pieces' },
      { name: 'onion', quantity: 1, unit: 'pieces' },
      { name: 'tomato', quantity: 1, unit: 'pieces' },
    ],
    instructions: ['Beat eggs', 'Add chopped onion and tomato', 'Cook in pan'],
    cookingTime: 10,
    difficulty: 'Easy',
    dietaryType: ['Quick meals', 'High protein', 'Healthy meals'],
    moodTags: ['Tired', 'Lazy', 'Hungry'],
    image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400',
  },
  {
    name: 'Pasta with Tomato Sauce',
    description: 'Comforting pasta with fresh tomato sauce',
    ingredients: [
      { name: 'pasta', quantity: 300, unit: 'g' },
      { name: 'tomato', quantity: 4, unit: 'pieces' },
      { name: 'garlic', quantity: 3, unit: 'pieces' },
    ],
    instructions: ['Boil pasta', 'Make tomato garlic sauce', 'Combine and serve'],
    cookingTime: 30,
    difficulty: 'Medium',
    dietaryType: ['Vegetarian', 'Quick meals'],
    moodTags: ['Stressed', 'Sad', 'Happy'],
    image: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d31a?w=400',
  },
];

async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Recipe.deleteMany({}),
    FoodItem.deleteMany({}),
    Budget.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash('Demo123!', 12);
  const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 12);

  const demoUser = await User.create({
    fullName: 'Demo User',
    email: 'demo@moodmeal.com',
    passwordHash,
    phone: '+94771234567',
    allergies: ['Nuts'],
    dietaryPreferences: ['Healthy meals', 'Quick meals'],
    cookingSkillLevel: 'Intermediate',
    role: 'user',
  });

  await User.create({
    fullName: 'Admin User',
    email: process.env.ADMIN_EMAIL || 'admin@moodmeal.com',
    passwordHash: adminHash,
    role: 'admin',
    cookingSkillLevel: 'Advanced',
  });

  await Recipe.insertMany(sampleRecipes);

  const addDays = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };

  const sampleInventory = [
    { name: 'Milk', quantity: 1, unit: 'l', category: 'Dairy', expiryDate: addDays(2), price: 520 },
    { name: 'Bread', quantity: 1, unit: 'packets', category: 'Bakery', expiryDate: addDays(1), price: 450 },
    { name: 'Eggs', quantity: 6, unit: 'pieces', category: 'Dairy', expiryDate: addDays(6), price: 420 },
    { name: 'Banana', quantity: 8, unit: 'pieces', category: 'Fruits', expiryDate: addDays(3), price: 300 },
    { name: 'Rice', quantity: 2, unit: 'kg', category: 'Grains', expiryDate: addDays(60), price: 900 },
    { name: 'Tomato', quantity: 500, unit: 'g', category: 'Vegetables', expiryDate: addDays(1), price: 250 },
  ];

  for (const item of sampleInventory) {
    const base = convertToBase(item.quantity, item.unit);
    const { status } = getExpiryStatus(item.expiryDate);
    await FoodItem.create({
      userId: demoUser._id,
      ...item,
      baseQuantity: base.quantity,
      baseUnit: base.baseUnit,
      purchaseDate: new Date(),
      storageLocation: 'Pantry',
      status,
    });
  }

  await Budget.create({
    userId: demoUser._id,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    monthlyBudget: 30000,
    totalSpent: 2840,
    remainingBudget: 27160,
    wastedFoodCost: 0,
  });

  await Notification.create({
    userId: demoUser._id,
    title: 'Welcome to FoodieMind!',
    message: 'Your pantry is set up with sample items. Start exploring recipes!',
    type: 'general',
  });

  await Notification.create({
    userId: demoUser._id,
    title: 'Bread expiring soon!',
    message: 'Use your Bread within 1 day before it expires.',
    type: 'expiring_soon',
  });

  console.log('Seed completed!');
  console.log('Demo user: demo@moodmeal.com / Demo123!');
  console.log('Admin user: admin@moodmeal.com / Admin123!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
