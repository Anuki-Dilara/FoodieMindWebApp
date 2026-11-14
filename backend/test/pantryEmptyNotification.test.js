// Tests for pantry-empty notifications — detection, dedup, reset, ownership.
// Run: node test/pantryEmptyNotification.test.js

require('dotenv').config();
const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { checkPantryEmpty, countUsableStock } = require('../utils/pantryStatus');
const notificationRoutes = require('../routes/notifications');
const FoodItem = require('../models/FoodItem');
const Notification = require('../models/Notification');
const User = require('../models/User');

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`  ✗ ${name} — ${e.message}`); }
}

const FUTURE = new Date(Date.now() + 10 * 86400000);
const EXPIRED = new Date(Date.now() - 86400000);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

let app, server, baseUrl;
let userA, userB, tokenA, tokenB;
const created = { foods: [], users: [] };

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { }
  return { status: res.status, data };
}

async function addFood(userId, name, quantity, unit, expiryDate = FUTURE) {
  const item = await FoodItem.create({
    userId, name, category: 'Other', quantity, unit,
    baseQuantity: quantity, baseUnit: unit,
    purchaseDate: new Date(), expiryDate, status: 'Fresh',
  });
  created.foods.push(item._id);
  return item;
}

async function pantryEmptyNotifs(userId) {
  return Notification.find({ userId, type: 'pantry_empty' }).lean();
}

async function main() {
  console.log('== Pantry empty notification tests ==');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/moodmeal-pantry', { serverSelectionTimeoutMS: 8000 });
  await FoodItem.init(); await Notification.init(); await User.init();

  // Idempotent cleanup.
  for (const email of ['pantry-empty-a@example.com', 'pantry-empty-b@example.com']) {
    const stale = await User.findOne({ email });
    if (stale) {
      await FoodItem.deleteMany({ userId: stale._id });
      await Notification.deleteMany({ userId: stale._id });
      await User.deleteOne({ _id: stale._id });
    }
  }

  userA = await User.create({ fullName: 'Pantry A', email: 'pantry-empty-a@example.com', passwordHash: await bcrypt.hash('x', 10) });
  userB = await User.create({ fullName: 'Pantry B', email: 'pantry-empty-b@example.com', passwordHash: await bcrypt.hash('x', 10) });
  created.users.push(userA._id, userB._id);
  tokenA = jwt.sign({ userId: userA._id }, JWT_SECRET, { expiresIn: '1h' });
  tokenB = jwt.sign({ userId: userB._id }, JWT_SECRET, { expiresIn: '1h' });

  app = express();
  app.use(express.json());
  app.use('/api/notifications', notificationRoutes);
  server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  await test('user with usable stock gets no notification', async () => {
    await addFood(userA._id, 'Test Rice', 500, 'g');
    const out = await checkPantryEmpty(userA._id);
    assert.strictEqual(out.empty, false);
    assert.strictEqual(out.notified, false);
    assert.strictEqual((await pantryEmptyNotifs(userA._id)).length, 0);
  });

  await test('emptying the pantry notifies exactly once', async () => {
    await FoodItem.deleteMany({ userId: userA._id });
    const r1 = await checkPantryEmpty(userA._id);
    assert.strictEqual(r1.empty, true);
    assert.strictEqual(r1.notified, true);
    const notifs = await pantryEmptyNotifs(userA._id);
    assert.strictEqual(notifs.length, 1);
    assert.strictEqual(notifs[0].title, 'Your pantry is empty!');
    assert.strictEqual(notifs[0].link, '/inventory');
    assert.strictEqual(notifs[0].isRead, false);
  });

  await test('repeated checks do not duplicate the notification', async () => {
    for (let i = 0; i < 5; i++) await checkPantryEmpty(userA._id);
    assert.strictEqual((await pantryEmptyNotifs(userA._id)).length, 1);
    // Concurrent burst — atomic claim must still produce exactly one.
    await Promise.all(Array.from({ length: 10 }, () => checkPantryEmpty(userA._id)));
    assert.strictEqual((await pantryEmptyNotifs(userA._id)).length, 1);
  });

  await test('adding usable stock resets tracking; emptying again notifies anew', async () => {
    await addFood(userA._id, 'Test Eggs', 3, 'pieces');
    const stocked = await checkPantryEmpty(userA._id);
    assert.strictEqual(stocked.empty, false);
    await FoodItem.deleteMany({ userId: userA._id });
    const r = await checkPantryEmpty(userA._id);
    assert.strictEqual(r.notified, true);
    assert.strictEqual((await pantryEmptyNotifs(userA._id)).length, 2, 'second empty period = second notification');
  });

  await test('expired-only stock counts as empty', async () => {
    await FoodItem.deleteMany({ userId: userA._id });
    await User.updateOne({ _id: userA._id }, { $set: { pantryEmptyAlerted: false } });
    await addFood(userA._id, 'Test Old Greens', 5, 'pieces', EXPIRED);
    assert.strictEqual(await countUsableStock(userA._id), 0);
    const r = await checkPantryEmpty(userA._id);
    assert.strictEqual(r.notified, true);
  });

  await test('zero-quantity stock does not count as usable', async () => {
    await FoodItem.deleteMany({ userId: userA._id });
    await User.updateOne({ _id: userA._id }, { $set: { pantryEmptyAlerted: false } });
    await addFood(userA._id, 'Test Empty Sack', 0, 'kg');
    assert.strictEqual(await countUsableStock(userA._id), 0);
    assert.strictEqual((await checkPantryEmpty(userA._id)).notified, true);
  });

  await test('plain water does not count as pantry stock', async () => {
    await FoodItem.deleteMany({ userId: userA._id });
    await User.updateOne({ _id: userA._id }, { $set: { pantryEmptyAlerted: false } });
    for (const name of ['Water', 'Tap Water', 'Drinking water']) {
      await addFood(userA._id, name, 2, 'l');
    }
    assert.strictEqual(await countUsableStock(userA._id), 0, 'water must not count as stock');
    assert.strictEqual((await checkPantryEmpty(userA._id)).notified, true);
  });

  await test('coconut water / milk DO count as stock', async () => {
    await FoodItem.deleteMany({ userId: userA._id });
    await User.updateOne({ _id: userA._id }, { $set: { pantryEmptyAlerted: false } });
    await addFood(userA._id, 'Coconut water', 1, 'l');
    assert.strictEqual(await countUsableStock(userA._id), 1);
    assert.strictEqual((await checkPantryEmpty(userA._id)).empty, false);
  });

  // userB keeps usable stock so their pantry is NOT empty (otherwise the
  // notifications endpoint would correctly alert them too).
  await addFood(userB._id, 'Test Rice', 1, 'kg');

  // ---------- HTTP: ownership + read state ----------
  await test('users only see their own notifications', async () => {
    // userA currently has 3 pantry_empty notifs; userB has none.
    const a = await api('/notifications', { token: tokenA });
    const b = await api('/notifications', { token: tokenB });
    assert.ok(a.data.notifications.length >= 3);
    assert.strictEqual(b.data.notifications.filter((n) => n.type === 'pantry_empty').length, 0);
    assert.ok(b.data.unreadCount < a.data.unreadCount);
  });

  await test('cannot mark another user\'s notification as read', async () => {
    const a = await api('/notifications', { token: tokenA });
    const target = a.data.notifications.find((n) => n.type === 'pantry_empty');
    const res = await api(`/notifications/${target._id}/read`, { method: 'PUT', token: tokenB });
    assert.strictEqual(res.status, 404);
    const still = await Notification.findById(target._id).lean();
    assert.strictEqual(still.isRead, false);
  });

  await test('marking read reduces unread count; read-all works', async () => {
    const before = await api('/notifications', { token: tokenA });
    const target = before.data.notifications.find((n) => n.type === 'pantry_empty' && !n.isRead);
    const res = await api(`/notifications/${target._id}/read`, { method: 'PUT', token: tokenA });
    assert.strictEqual(res.status, 200);
    const after = await api('/notifications', { token: tokenA });
    assert.strictEqual(after.data.unreadCount, before.data.unreadCount - 1);

    const all = await api('/notifications/read-all', { method: 'PUT', token: tokenA });
    assert.strictEqual(all.status, 200);
    const final = await api('/notifications', { token: tokenA });
    assert.strictEqual(final.data.unreadCount, 0);
  });

  await test('notification carries the pantry link', async () => {
    const n = await Notification.findOne({ userId: userA._id, type: 'pantry_empty' }).lean();
    assert.strictEqual(n.link, '/inventory');
  });

  // ---------- cleanup ----------
  await FoodItem.deleteMany({ userId: { $in: [userA._id, userB._id] } });
  await Notification.deleteMany({ userId: { $in: [userA._id, userB._id] } });
  await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { failures.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.error.message}`)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
