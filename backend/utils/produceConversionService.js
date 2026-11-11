// Shared produce conversion service.
//
// Converts between weight (g/kg), volume (ml/l/cups/tbsp/tsp) and
// produce-specific count units (piece, head, clove, bunch, stalk, ear, cob,
// wedge, slice, segment, pod, sprig, whole) using ingredient-specific
// profiles from data/produceProfiles.js, optionally overridden by
// admin-managed ProduceConversion documents.
//
// Everything produced by this service is an ESTIMATE — counts are average
// weights, never exact measurements.

const { PRODUCE_PROFILES } = require('../data/produceProfiles');

// In-memory registry: canonical ingredient name -> profile.
// Seeded from the static catalogue; admin/DB profiles override on init().
const registry = new Map(Object.entries(PRODUCE_PROFILES));
let dbLoaded = false;

const SIZE_ALIASES = {
  xs: 'xs', 'extra small': 'xs', xsmall: 'xs',
  s: 's', small: 's', thin: 's',
  m: 'm', medium: 'm', med: 'm', standard: 'm',
  l: 'l', large: 'l', thick: 'l',
  xl: 'xl', 'extra large': 'xl', xlarge: 'xl', 'x-large': 'xl',
};

const FORM_ALIASES = {
  whole: 'whole', chopped: 'chopped', diced: 'diced', sliced: 'sliced',
  grated: 'grated', shred: 'shredded', shredded: 'shredded',
  mash: 'mashed', mashed: 'mashed',
};

const COUNT_UNITS = {
  piece: 'piece', pieces: 'piece', whole: 'whole',
  head: 'head', heads: 'head',
  bulb: 'bulb', bulbs: 'bulb',
  clove: 'clove', cloves: 'clove',
  bunch: 'bunch', bunches: 'bunch',
  stalk: 'stalk', stalks: 'stalk',
  ear: 'ear', ears: 'ear',
  cob: 'cob', cobs: 'cob',
  wedge: 'wedge', wedges: 'wedge',
  slice: 'slice', slices: 'slice',
  segment: 'segment', segments: 'segment',
  pod: 'pod', pods: 'pod',
  sprig: 'sprig', sprigs: 'sprig',
  loaf: 'loaf', loaves: 'loaf',
  cube: 'cube', cubes: 'cube',
};

const WEIGHT_UNITS = { g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilogram: 'kg', kilograms: 'kg' };
const VOLUME_UNITS = {
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
};

const COUNT_PLURALS = {
  piece: 'pieces', whole: 'whole', head: 'heads', bulb: 'bulbs', clove: 'cloves',
  bunch: 'bunches', stalk: 'stalks', ear: 'ears', cob: 'cobs', wedge: 'wedges',
  slice: 'slices', segment: 'segments', pod: 'pods', sprig: 'sprigs',
  loaf: 'loaves', cube: 'cubes',
};

function normalizeSize(size) {
  if (!size) return null;
  return SIZE_ALIASES[String(size).toLowerCase().trim()] || null;
}

function normalizeForm(form) {
  if (!form) return null;
  return FORM_ALIASES[String(form).toLowerCase().trim()] || null;
}

// Lazy require to avoid a circular dependency with unitConversion.
function canonicalNameFor(ingredientName) {
  const { normalizeIngredientName } = require('./unitConversion');
  try {
    return normalizeIngredientName(ingredientName);
  } catch (e) {
    return String(ingredientName || '').toLowerCase().trim();
  }
}

function getProfile(ingredientName) {
  if (!ingredientName) return null;
  const profile = registry.get(canonicalNameFor(ingredientName));
  if (!profile || profile.enabled === false) return null;
  return profile;
}

function getIngredientConversionProfile(ingredientName) {
  return getProfile(ingredientName);
}

// Load admin-managed profiles from MongoDB and overlay them on the static
// catalogue. Safe to call when the DB is unavailable — static profiles remain.
async function initProduceProfiles() {
  try {
    if (dbLoaded) return;
    if (require('mongoose').connection.readyState !== 1) return;
    const ProduceConversion = require('../models/ProduceConversion');
    const docs = await ProduceConversion.find({}).lean();
    for (const doc of docs) {
      if (!doc.data) continue;
      registry.set(doc.canonicalName, { ...doc.data, enabled: doc.enabled !== false });
    }
    dbLoaded = true;
  } catch (e) {
    // DB unavailable — static catalogue still applies.
  }
}

function refreshProduceProfiles() {
  dbLoaded = false;
  return initProduceProfiles();
}

// Classify a raw unit string into { kind, unit }.
function classifyUnit(rawUnit) {
  if (!rawUnit) return null;
  const u = String(rawUnit).toLowerCase().trim();
  if (WEIGHT_UNITS[u]) return { kind: 'weight', unit: WEIGHT_UNITS[u] };
  if (VOLUME_UNITS[u]) return { kind: 'volume', unit: VOLUME_UNITS[u] };
  if (COUNT_UNITS[u]) return { kind: 'count', unit: COUNT_UNITS[u] };
  return null;
}

function resolveCountGrams(unitDef, size) {
  if (typeof unitDef === 'number') return unitDef;
  if (!unitDef || typeof unitDef !== 'object') return null;
  const sz = normalizeSize(size) || 'm';
  if (unitDef[sz] != null) return unitDef[sz];
  if (unitDef.m != null) return unitDef.m;
  if (unitDef.d != null) return unitDef.d;
  const vals = ['xs', 's', 'm', 'l', 'xl'].map((k) => unitDef[k]).filter((v) => typeof v === 'number');
  if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  return null;
}

// 'whole' falls back to 'piece' when the profile has no explicit 'whole'.
function countGramsPerUnit(profile, countUnit, size) {
  let def = profile.countUnits[countUnit];
  if (def == null && countUnit === 'whole') def = profile.countUnits.piece;
  if (def == null && countUnit === 'piece') def = profile.countUnits.whole;
  if (def == null) return null;
  return resolveCountGrams(def, size);
}

function volumeGramsPerUnit(profile, volumeUnit, form) {
  const f = normalizeForm(form) || 'chopped';
  const cups = profile.cups || {};
  let gpc = cups[f];
  if (gpc == null) gpc = cups.chopped;
  if (gpc == null) gpc = cups.whole;
  if (gpc == null) return null;
  if (volumeUnit === 'cup') return gpc;
  if (volumeUnit === 'tbsp') return gpc / 16;
  if (volumeUnit === 'tsp') return gpc / 48;
  // ml / l use the derived density (g per ml)
  if (profile.density != null) return volumeUnit === 'l' ? profile.density * 1000 : profile.density;
  return null;
}

function quantityToGrams(quantity, classified, profile, options) {
  if (classified.kind === 'weight') {
    return classified.unit === 'kg' ? quantity * 1000 : quantity;
  }
  if (classified.kind === 'count') {
    const g = countGramsPerUnit(profile, classified.unit, options.size);
    return g == null ? null : quantity * g;
  }
  // volume -> grams
  const perUnit = volumeGramsPerUnit(profile, classified.unit, options.form);
  return perUnit == null ? null : quantity * perUnit;
}

function gramsToQuantity(grams, classified, profile, options) {
  if (classified.kind === 'weight') {
    return { quantity: classified.unit === 'kg' ? grams / 1000 : grams, unit: classified.unit };
  }
  if (classified.kind === 'count') {
    const g = countGramsPerUnit(profile, classified.unit, options.size);
    if (g == null || g === 0) return null;
    return { quantity: grams / g, unit: COUNT_PLURALS[classified.unit] || `${classified.unit}s` };
  }
  // grams -> volume
  const perUnit = volumeGramsPerUnit(profile, classified.unit, options.form);
  if (perUnit == null || perUnit === 0) return null;
  const unitName = { cup: 'cups', tbsp: 'tablespoons', tsp: 'teaspoons', ml: 'ml', l: 'l' }[classified.unit];
  return { quantity: grams / perUnit, unit: unitName };
}

// Volume <-> volume is a plain volumetric conversion (no ingredient profile
// needed for the ratio, but we still flag it as an estimate via the profile).
const ML_PER_VOLUME_UNIT = { ml: 1, l: 1000, cup: 240, tbsp: 15, tsp: 5 };
const VOLUME_UNIT_NAMES = { ml: 'ml', l: 'l', cup: 'cups', tbsp: 'tablespoons', tsp: 'teaspoons' };

// Bread profiles carry `bread` metadata. A user/admin-provided slice count
// (options.slicesPerLoaf, e.g. from the inventory item's slicesPerLoaf field)
// overrides the profile default and injects a dynamic 'loaf' gram weight of
// slicesPerLoaf * sliceGrams. Without any slice count a 'loaf' stays
// unconvertible — a universal slice count is never assumed.
// Cheese profiles carry `cheese` metadata. A per-item package spec
// (options.slicePack = { weightGrams, slices }) overrides the STANDARD slice
// weight (size keys m/d) with weightGrams/slices — thin/thick estimates are
// preserved. Never assumes a universal slice weight.
function effectiveProfile(profile, options = {}) {
  if (!profile) return profile;
  let result = profile;
  if (profile.bread) {
    const spl = Number(options.slicesPerLoaf);
    if (Number.isFinite(spl) && spl > 0) {
      const sliceGrams = resolveCountGrams(profile.countUnits?.slice, null);
      if (sliceGrams) {
        result = {
          ...result,
          countUnits: { ...(result.countUnits || {}), loaf: spl * sliceGrams },
        };
      }
    }
  }
  if (profile.cheese) {
    const pack = options.slicePack;
    const w = Number(pack?.weightGrams);
    const s = Number(pack?.slices);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(s) && s > 0) {
      const perSlice = w / s;
      const sliceDef = { ...(result.countUnits?.slice || {}) };
      sliceDef.m = perSlice;
      sliceDef.d = perSlice;
      result = { ...result, countUnits: { ...(result.countUnits || {}), slice: sliceDef } };
    }
  }
  return result;
}

// The package spec actually used for a cheese conversion, for display metadata.
function effectiveSlicePack(profile, options = {}) {
  if (!profile || !profile.cheese) return null;
  const pack = options.slicePack;
  const w = Number(pack?.weightGrams);
  const s = Number(pack?.slices);
  return Number.isFinite(w) && w > 0 && Number.isFinite(s) && s > 0
    ? { weightGrams: w, slices: s }
    : null;
}

// The slice count actually used for a bread conversion, for display metadata.
function effectiveSlicesPerLoaf(profile, options = {}) {
  if (!profile || !profile.bread) return null;
  const override = Number(options.slicesPerLoaf);
  if (Number.isFinite(override) && override > 0) return override;
  const def = Number(profile.bread.slicesPerLoaf);
  return Number.isFinite(def) && def > 0 ? def : null;
}

function convertProduceQuantity(quantity, fromUnit, toUnit, profile, options = {}) {
  profile = effectiveProfile(profile, options);
  const from = classifyUnit(fromUnit);
  const to = classifyUnit(toUnit);
  if (!from || !to) {
    return { success: false, message: 'Unsupported unit for produce conversion' };
  }

  const meta = {
    estimated: true,
    profile: profile.key,
    confidence: profile.confidence,
    source: profile.source,
    size: normalizeSize(options.size),
    form: normalizeForm(options.form),
  };
  const spl = effectiveSlicesPerLoaf(profile, options);
  if (spl != null) meta.slicesPerLoaf = spl;
  const pack = effectiveSlicePack(profile, options);
  if (pack) meta.slicePack = pack;

  if (from.kind === 'volume' && to.kind === 'volume') {
    const ml = quantity * ML_PER_VOLUME_UNIT[from.unit];
    const result = ml / ML_PER_VOLUME_UNIT[to.unit];
    return {
      success: true,
      quantity: Math.round(result * 10000) / 10000,
      unit: VOLUME_UNIT_NAMES[to.unit],
      isEstimate: true,
      conversion: { ...meta, via: 'volume' },
    };
  }

  const grams = quantityToGrams(quantity, from, profile, options);
  if (grams == null) {
    return {
      success: false,
      message: `No ${profile.name} conversion profile for ${fromUnit} -> ${toUnit}`,
      conversion: meta,
    };
  }

  const out = gramsToQuantity(grams, to, profile, options);
  if (!out) {
    return {
      success: false,
      message: `No ${profile.name} conversion profile for grams -> ${toUnit}`,
      conversion: meta,
    };
  }

  return {
    success: true,
    quantity: Math.round(out.quantity * 10000) / 10000,
    unit: out.unit,
    isEstimate: true,
    conversion: { ...meta, grams, via: 'grams' },
  };
}

// Returns a conversion result when the ingredient has a produce profile AND
// the unit pair genuinely requires it (a produce count unit is involved, or a
// weight<->volume pair where the profile supplies volume data). Returns null
// when the generic unit converter should handle it instead.
function tryConvert(quantity, fromUnit, toUnit, ingredientName, options = {}) {
  const profile = getProfile(ingredientName);
  if (!profile) return null;

  const from = classifyUnit(fromUnit);
  const to = classifyUnit(toUnit);
  if (!from || !to) return null;

  const countInvolved = from.kind === 'count' || to.kind === 'count';
  const weightVolumePair =
    (from.kind === 'weight' && to.kind === 'volume') || (from.kind === 'volume' && to.kind === 'weight');
  const volumeData = profile.density != null || Object.keys(profile.cups || {}).length > 0;

  if (!countInvolved && !(weightVolumePair && volumeData)) return null;

  return convertProduceQuantity(quantity, fromUnit, toUnit, profile, options);
}

// Lightweight check used by canConvert — mirrors tryConvert's gating.
function isProduceConvertible(fromUnit, toUnit, ingredientName) {
  const profile = getProfile(ingredientName);
  if (!profile) return false;
  const from = classifyUnit(fromUnit);
  const to = classifyUnit(toUnit);
  if (!from || !to) return false;
  const countInvolved = from.kind === 'count' || to.kind === 'count';
  const weightVolumePair =
    (from.kind === 'weight' && to.kind === 'volume') || (from.kind === 'volume' && to.kind === 'weight');
  const volumeData = profile.density != null || Object.keys(profile.cups || {}).length > 0;
  if (!countInvolved && !(weightVolumePair && volumeData)) return false;
  return convertProduceQuantity(1, fromUnit, toUnit, profile, {}).success;
}

function supportedUnitsFor(ingredientName) {
  const profile = getProfile(ingredientName);
  if (!profile) return null;
  const units = ['g', 'kg', 'pieces'];
  const countUnits = Object.keys(profile.countUnits || {});
  for (const u of countUnits) {
    // Storage-canonical unit labels (FoodItem.unit enum): 'piece' is stored
    // as 'pieces'; other count units keep their singular form.
    const label = u === 'piece' ? 'pieces' : u;
    if (!units.includes(label)) units.push(label);
  }
  // Sliced bread can always be *stored* in loaves — a per-item slicesPerLoaf
  // (or profile default) is what enables loaf<->slice conversion.
  if (profile.bread && profile.bread.breadType !== 'roll' && !units.includes('loaf')) {
    units.push('loaf');
  }
  if (profile.density != null || Object.keys(profile.cups || {}).length) {
    for (const u of ['cups', 'tablespoons', 'teaspoons', 'ml', 'l']) {
      if (!units.includes(u)) units.push(u);
    }
  }
  return { units, preferredUnit: profile.preferredUnit, profile };
}

// Idempotent seeding: inserts missing profiles and refreshes non-admin-edited
// ones. Admin-modified documents are never overwritten.
async function upsertProduceProfiles() {
  if (require('mongoose').connection.readyState !== 1) {
    return { skipped: 'no-db-connection' };
  }
  const ProduceConversion = require('../models/ProduceConversion');
  const stats = { created: 0, updated: 0, preserved: 0 };
  for (const [canonical, profile] of Object.entries(PRODUCE_PROFILES)) {
    const existing = await ProduceConversion.findOne({ canonicalName: canonical }).lean();
    if (existing && existing.adminModified) {
      stats.preserved += 1;
      continue;
    }
    const data = { ...profile, enabled: true };
    if (existing) {
      await ProduceConversion.updateOne(
        { canonicalName: canonical },
        { $set: { name: profile.name, category: profile.category, data, enabled: true, adminModified: false } }
      );
      stats.updated += 1;
    } else {
      await ProduceConversion.create({
        canonicalName: canonical,
        name: profile.name,
        category: profile.category,
        data,
        enabled: true,
        adminModified: false,
      });
      stats.created += 1;
    }
  }
  await refreshProduceProfiles();
  return stats;
}

module.exports = {
  getIngredientConversionProfile,
  getProfile,
  initProduceProfiles,
  refreshProduceProfiles,
  upsertProduceProfiles,
  convertProduceQuantity,
  tryConvert,
  isProduceConvertible,
  supportedUnitsFor,
  classifyUnit,
  normalizeSize,
  normalizeForm,
  PRODUCE_PROFILES,
};
