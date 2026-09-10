const express = require('express');
const { body } = require('express-validator');
const FoodItem = require('../models/FoodItem');
const ConsumptionRecord = require('../models/ConsumptionRecord');
const ShoppingListItem = require('../models/ShoppingListItem');
const Budget = require('../models/Budget');
const validate = require('../middleware/validate');
const { auth } = require('../middleware/auth');
const { convertToBase, deductQuantity } = require('../utils/unitConversion');
const { getExpiryStatus } = require('../utils/expiryHelper');

const router = express.Router();

router.use(auth);

function enrichFoodItem(item) {
  const { status, daysLeft } = getExpiryStatus(item.expiryDate);
  return { ...item.toObject(), status, daysLeft };
}

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
      const { name, category, quantity, unit, purchaseDate, expiryDate, storageLocation, price, notes } = req.body;
      const base = convertToBase(quantity, unit);

      const { status } = getExpiryStatus(expiryDate);

      const item = await FoodItem.create({
        userId: req.userId,
        name,
        category: category || 'Other',
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
