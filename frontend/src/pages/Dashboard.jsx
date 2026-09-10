import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { formatLKR } from '../utils/helpers';
import DashboardCard from '../components/DashboardCard';
import FoodCard from '../components/FoodCard';
import RecipeCard from '../components/RecipeCard';
import ChartCard from '../components/ChartCard';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';
import CookRecipeModal from '../components/CookRecipeModal';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = ['#8DD9C4', '#FF6B6B', '#FFE082'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cookRecipe, setCookRecipe] = useState(null);

  const fetchDashboard = async () => {
    try {
      const res = await API.get('/dashboard');
      setData(res.data);
    } catch (e) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  const handleCook = async (recipe) => {
    try {
      const res = await API.post(`/recipes/${recipe._id}/cooked`);
      toast.success(res.data.message);
      fetchDashboard();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to cook recipe');
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!data) return null;

  const { summary, soonUse, topRecommendations, latestNotifications, welcomeMessage, wasteChart } = data;

  const chartData = [
    { name: 'Fresh', value: wasteChart?.fresh || 0 },
    { name: 'Use Soon', value: summary?.expiringSoon || 0 },
    { name: 'Expired', value: summary?.expired || 0 },
  ].filter((d) => d.value > 0);

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-charcoal">{welcomeMessage}</h1>
        <p className="text-charcoal/60 mt-1">Use these soon before they say goodbye.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <DashboardCard icon="🥫" title="Inventory Items" value={summary.totalInventory} color="bg-primary/20" />
        <DashboardCard icon="⏰" title="Expiring Soon" value={summary.expiringSoon} color="bg-warning/20" />
        <DashboardCard icon="🚫" title="Expired" value={summary.expired} color="bg-danger/20" />
        <DashboardCard icon="🛒" title="Shopping List" value={summary.shoppingListItems} color="bg-info/20" />
        <DashboardCard icon="💰" title="Monthly Budget" value={formatLKR(summary.monthlyBudget)} color="bg-accent/30" />
        <DashboardCard icon="💵" title="Remaining" value={formatLKR(summary.remainingBudget)} color="bg-success/20" />
        <DashboardCard icon="🗑️" title="Wasted Value" value={formatLKR(summary.wastedFoodCost)} color="bg-danger/10" />
        <DashboardCard icon="🛍️" title="Shopping Est." value={formatLKR(summary.shoppingEstimate)} color="bg-secondary/20" />
      </div>

      {/* Soon Use Section */}
      {soonUse?.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-charcoal">⚡ Soon Use</h2>
            <Link to="/inventory"><CuteButton variant="outline" className="!py-1.5 !px-4 text-sm">View All</CuteButton></Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {soonUse.slice(0, 6).map((item) => (
              <FoodCard key={item._id} item={item} showActions={false} />
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Top Recommendations */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-charcoal">👨‍🍳 Top Recipe Picks</h2>
            <Link to="/recipes"><CuteButton variant="outline" className="!py-1.5 !px-4 text-sm">See All</CuteButton></Link>
          </div>
          {topRecommendations?.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {topRecommendations.slice(0, 4).map((r) => (
                <RecipeCard key={r._id} recipe={r} onCook={setCookRecipe} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-charcoal/60">Add items to your pantry to get recipe suggestions!</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Mood Shortcut */}
          <div className="card bg-gradient-to-br from-accent/30 to-secondary/30 text-center">
            <div className="text-4xl mb-2">😊</div>
            <h3 className="font-bold text-charcoal mb-2">How are you feeling?</h3>
            <p className="text-sm text-charcoal/60 mb-4">Get mood-based meal suggestions</p>
            <Link to="/mood"><CuteButton variant="primary">Pick Your Mood</CuteButton></Link>
          </div>

          {/* Waste Chart */}
          {chartData.length > 0 && (
            <ChartCard title="Pantry Health" icon="📊">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Notifications */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">🔔 Latest Alerts</h3>
              <Link to="/notifications" className="text-sm text-primary font-semibold">View all</Link>
            </div>
            {latestNotifications?.length > 0 ? (
              <div className="space-y-2">
                {latestNotifications.map((n) => (
                  <div key={n._id} className={`p-2 rounded-xl text-sm ${!n.isRead ? 'bg-primary/10' : 'bg-cream'}`}>
                    <p className="font-semibold">{n.title}</p>
                    <p className="text-charcoal/60 text-xs">{n.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-charcoal/50">All caught up! 🎉</p>
            )}
          </div>
        </div>
      </div>

      <CookRecipeModal
        isOpen={!!cookRecipe}
        onClose={() => setCookRecipe(null)}
        recipe={cookRecipe}
        onConfirm={handleCook}
      />
    </div>
  );
}
