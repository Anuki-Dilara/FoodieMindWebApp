require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const connectDB = require('./config/db');
const User = require('./models/User');
const Notification = require('./models/Notification');
const { runDailyChecks } = require('./utils/notificationService');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const inventoryRoutes = require('./routes/inventory');
const recipeRoutes = require('./routes/recipes');
const moodRoutes = require('./routes/mood');
const mealPlannerRoutes = require('./routes/mealPlanner');
const shoppingListRoutes = require('./routes/shoppingList');
const budgetRoutes = require('./routes/budget');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'FoodieMind API is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/meal-planner', mealPlannerRoutes);
app.use('/api/shopping-list', shoppingListRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

// Daily notification checks at 8 AM
cron.schedule('0 8 * * *', async () => {
  try {
    const users = await User.find({ role: 'user' });
    for (const user of users) {
      await runDailyChecks(user._id);
    }
    console.log('Daily notification checks completed');
  } catch (error) {
    console.error('Cron job error:', error.message);
  }
});

app.listen(PORT, () => {
  console.log(`FoodieMind server running on port ${PORT}`);
});

module.exports = app;
