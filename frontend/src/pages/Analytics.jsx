import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { formatLKR } from '../utils/helpers';
import ChartCard from '../components/ChartCard';
import LoadingSpinner from '../components/LoadingSpinner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const COLORS = ['#8DD9C4', '#FFBFA3', '#FFE082', '#7EC8E3', '#6BCB77', '#FF9F43', '#FF6B6B'];

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [waste, setWaste] = useState(null);
  const [consumption, setConsumption] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/analytics/summary'),
      API.get('/analytics/waste'),
      API.get('/analytics/consumption'),
    ])
      .then(([s, w, c]) => {
        setSummary(s.data);
        setWaste(w.data);
        setConsumption(c.data);
      })
      .catch(() => toast.error('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner fullScreen />;
  if (!summary) return null;

  const categoryData = Object.entries(summary.categoryBreakdown || {}).map(([name, value]) => ({ name, value }));
  const wasteData = Object.entries(waste?.wasteByCategory || {}).map(([name, value]) => ({ name, value: Math.round(value) }));
  const consumptionData = Object.entries(consumption?.byMonth || {}).map(([name, value]) => ({ name, count: value }));

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-charcoal mb-2">📊 Analytics & Reports</h1>
        <p className="text-charcoal/60">Insights into your food habits and savings</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: '🥫', label: 'Total Items', value: summary.totalInventory },
          { icon: '⏰', label: 'Expiring Soon', value: summary.expiringSoon },
          { icon: '🚫', label: 'Expired', value: summary.expired },
          { icon: '🗑️', label: 'Waste Value', value: formatLKR(waste?.totalWasteValue || 0) },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl mb-1">{s.icon}</div>
            <p className="text-sm text-charcoal/60">{s.label}</p>
            <p className="text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {categoryData.length > 0 && (
          <ChartCard title="Inventory by Category" icon="🥗">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {summary.mostConsumed?.length > 0 && (
          <ChartCard title="Most Consumed Foods" icon="🍽️">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={summary.mostConsumed}>
                <CartesianGrid strokeDasharray="3 3" stroke="#8DD9C420" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#8DD9C4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {wasteData.length > 0 && (
          <ChartCard title="Waste by Category" icon="🗑️">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={wasteData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B20" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip formatter={(v) => formatLKR(v)} />
                <Bar dataKey="value" fill="#FF6B6B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {consumptionData.length > 0 && (
          <ChartCard title="Consumption Trends" icon="📈">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={consumptionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#7EC8E320" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#7EC8E3" strokeWidth={3} dot={{ fill: '#7EC8E3' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <ChartCard title="Budget Overview" icon="💰">
          <div className="space-y-3">
            {[
              { label: 'Monthly Budget', value: formatLKR(summary.budget?.monthlyBudget || 0) },
              { label: 'Total Spent', value: formatLKR(summary.budget?.totalSpent || 0) },
              { label: 'Remaining', value: formatLKR(summary.budget?.remainingBudget || 0) },
              { label: 'Wasted', value: formatLKR(summary.budget?.wastedFoodCost || 0) },
            ].map((b) => (
              <div key={b.label} className="flex justify-between p-3 bg-cream rounded-xl">
                <span className="text-charcoal/70">{b.label}</span>
                <span className="font-bold">{b.value}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {summary.cookedRecipes?.length > 0 && (
          <ChartCard title="Recent Recipes Cooked" icon="👨‍🍳">
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {summary.cookedRecipes.map((r) => (
                <div key={r._id} className="flex justify-between p-2 bg-cream rounded-xl text-sm">
                  <span className="font-semibold">{r.recipeName}</span>
                  <span className="text-charcoal/50">{new Date(r.cookedDate).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
