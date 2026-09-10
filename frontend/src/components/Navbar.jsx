import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import CuteButton from './CuteButton';

export default function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-primary/10 sticky top-0 z-30">
      <div className="flex items-center justify-between px-4 lg:px-6 h-16">
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-primary/10">
            <span className="text-xl">☰</span>
          </button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">🥗</span>
            <span className="font-bold text-charcoal hidden sm:block">FoodieMind</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <NotificationDropdown />
          <Link to="/profile" className="flex items-center gap-2 hover:bg-primary/10 rounded-xl px-3 py-1.5 transition-colors">
            <div className="w-8 h-8 bg-primary/30 rounded-full flex items-center justify-center text-sm font-bold">
              {user?.fullName?.[0]?.toUpperCase() || '?'}
            </div>
            <span className="text-sm font-semibold hidden md:block">{user?.fullName?.split(' ')[0]}</span>
          </Link>
          <CuteButton variant="ghost" className="!px-3 !py-1.5 text-sm hidden sm:block" onClick={logout}>
            Logout
          </CuteButton>
        </div>
      </div>
    </header>
  );
}
