function getExpiryStatus(expiryDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { status: 'Expired', daysLeft: diffDays };
  if (diffDays <= 3) return { status: 'Use Soon', daysLeft: diffDays };
  return { status: 'Fresh', daysLeft: diffDays };
}

function updateFoodItemStatus(foodItem) {
  const { status, daysLeft } = getExpiryStatus(foodItem.expiryDate);
  foodItem.status = status;
  return { ...foodItem.toObject?.() || foodItem, status, daysLeft };
}

module.exports = { getExpiryStatus, updateFoodItemStatus };
