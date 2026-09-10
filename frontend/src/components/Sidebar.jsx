import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { to: '/inventory', icon: '🥫', label: 'Inventory' },
  { to: '/recipes', icon: '👨‍🍳', label: 'Recipes' },
  { to: '/mood', icon: '😊', label: 'Mood Meals' },
  { to: '/meal-planner', icon: '📅', label: 'Meal Planner' },
  { to: '/shopping-list', icon: '🛒', label: 'Shopping List' },
  { to: '/budget', icon: '💰', label: 'Budget' },
  { to: '/analytics', icon: '📊', label: 'Analytics' },
  { to: '/notifications', icon: '🔔', label: 'Notifications' },
  { to: '/profile', icon: '👤', label: 'Profile' },
];

export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth();

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-charcoal/30 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-primary/10 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="p-6 border-b border-primary/10">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🥗</span>
            <div>
              <h1 className="font-bold text-charcoal">FoodieMind</h1>
              <p className="text-xs text-charcoal/50">MoodMeal Pantry</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all ${
                  isActive ? 'bg-primary/30 text-charcoal shadow-sm' : 'text-charcoal/70 hover:bg-primary/10'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all ${
                  isActive ? 'bg-secondary/40 text-charcoal' : 'text-charcoal/70 hover:bg-secondary/20'
                }`
              }
            >
              <span>⚙️</span>
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-primary/10">
          <p className="text-xs text-charcoal/40 text-center">Cook smarter, waste less 🌱</p>
        </div>
      </aside>
    </>
  );
}
