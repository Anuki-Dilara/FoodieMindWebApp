const express = require('express');
const User = require('../models/User');
const Recipe = require('../models/Recipe');
const Notification = require('../models/Notification');
const FoodItem = require('../models/FoodItem');
const MealPlan = require('../models/MealPlan');
const ShoppingListItem = require('../models/ShoppingListItem');
const Budget = require('../models/Budget');
const { adminAuth } = require('../middleware/auth');
const { sanitizeRecipeInput, recipeCompleteness } = require('../utils/recipeValidation');

const router = express.Router();

router.use(adminAuth);

router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ users, count: users.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const [userCount, recipeCount, foodCount, mealCount, notifCount] = await Promise.all([
      User.countDocuments(),
      Recipe.countDocuments(),
      FoodItem.countDocuments(),
      MealPlan.countDocuments(),
      Notification.countDocuments(),
    ]);
    res.json({ userCount, recipeCount, foodCount, mealCount, notifCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

router.post('/recipes', async (req, res) => {
  try {
    const { data, errors } = sanitizeRecipeInput(req.body, { partial: false });
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    const recipe = await Recipe.create({
      ...data,
      source: 'admin',
      createdBy: req.userId,
      isSeed: false,
    });
    res.status(201).json({ recipe });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create recipe.' });
  }
});

router.put('/recipes/:id', async (req, res) => {
  try {
    const existing = await Recipe.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Recipe not found.' });

    // Partial update: only provided fields are changed, so existing
    // attributes (mood tags, nutrition, preparation, etc.) are retained.
    const { data, errors } = sanitizeRecipeInput(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors });
    }

    const recipe = await Recipe.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json({ recipe });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update recipe.' });
  }
});

router.delete('/recipes/:id', async (req, res) => {
  try {
    await Recipe.findByIdAndDelete(req.params.id);
    res.json({ message: 'Recipe deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete recipe.' });
  }
});

router.get('/recipes', async (req, res) => {
  try {
    const recipes = await Recipe.find().sort({ name: 1 }).lean();
    // Attach attribute-completeness metadata for the admin UI.
    const withMeta = recipes.map((r) => ({
      ...r,
      completeness: recipeCompleteness(r),
    }));
    res.json({ recipes: withMeta });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch recipes.' });
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(100);
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user.' });
  }
});

// ---------- Produce conversion profile management ----------
const ProduceConversion = require('../models/ProduceConversion');
const produceService = require('../utils/produceConversionService');

router.get('/produce-conversions', async (req, res) => {
  try {
    const { q, category } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { canonicalName: { $regex: q, $options: 'i' } },
      ];
    }
    const docs = await ProduceConversion.find(filter).sort({ name: 1 }).lean();
    res.json({
      conversions: docs.map((d) => ({
        canonicalName: d.canonicalName,
        name: d.name,
        category: d.category,
        enabled: d.enabled,
        adminModified: d.adminModified,
        profile: d.data,
      })),
      count: docs.length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch conversion profiles.' });
  }
});

router.get('/produce-conversions/:canonical', async (req, res) => {
  try {
    const doc = await ProduceConversion.findOne({ canonicalName: req.params.canonical.toLowerCase() }).lean();
    if (!doc) return res.status(404).json({ message: 'Conversion profile not found.' });
    res.json({ conversion: { ...doc, profile: doc.data } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch conversion profile.' });
  }
});

// Update a profile. Body may contain `profile` (partial profile data merged
// into data), `enabled`, and/or top-level profile fields (countUnits, cups,
// density, preferredUnit, confidence, supportedUnits, source).
router.put('/produce-conversions/:canonical', async (req, res) => {
  try {
    const canonical = req.params.canonical.toLowerCase();
    const doc = await ProduceConversion.findOne({ canonicalName: canonical });
    if (!doc) return res.status(404).json({ message: 'Conversion profile not found.' });

    const { profile, enabled, ...fields } = req.body || {};
    const data = { ...(doc.data || {}) };
    const profileFields = ['countUnits', 'cups', 'density', 'preferredUnit', 'supportedUnits', 'confidence', 'source', 'name', 'category'];
    for (const f of profileFields) {
      if (fields[f] !== undefined) data[f] = fields[f];
    }
    if (profile && typeof profile === 'object') Object.assign(data, profile);
    // Rebuild derived cup forms + density when a chopped-cup weight is set.
    if (data.cups && data.cups.chopped != null) {
      const { FORM_FACTORS } = require('../data/produceProfiles');
      const cups = {};
      for (const [form, factor] of Object.entries(FORM_FACTORS)) {
        cups[form] = Math.round(data.cups.chopped * factor * 100) / 100;
      }
      data.cups = cups;
      data.density = Math.round((data.cups.chopped / 240) * 100) / 100;
    }
    data.estimated = true; // all produce conversions remain estimates
    data.enabled = enabled !== undefined ? enabled : data.enabled !== false;

    doc.data = data;
    doc.enabled = data.enabled;
    doc.adminModified = true;
    await doc.save();
    await produceService.refreshProduceProfiles();
    res.json({ message: 'Conversion profile updated.', conversion: { canonicalName: doc.canonicalName, name: doc.name, enabled: doc.enabled, adminModified: doc.adminModified, profile: doc.data } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update conversion profile.' });
  }
});

// Preview a conversion for a profile: ?canonical=&qty=&from=&to=&size=&form=
router.get('/produce-conversions/:canonical/preview', async (req, res) => {
  try {
    const canonical = req.params.canonical.toLowerCase();
    const doc = await ProduceConversion.findOne({ canonicalName: canonical }).lean();
    const profile = doc?.data || produceService.PRODUCE_PROFILES[canonical];
    if (!profile) return res.status(404).json({ message: 'Conversion profile not found.' });
    const qty = Number(req.query.qty);
    if (!qty || qty <= 0) return res.status(400).json({ message: 'qty must be a positive number.' });
    const result = produceService.convertProduceQuantity(qty, req.query.from, req.query.to, profile, {
      size: req.query.size, form: req.query.form,
    });
    res.json({ success: result.success, result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to preview conversion.' });
  }
});

// Create a new profile for produce not in the catalogue. Requires at least
// one conversion basis (countUnits or cups/density) — unverified produce is
// never given invented values.
router.post('/produce-conversions', async (req, res) => {
  try {
    const { name, category = 'vegetable', profile } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Ingredient name is required.' });
    const { normalizeIngredientName } = require('../utils/unitConversion');
    const canonical = normalizeIngredientName(name);
    const hasBasis = profile && ((profile.countUnits && Object.keys(profile.countUnits).length) || profile.cups || profile.density != null);
    if (!hasBasis) {
      return res.status(400).json({ message: 'A conversion basis (countUnits or cups/density) is required.' });
    }
    const existing = await ProduceConversion.findOne({ canonicalName: canonical });
    if (existing) return res.status(409).json({ message: 'A conversion profile already exists for this ingredient.' });
    const data = {
      key: canonical,
      name: name.trim(),
      category,
      countUnits: profile.countUnits || {},
      cups: profile.cups || {},
      density: profile.density ?? null,
      preferredUnit: profile.preferredUnit || 'g',
      supportedUnits: profile.supportedUnits || ['g', 'kg'],
      confidence: profile.confidence || 'low',
      estimated: true,
      enabled: profile.enabled !== false,
      source: profile.source || 'Admin-configured',
    };
    const doc = await ProduceConversion.create({
      canonicalName: canonical,
      name: data.name,
      category,
      data,
      enabled: data.enabled,
      adminModified: true,
    });
    await produceService.refreshProduceProfiles();
    res.status(201).json({ message: 'Conversion profile created.', conversion: { canonicalName: doc.canonicalName, name: doc.name, enabled: doc.enabled, adminModified: doc.adminModified, profile: doc.data } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create conversion profile.' });
  }
});

module.exports = router;
