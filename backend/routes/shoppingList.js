const express = require('express');
const { body } = require('express-validator');
const ShoppingListItem = require('../models/ShoppingListItem');
const FoodItem = require('../models/FoodItem');
const Budget = require('../models/Budget');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const { convertToBase, normalizeUnit } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');
const produce = require('../utils/produceConversionService');

const router = express.Router();

router.use(auth);

// All storage-valid units (mirrors FoodItem.unit enum + volume/count aliases).
const KNOWN_UNITS = new Set([
  'ml', 'l', 'g', 'kg', 'pieces', 'packets', 'cups', 'tablespoons', 'teaspoons',
  'tbsp', 'tsp', 'bunch', 'bulb', 'loaf', 'can', 'head', 'clove', 'stalk',
  'ear', 'cob', 'wedge', 'slice', 'segment', 'pod', 'sprig', 'whole', 'cube',
]);

// Validates a shopping-list quantity+unit pair. When the ingredient has a
// conversion profile, only that profile's supported units are allowed —
// incompatible units are rejected rather than silently stored.
function validateQuantityUnit(name, quantity, unit) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, message: 'Quantity must be a positive number.' };
  }
  const normalizedUnit = normalizeUnit(unit);
  if (!KNOWN_UNITS.has(normalizedUnit)) {
    return { ok: false, message: `Invalid unit "${unit}".` };
  }
  const suggestion = produce.supportedUnitsFor(name);
  if (suggestion && !suggestion.units.includes(normalizedUnit)) {
    return {
      ok: false,
      message: `Unit "${unit}" is not supported for ${suggestion.profile.name}.`,
    };
  }
  return { ok: true, quantity: qty, unit: normalizedUnit };
}

router.get('/', async (req, res) => {
  try {
    const items = await ShoppingListItem.find({ userId: req.userId }).sort({ priority: -1, createdAt: -1 });
    const totalEstimated = items
      .filter((i) => i.status === 'Pending')
      .reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);

    const now = new Date();
    const budget = await Budget.findOne({ userId: req.userId, month: now.getMonth() + 1, year: now.getFullYear() });
    const remainingBudget = budget?.remainingBudget ?? 0;
    const budgetWarning = totalEstimated > remainingBudget;

    res.json({ items, totalEstimated, budgetWarning, remainingBudget });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch shopping list.' });
  }
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Item name is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const name = (req.body.name || '').trim();
      const check = validateQuantityUnit(name, req.body.quantity ?? 1, req.body.unit || 'pieces');
      if (!check.ok) return res.status(400).json({ message: check.message });

      const item = await ShoppingListItem.create({
        userId: req.userId,
        name,
        quantity: check.quantity,
        unit: check.unit,
        estimatedPrice: req.body.estimatedPrice || 0,
        priority: req.body.priority || 'Medium',
        source: req.body.source || 'manual',
      });
      res.status(201).json({ message: 'Item added to shopping list!', item });
    } catch (error) {
      res.status(500).json({ message: 'Failed to add item.' });
    }
  }
);

router.put('/:id', async (req, res) => {
  try {
    const item = await ShoppingListItem.findOne({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    // Validate the effective quantity+unit pair when either is being changed.
    const nextName = req.body.name !== undefined ? String(req.body.name).trim() : item.name;
    const nextQty = req.body.quantity !== undefined ? req.body.quantity : item.quantity;
    const nextUnit = req.body.unit !== undefined ? req.body.unit : item.unit;
    if (req.body.quantity !== undefined || req.body.unit !== undefined || req.body.name !== undefined) {
      const check = validateQuantityUnit(nextName, nextQty, nextUnit);
      if (!check.ok) return res.status(400).json({ message: check.message });
      item.quantity = check.quantity;
      item.unit = check.unit;
    }

    ['name', 'estimatedPrice', 'priority', 'status'].forEach((f) => {
      if (req.body[f] !== undefined) item[f] = req.body[f];
    });
    await item.save();
    res.json({ message: 'Shopping list item updated!', item });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update item.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await ShoppingListItem.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Item not found.' });
    res.json({ message: 'Item removed from shopping list.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete item.' });
  }
});

router.post('/:id/mark-bought', async (req, res) => {
  try {
    const item = await ShoppingListItem.findOne({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Item not found.' });

    const { quantity, unit, purchaseDate, expiryDate, price, category, storageLocation } = req.body;
    const base = convertToBase(quantity || item.quantity, unit || item.unit);
    const { status } = getExpiryStatus(expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const foodItem = await FoodItem.create({
      userId: req.userId,
      name: item.name,
      category: category || 'Other',
      quantity: quantity || item.quantity,
      baseQuantity: base.quantity,
      unit: unit || item.unit,
      baseUnit: base.baseUnit,
      purchaseDate: purchaseDate || new Date(),
      expiryDate: expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      storageLocation: storageLocation || 'Pantry',
      price: price || item.estimatedPrice || 0,
      status,
    });

    item.status = 'Bought';
    await item.save();

    if (price > 0) {
      const now = new Date();
      let budget = await Budget.findOne({ userId: req.userId, month: now.getMonth() + 1, year: now.getFullYear() });
      if (budget) {
        budget.totalSpent += price;
        budget.remainingBudget = budget.monthlyBudget - budget.totalSpent;
        await budget.save();
      }
    }

    res.json({
      message: `${item.name} added to your pantry!`,
      foodItem,
      shoppingItem: item,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark item as bought.', error: error.message });
  }
});

module.exports = router;
