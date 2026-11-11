const express = require('express');
const { body } = require('express-validator');
const FoodItem = require('../models/FoodItem');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const ShoppingListItem = require('../models/ShoppingListItem');
const Budget = require('../models/Budget');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const { convertToBase, deductQuantity, convertQuantity, normalizeUnit } = require('../utils/unitConversion');
const { canonicalName, sameIngredient, findMatchingItems } = require('../utils/ingredientIdentity');
const { getExpiryStatus } = require('../utils/expiryHelper');

const router = express.Router();

router.use(auth);

// Map a produce-profile category onto the FoodItem category enum.
const PROFILE_CATEGORY_MAP = {
  vegetable: 'Vegetables',
  fruit: 'Fruits',
  herb: 'Herbs and Spices',
  bakery: 'Bakery',
  dairy: 'Dairy',
};

function sameCalendarDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a); const db = new Date(b);
  if (isNaN(da) || isNaN(db)) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}

// Analyse how a prospective new entry relates to an existing pantry item.
function analyseMatch(item, name, quantity, unit, expiryDate) {
  const conversion = convertQuantity(quantity, unit, item.unit, item.name || name, {
    slicesPerLoaf: item.slicesPerLoaf,
    slicePack: item.slicePack,
  });
  const mergeable = !!conversion.success && sameCalendarDay(item.expiryDate, expiryDate);
  return {
    _id: item._id,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    expiryDate: item.expiryDate,
    sameExpiry: sameCalendarDay(item.expiryDate, expiryDate),
    mergeable,
    mergeBlockedReason: !sameCalendarDay(item.expiryDate, expiryDate)
      ? 'different-expiry'
      : (!conversion.success ? 'incompatible-units' : null),
    conversion: conversion.success
      ? {
          quantity: conversion.quantity,
          unit: conversion.unit,
          isEstimate: !!conversion.isEstimate,
          note: conversion.conversion ? `${conversion.quantity} ${conversion.unit} ≈ ${quantity} ${unit} — estimated conversion` : null,
        }
      : null,
    projectedQuantity: conversion.success && sameCalendarDay(item.expiryDate, expiryDate)
      ? Math.round((item.quantity + conversion.quantity) * 10000) / 10000
      : null,
    projectedUnit: item.unit,
  };
}

async function findCanonicalMatches(userId, name) {
  const items = await FoodItem.find({ userId }).select(
    'name category quantity unit expiryDate baseQuantity baseUnit slicesPerLoaf slicePack'
  ).lean();
  return findMatchingItems(name, items);
}

function enrichFoodItem(item) {
  const { status, daysLeft } = getExpiryStatus(item.expiryDate);
  return { ...item.toObject(), status, daysLeft };
}

// Suggested measurement units for an ingredient, based on its produce
// conversion profile (falls back to the generic unit list).
router.get('/units/for-ingredient', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ message: 'Ingredient name is required.' });
    const produce = require('../utils/produceConversionService');
    const suggestion = produce.supportedUnitsFor(name);
    if (suggestion) {
      return res.json({
        ingredient: name,
        hasProfile: true,
        preferredUnit: suggestion.preferredUnit,
        units: suggestion.units,
        estimated: true,
        slicePack: !!suggestion.profile?.cheese,
      });
    }
    res.json({ ingredient: name, hasProfile: false, preferredUnit: null, units: null });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resolve units.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { category, status, search } = req.query;
    const filter = { userId: req.userId };

    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    let items = await FoodItem.find(filter).sort({ expiryDate: 1 });
    items = items.map(enrichFoodItem);

    if (status) {
      items = items.filter((item) => item.status === status);
    }

    res.json({ items, count: items.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch inventory.' });
  }
});

// Check whether a prospective entry matches an existing pantry ingredient.
// Used by the Add Food dialog to offer "update existing inventory" instead of
// silently creating duplicates. Read-only — never modifies data.
router.post(
  '/duplicate-check',
  [
    body('name').trim().notEmpty().withMessage('Food name is required'),
    body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than zero'),
    body('unit').notEmpty().withMessage('Unit is required'),
    body('expiryDate').notEmpty().withMessage('Expiry date is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, quantity, unit, expiryDate } = req.body;
      const matches = await findCanonicalMatches(req.userId, name);
      res.json({
        canonicalName: canonicalName(name),
        matches: matches.map((m) => analyseMatch(m, name, Number(quantity), unit, expiryDate)),
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to check for duplicates.' });
    }
  }
);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Food name is required'),
    body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be greater than zero'),
    body('unit').notEmpty().withMessage('Unit is required'),
    body('expiryDate').notEmpty().withMessage('Expiry date is required'),
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be positive'),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, category, quantity, unit, purchaseDate, expiryDate, storageLocation, price, notes, slicesPerLoaf, slicePack, mergeWithId, allowSeparateBatch, requestId } = req.body;

      // --- Merge into an existing item (user confirmed "update existing") ---
      if (mergeWithId) {
        const existing = await FoodItem.findOne({ _id: mergeWithId, userId: req.userId });
        if (!existing) return res.status(404).json({ message: 'Existing inventory item not found.' });
        if (!sameIngredient(existing.name, name)) {
          return res.status(400).json({ message: 'Cannot merge — these are different ingredients.' });
        }
        if (!sameCalendarDay(existing.expiryDate, expiryDate)) {
          return res.status(409).json({
            code: 'DIFFERENT_EXPIRY',
            message: 'Existing stock has a different expiry date. Add as a separate batch to preserve both.',
          });
        }
        const conversion = convertQuantity(quantity, unit, existing.unit, existing.name, {
          slicesPerLoaf: existing.slicesPerLoaf,
          slicePack: existing.slicePack,
        });
        if (!conversion.success) {
          return res.status(400).json({ message: `Cannot merge units: ${conversion.message}` });
        }
        // Idempotent retry: same requestId already applied → no double-add.
        if (requestId && existing.mergeRequestId === requestId) {
          return res.json({ message: 'Already merged — no changes made.', item: enrichFoodItem(existing), merged: true, duplicate: true });
        }
        const addBase = convertToBase(conversion.quantity, conversion.unit);
        const update = {
          $inc: { quantity: conversion.quantity, baseQuantity: addBase.quantity },
          $set: { updatedAt: new Date() },
        };
        if (requestId) update.$set.mergeRequestId = requestId;
        if (price > 0) update.$inc.price = price;
        const updated = await FoodItem.findOneAndUpdate(
          { _id: existing._id, userId: req.userId },
          update,
          { new: true }
        );
        return res.json({
          message: `${existing.name} updated — now ${updated.quantity} ${updated.unit}.`,
          item: enrichFoodItem(updated),
          merged: true,
        });
      }

      // --- Backend duplicate guard (independent of frontend detection) ---
      const matches = await findCanonicalMatches(req.userId, name);
      if (matches.length && !allowSeparateBatch) {
        return res.status(409).json({
          code: 'EXISTING_INGREDIENT',
          message: `${name} already exists in your pantry. Confirm to update the existing item or add a separate batch.`,
          canonicalName: canonicalName(name),
          matches: matches.map((m) => ({
            _id: m._id, name: m.name, quantity: m.quantity, unit: m.unit, expiryDate: m.expiryDate,
          })),
        });
      }

      const base = convertToBase(quantity, unit);

      const { status } = getExpiryStatus(expiryDate);
      // Keep a canonical ingredient under one consistent category: when stock
      // already exists and the user left the category as 'Other', inherit the
      // existing item's category instead of creating a divergent entry.
      const effectiveCategory = category && category !== 'Other'
        ? category
        : (matches[0]?.category || category || 'Other');

      const item = await FoodItem.create({
        userId: req.userId,
        name,
        category: effectiveCategory,
        quantity,
        baseQuantity: base.quantity,
        unit,
        baseUnit: base.baseUnit,
        purchaseDate: purchaseDate || new Date(),
        expiryDate,
        storageLocation: storageLocation || 'Pantry',
        price: price || 0,
        notes: notes || '',
        status,
        slicesPerLoaf: slicesPerLoaf != null && slicesPerLoaf > 0 ? Number(slicesPerLoaf) : null,
        slicePack: slicePack && Number(slicePack.weightGrams) > 0 && Number(slicePack.slices) > 0
          ? { weightGrams: Number(slicePack.weightGrams), slices: Number(slicePack.slices) }
          : { weightGrams: null, slices: null },
      });

      if (price > 0) {
        const now = new Date();
        let budget = await Budget.findOne({ userId: req.userId, month: now.getMonth() + 1, year: now.getFullYear() });
        if (budget) {
          budget.totalSpent += price;
          budget.remainingBudget = budget.monthlyBudget - budget.totalSpent;
          await budget.save();
        }
      }

      res.status(201).json({ message: 'Food item added to your pantry!', item: enrichFoodItem(item) });
    } catch (error) {
      res.status(500).json({ message: 'Failed to add food item.', error: error.message });
    }
  }
);

router.get('/:id', async (req, res) => {
  try {
    const item = await FoodItem.findOne({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Food item not found.' });
    res.json({ item: enrichFoodItem(item) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch food item.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const item = await FoodItem.findOne({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Food item not found.' });

    const fields = ['name', 'category', 'purchaseDate', 'expiryDate', 'storageLocation', 'price', 'notes'];
    fields.forEach((f) => { if (req.body[f] !== undefined) item[f] = req.body[f]; });

    if (req.body.quantity !== undefined && req.body.unit) {
      const base = convertToBase(req.body.quantity, req.body.unit);
      item.quantity = req.body.quantity;
      item.unit = req.body.unit;
      item.baseQuantity = base.quantity;
      item.baseUnit = base.baseUnit;
    }

    if (req.body.slicesPerLoaf !== undefined) {
      item.slicesPerLoaf = req.body.slicesPerLoaf != null && req.body.slicesPerLoaf > 0
        ? Number(req.body.slicesPerLoaf) : null;
    }

    if (req.body.slicePack !== undefined) {
      const sp = req.body.slicePack;
      item.slicePack = sp && Number(sp.weightGrams) > 0 && Number(sp.slices) > 0
        ? { weightGrams: Number(sp.weightGrams), slices: Number(sp.slices) }
        : { weightGrams: null, slices: null };
    }

    item.status = getExpiryStatus(item.expiryDate).status;
    await item.save();
    res.json({ message: 'Food item updated!', item: enrichFoodItem(item) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update food item.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const item = await FoodItem.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!item) return res.status(404).json({ message: 'Food item not found.' });
    res.json({ message: 'Food item removed from pantry.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete food item.' });
  }
});

router.post(
  '/:id/consume',
  [
    body('consumedQuantity').isFloat({ gt: 0 }).withMessage('Consumed quantity must be greater than zero'),
    body('consumedUnit').notEmpty().withMessage('Consumed unit is required'),
  ],
  validate,
  async (req, res) => {
    try {
      const item = await FoodItem.findOne({ _id: req.params.id, userId: req.userId });
      if (!item) return res.status(404).json({ message: 'Food item not found.' });

      const { consumedQuantity, consumedUnit } = req.body;
      const result = deductQuantity(item.quantity, item.unit, consumedQuantity, consumedUnit);

      const pricePerBase = item.baseQuantity > 0 ? item.price / item.baseQuantity : 0;
      const consumedBase = convertToBase(consumedQuantity, consumedUnit);
      const priceValue = Math.round(pricePerBase * consumedBase.quantity * 100) / 100;

      await ConsumptionRecord.create({
        userId: req.userId,
        foodId: item._id,
        foodName: item.name,
        consumedQuantity,
        consumedUnit,
        priceValue,
      });

      if (result.isEmpty) {
        await FoodItem.findByIdAndDelete(item._id);

        const existing = await ShoppingListItem.findOne({
          userId: req.userId,
          name: { $regex: new RegExp(`^${item.name}$`, 'i') },
          status: 'Pending',
        });
        if (!existing) {
          await ShoppingListItem.create({
            userId: req.userId,
            name: item.name,
            quantity: 1,
            unit: item.unit,
            source: 'consumed',
            priority: 'Medium',
          });
        }

        return res.json({
          message: `${item.name} is all used up! Added to shopping list.`,
          removed: true,
          addedToShoppingList: true,
        });
      }

      item.quantity = result.quantity;
      item.unit = result.unit;
      item.baseQuantity = result.baseQuantity;
      item.baseUnit = result.baseUnit;
      await item.save();

      res.json({
        message: `Consumed ${consumedQuantity} ${consumedUnit} of ${item.name}.`,
        item: enrichFoodItem(item),
      });
    } catch (error) {
      res.status(400).json({ message: error.message || 'Failed to consume food item.' });
    }
  }
);

module.exports = router;
