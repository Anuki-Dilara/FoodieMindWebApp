import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: '🏠', label: 'Dashboard', section: 'workspace' },
  { to: '/inventory', icon: '🥫', label: 'Inventory', section: 'workspace' },
  { to: '/recipes', icon: '👨‍🍳', label: 'Recipes', section: 'workspace' },
  { to: '/mood', icon: '😊', label: 'Mood Meals', section: 'workspace' },
  { to: '/meal-planner', icon: '📅', label: 'Meal Planner', section: 'workspace' },
  { to: '/shopping-list', icon: '🛒', label: 'Shopping List', section: 'workspace' },
  { to: '/budget', icon: '💰', label: 'Budget', section: 'insights' },
  { to: '/analytics', icon: '📊', label: 'Analytics', section: 'insights' },
  { to: '/notifications', icon: '🔔', label: 'Notifications', section: 'account' },
  { to: '/profile', icon: '👤', label: 'Profile', section: 'account' },
];

const sectionLabels = {
  workspace: 'Workspace',
  insights: 'Insights',
  account: 'Account',
};

export default function Sidebar({ isOpen, onClose }) {
  const { isAdmin } = useAuth();

  const groupedItems = navItems.reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-charcoal/30 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-primary/10 shadow-soft flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        style={{ height: '100dvh' }}
      >
        {/* Logo section */}
        <div className="p-6 border-b border-primary/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/30 rounded-2xl flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🥗</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-charcoal text-lg">FoodieMind</h1>
              <p className="text-xs text-charcoal/50 truncate">MoodMeal Pantry</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 custom-scrollbar">
          {Object.entries(groupedItems).map(([section, items]) => (
            <div key={section} className="mb-6 last:mb-0">
              <h3 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wider mb-2 px-3">
                {sectionLabels[section]}
              </h3>
              <div className="space-y-1">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 ${
                        isActive
                          ? 'bg-primary/30 text-charcoal'
                          : 'text-charcoal/70 hover:bg-primary/10'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}

          {/* Admin link */}
          {isAdmin && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wider mb-2 px-3">
                Account
              </h3>
              <NavLink
                to="/admin"
                onClick={onClose}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-secondary/50 focus:ring-offset-2 ${
                    isActive
                      ? 'bg-secondary/40 text-charcoal'
                      : 'text-charcoal/70 hover:bg-secondary/20'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="text-xl flex-shrink-0">⚙️</span>
                    <span>Admin</span>
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-secondary rounded-r-full" />
                    )}
                  </>
                )}
              </NavLink>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-primary/10 flex-shrink-0">
          <p className="text-xs text-charcoal/40 text-center">Cook smarter, waste less 🌱</p>
        </div>
      </aside>
    </>
  );
}
