import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';
import { useAuth } from '../context/AuthContext';

export default function Admin() {
  const { logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [tab, setTab] = useState('stats');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/admin/stats'),
      API.get('/admin/users'),
      API.get('/admin/recipes'),
      API.get('/admin/notifications'),
    ])
      .then(([s, u, r, n]) => {
        setStats(s.data);
        setUsers(u.data.users);
        setRecipes(r.data.recipes);
        setNotifications(n.data.notifications.slice(0, 20));
      })
      .catch(() => toast.error('Failed to load admin data'))
      .finally(() => setLoading(false));
  }, []);

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    await API.delete(`/admin/users/${id}`);
    setUsers(users.filter((u) => u._id !== id));
    toast.success('User deleted');
  };

  const deleteRecipe = async (id) => {
    if (!confirm('Delete this recipe?')) return;
    await API.delete(`/admin/recipes/${id}`);
    setRecipes(recipes.filter((r) => r._id !== id));
    toast.success('Recipe deleted');
  };

  if (loading) return <LoadingSpinner fullScreen />;

  const tabs = [
    { id: 'stats', label: '📊 Stats' },
    { id: 'users', label: '👥 Users' },
    { id: 'recipes', label: '👨‍🍳 Recipes' },
    { id: 'notifications', label: '🔔 Notifications' },
  ];

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-primary/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚙️</span>
          <div>
            <h1 className="font-bold text-charcoal">Admin Dashboard</h1>
            <p className="text-xs text-charcoal/50">FoodieMind Management</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to="/dashboard"><CuteButton variant="outline" className="!py-1.5 !px-4 text-sm">User View</CuteButton></Link>
          <CuteButton variant="ghost" className="!py-1.5 !px-4 text-sm" onClick={logout}>Logout</CuteButton>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                tab === t.id ? 'bg-primary text-charcoal' : 'bg-white hover:bg-primary/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'stats' && stats && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Total Users', value: stats.userCount, icon: '👥' },
              { label: 'Recipes', value: stats.recipeCount, icon: '👨‍🍳' },
              { label: 'Food Items', value: stats.foodCount, icon: '🥫' },
              { label: 'Meal Plans', value: stats.mealCount, icon: '📅' },
              { label: 'Notifications', value: stats.notifCount, icon: '🔔' },
            ].map((s) => (
              <div key={s.label} className="card text-center">
                <div className="text-3xl mb-2">{s.icon}</div>
                <p className="text-sm text-charcoal/60">{s.label}</p>
                <p className="text-3xl font-bold">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-3">
            {users.map((u) => (
              <div key={u._id} className="card flex items-center justify-between">
                <div>
                  <p className="font-bold">{u.fullName}</p>
                  <p className="text-sm text-charcoal/60">{u.email} · {u.role}</p>
                </div>
                {u.role !== 'admin' && (
                  <CuteButton variant="danger" className="!py-1 !px-3 text-sm" onClick={() => deleteUser(u._id)}>Delete</CuteButton>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'recipes' && (
          <div className="space-y-3">
            {recipes.map((r) => (
              <div key={r._id} className="card flex items-center justify-between">
                <div>
                  <p className="font-bold">{r.name}</p>
                  <p className="text-sm text-charcoal/60">{r.difficulty} · {r.cookingTime} min · {r.ingredients?.length} ingredients</p>
                </div>
                <CuteButton variant="danger" className="!py-1 !px-3 text-sm" onClick={() => deleteRecipe(r._id)}>Delete</CuteButton>
              </div>
            ))}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div key={n._id} className="card">
                <p className="font-bold">{n.title}</p>
                <p className="text-sm text-charcoal/60">{n.message}</p>
                <p className="text-xs text-charcoal/40 mt-1">{new Date(n.createdAt).toLocaleString()} · {n.type}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
