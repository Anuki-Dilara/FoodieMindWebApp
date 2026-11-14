// Pantry-empty detection. A pantry is "empty" when the user has no usable
// stock: every FoodItem must have quantity > 0, a non-expired expiryDate, and
// must not be plain drinking water (the household staple never counts as
// pantry stock). Detection is persistent and race-safe via an atomic claim on
// User.pantryEmptyAlerted — repeated checks create at most one notification
// per empty period; restocking resets the flag so a future empty period can
// notify again.

const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getExpiryStatus } = require('./expiryHelper');
const { isStapleWater } = require('./ingredientIdentity');

const PANTRY_EMPTY_TITLE = 'Your pantry is empty!';
const PANTRY_EMPTY_MESSAGE =
  'You have no usable ingredients left in your pantry. Add some ingredients to start discovering recipes again.';
const PANTRY_EMPTY_LINK = '/inventory';

async function countUsableStock(userId) {
  const items = await FoodItem.find({ userId }).select('name quantity expiryDate').lean();
  let usable = 0;
  for (const item of items) {
    if (!(Number(item.quantity) > 0)) continue; // zero stock is not usable
    if (isStapleWater(item.name)) continue; // water is a staple, not stock
    if (getExpiryStatus(item.expiryDate).status === 'Expired') continue;
    usable += 1;
  }
  return usable;
}

// Returns { empty, notified } — `notified` is true only for the request that
// won the atomic claim and actually created the notification.
async function checkPantryEmpty(userId) {
  const usable = await countUsableStock(userId);

  if (usable > 0) {
    // Restocked — reset the empty-period flag so a future empty period can
    // notify again. Cheap no-op when the flag is already false.
    await User.updateOne({ _id: userId, pantryEmptyAlerted: true }, { $set: { pantryEmptyAlerted: false } });
    return { empty: false, usable, notified: false };
  }

  // Atomic claim: only the first concurrent request flips the flag.
  const claimed = await User.findOneAndUpdate(
    { _id: userId, pantryEmptyAlerted: { $ne: true } },
    { $set: { pantryEmptyAlerted: true } },
    { new: true }
  );
  if (!claimed) return { empty: true, usable: 0, notified: false };

  try {
    await Notification.create({
      userId,
      type: 'pantry_empty',
      title: PANTRY_EMPTY_TITLE,
      message: PANTRY_EMPTY_MESSAGE,
      link: PANTRY_EMPTY_LINK,
      isRead: false,
    });
  } catch (e) {
    // Release the claim so a later check can retry the notification.
    await User.updateOne({ _id: userId }, { $set: { pantryEmptyAlerted: false } }).catch(() => {});
    throw e;
  }
  return { empty: true, usable: 0, notified: true };
}

module.exports = { checkPantryEmpty, countUsableStock, PANTRY_EMPTY_TITLE, PANTRY_EMPTY_MESSAGE, PANTRY_EMPTY_LINK };
