// End-to-end tests for pantry duplicate detection + quantity merge.
// Run: node test/pantryDuplicate.test.js
// Spins up the real inventory router + auth on an ephemeral port.

require('dotenv').config();
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const inventoryRoutes = require('../routes/inventory');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  ✗ ${name} — ${e.message}`);
  }
}

const DAY = 86400000;
const EXPIRY_A = new Date(Date.now() + 7 * DAY).toISOString().split('T')[0];
const EXPIRY_B = new Date(Date.now() + 14 * DAY).toISOString().split('T')[0];

const created = { foods: [], users: [] };
let baseUrl;
let token;
let otherToken;
let demoUser;
let otherUser;

async function api(method, path, body, tok = token) {
  const res = await fetch(`${baseUrl}/api/inventory${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

async function seedFood(fields) {
  const item = await FoodItem.create({
    userId: demoUser._id,
    purchaseDate: new Date(),
    status: 'Fresh',
    ...fields,
  });
  created.foods.push(item._id);
  return item;
}

function entry(name, quantity, unit, expiryDate = EXPIRY_A, extra = {}) {
  return { name, quantity, unit, expiryDate, ...extra };
}

async function main() {
  console.log('== Pantry duplicate detection & merge tests ==');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 4000 });
  await FoodItem.init();
  await User.init();

  demoUser = await User.findOne({ email: 'demo@moodmeal.com' });
  assert.ok(demoUser, 'demo user must exist (run npm run seed first)');
  otherUser = await User.findOne({ email: { $ne: 'demo@moodmeal.com' } });
  if (!otherUser) {
    otherUser = await User.create({ fullName: 'PD Test User', email: 'pdtest@example.com', passwordHash: 'x' });
    created.users.push(otherUser._id);
  }
  const sign = (u) => jwt.sign({ userId: u._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1h' });
  token = sign(demoUser);
  otherToken = sign(otherUser);

  const app = express();
  app.use(express.json());
  app.use('/api/inventory', inventoryRoutes);
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  let eggsItem;
  try {
    // --- Detection ---------------------------------------------------------
    await test('duplicate-check finds existing Eggs via alias/case variants', async () => {
      eggsItem = await seedFood({ name: 'Eggs', category: 'Protein', quantity: 10, baseQuantity: 10, unit: 'pieces', baseUnit: 'pieces', expiryDate: EXPIRY_A });
      for (const variant of ['egg', 'EGGS', 'Eggs']) {
        const { status, data } = await api('POST', '/duplicate-check', entry(variant, 3, 'pieces'));
        assert.strictEqual(status, 200);
        assert.ok(data.matches.some((m) => m._id.toString() === eggsItem._id.toString()), `variant ${variant} should match`);
      }
    });

    await test('duplicate-check does not match different variants (quail vs chicken eggs)', async () => {
      await seedFood({ name: 'Chicken Eggs', quantity: 6, baseQuantity: 6, unit: 'pieces', baseUnit: 'pieces', expiryDate: EXPIRY_A });
      const { data } = await api('POST', '/duplicate-check', entry('Quail Eggs', 4, 'pieces'));
      assert.ok(!data.matches.some((m) => /chicken/i.test(m.name)), 'quail eggs must not match chicken eggs');
    });

    await test('duplicate-check reports mergeable projection (10 + 3 = 13)', async () => {
      const { data } = await api('POST', '/duplicate-check', entry('eggs', 3, 'pieces'));
      const m = data.matches.find((x) => x._id.toString() === eggsItem._id.toString());
      assert.ok(m.mergeable, 'same unit + same expiry should be mergeable');
      assert.strictEqual(m.projectedQuantity, 13);
      assert.strictEqual(m.projectedUnit, 'pieces');
    });

    await test('check is read-only — inventory unchanged (cancel path)', async () => {
      const before = await FoodItem.findById(eggsItem._id).lean();
      await api('POST', '/duplicate-check', entry('Eggs', 3, 'pieces'));
      const after = await FoodItem.findById(eggsItem._id).lean();
      assert.strictEqual(after.quantity, before.quantity);
    });

    // --- Backend guard -----------------------------------------------------
    await test('POST without confirmation is rejected with 409 EXISTING_INGREDIENT', async () => {
      const { status, data } = await api('POST', '/', entry('Eggs', 3, 'pieces', EXPIRY_A, { category: 'Other' }));
      assert.strictEqual(status, 409);
      assert.strictEqual(data.code, 'EXISTING_INGREDIENT');
      assert.ok(data.matches.length > 0);
    });

    await test('merge: 10 eggs + 3 eggs = 13, identity/category/expiry preserved', async () => {
      const { status, data } = await api('POST', '/', entry('egg', 3, 'pieces', EXPIRY_A, {
        mergeWithId: eggsItem._id,
        requestId: 'merge-test-1',
        category: 'Other',
      }));
      assert.strictEqual(status, 200);
      assert.strictEqual(data.merged, true);
      const fresh = await FoodItem.findById(eggsItem._id).lean();
      assert.strictEqual(fresh.quantity, 13);
      assert.strictEqual(fresh.unit, 'pieces');
      assert.strictEqual(fresh.category, 'Protein'); // unchanged
      assert.strictEqual(fresh.expiryDate.toISOString().slice(0, 10), EXPIRY_A);
    });

    await test('idempotent retry: same requestId does not double-add', async () => {
      const before = (await FoodItem.findById(eggsItem._id).lean()).quantity;
      const { status, data } = await api('POST', '/', entry('Eggs', 3, 'pieces', EXPIRY_A, {
        mergeWithId: eggsItem._id,
        requestId: 'merge-test-1', // same id as previous merge
      }));
      assert.strictEqual(status, 200);
      assert.strictEqual(data.duplicate, true);
      const fresh = await FoodItem.findById(eggsItem._id).lean();
      assert.strictEqual(fresh.quantity, before); // still 13, not 16
    });

    await test('different requestId merges again (new stock)', async () => {
      const { status } = await api('POST', '/', entry('Eggs', 2, 'pieces', EXPIRY_A, {
        mergeWithId: eggsItem._id, requestId: 'merge-test-2',
      }));
      assert.strictEqual(status, 200);
      const fresh = await FoodItem.findById(eggsItem._id).lean();
      assert.strictEqual(fresh.quantity, 15);
    });

    // --- Batches / expiry ---------------------------------------------------
    await test('different expiry date: merge rejected, separate batch preserves both', async () => {
      const real = await seedFood({ name: 'Yogurt', category: 'Dairy', quantity: 1, baseQuantity: 150, unit: 'g', baseUnit: 'g', expiryDate: EXPIRY_A });
      const check = await api('POST', '/duplicate-check', entry('yogurt', 150, 'g', EXPIRY_B));
      const m = check.data.matches.find((x) => x._id.toString() === real._id.toString());
      assert.strictEqual(m.sameExpiry, false);
      assert.strictEqual(m.mergeable, false);
      assert.strictEqual(m.mergeBlockedReason, 'different-expiry');

      const mergeTry = await api('POST', '/', entry('Yogurt', 150, 'g', EXPIRY_B, { mergeWithId: real._id }));
      assert.strictEqual(mergeTry.status, 409);
      assert.strictEqual(mergeTry.data.code, 'DIFFERENT_EXPIRY');

      const sep = await api('POST', '/', entry('Yogurt', 150, 'g', EXPIRY_B, { category: 'Other', allowSeparateBatch: true }));
      assert.strictEqual(sep.status, 201);
      created.foods.push(sep.data.item._id);
      const batches = await FoodItem.find({ userId: demoUser._id, name: 'Yogurt' }).lean();
      assert.strictEqual(batches.length, 2, 'two stock batches must be preserved');
      assert.ok(batches.some((b) => b.expiryDate.toISOString().slice(0, 10) === EXPIRY_A));
      assert.ok(batches.some((b) => b.expiryDate.toISOString().slice(0, 10) === EXPIRY_B));
      // category consistency: new batch inherits existing 'Dairy'
      assert.strictEqual(sep.data.item.category, 'Dairy');
    });

    // --- Unit conversion ----------------------------------------------------
    await test('carrot kg + pieces merges via estimated profile conversion', async () => {
      const carrot = await seedFood({ name: 'Carrots', category: 'Vegetables', quantity: 1, baseQuantity: 1000, unit: 'kg', baseUnit: 'g', expiryDate: EXPIRY_A });
      const check = await api('POST', '/duplicate-check', entry('carrot', 2, 'pieces'));
      const m = check.data.matches.find((x) => x._id.toString() === carrot._id.toString());
      assert.ok(m, 'carrot should be detected');
      // Conversion may or may not exist depending on profile — assert honesty either way.
      if (m.mergeable) {
        assert.ok(m.conversion.isEstimate, 'count->weight must be flagged estimated');
        assert.ok(m.projectedQuantity > 1, 'projection should exceed existing 1 kg');
      } else {
        assert.strictEqual(m.mergeBlockedReason, 'incompatible-units');
      }
    });

    await test('incompatible units cannot be force-merged (400)', async () => {
      const oil = await seedFood({ name: 'Olive Oil', category: 'Cooking Essentials', quantity: 500, baseQuantity: 500, unit: 'ml', baseUnit: 'ml', expiryDate: EXPIRY_A });
      const { status } = await api('POST', '/', entry('Olive Oil', 2, 'pieces', EXPIRY_A, { mergeWithId: oil._id }));
      assert.strictEqual(status, 400);
    });

    // --- Ownership ------------------------------------------------------------
    await test("cannot merge into another user's item", async () => {
      const { status } = await api('POST', '/', entry('Eggs', 1, 'pieces', EXPIRY_A, {
        mergeWithId: eggsItem._id, requestId: 'x',
      }), otherToken);
      assert.strictEqual(status, 404);
    });

    await test("other user's pantry items are not detected as duplicates", async () => {
      const { data } = await api('POST', '/duplicate-check', entry('Eggs', 3, 'pieces'), otherToken);
      assert.ok(!data.matches.some((m) => m.name === 'Eggs'), 'other user must not see demo eggs');
    });

    // --- Concurrency -----------------------------------------------------------
    await test('concurrent merges are atomic — no lost updates', async () => {
      const item = await seedFood({ name: 'Flour', category: 'Grains and Cereals', quantity: 1, baseQuantity: 1000, unit: 'kg', baseUnit: 'g', expiryDate: EXPIRY_A });
      const results = await Promise.all([1, 2, 3].map((i) =>
        api('POST', '/', entry('Flour', 0.5, 'kg', EXPIRY_A, { mergeWithId: item._id, requestId: `conc-${i}` }))
      ));
      assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
      const fresh = await FoodItem.findById(item._id).lean();
      assert.strictEqual(fresh.quantity, 2.5); // 1 + 3×0.5, no lost update
    });
  } finally {
    server.close();
    await FoodItem.deleteMany({ _id: { $in: created.foods } });
    await User.deleteMany({ _id: { $in: created.users } });
    await mongoose.disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
