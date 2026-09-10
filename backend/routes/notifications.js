const express = require('express');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const { runDailyChecks } = require('../utils/notificationService');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
  try {
    await runDailyChecks(req.userId);
    const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 });
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications.' });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, userId: req.userId });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    notification.isRead = true;
    await notification.save();
    res.json({ message: 'Notification marked as read.', notification });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notification.' });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.userId, isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ message: 'Notification deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete notification.' });
  }
});

module.exports = router;
