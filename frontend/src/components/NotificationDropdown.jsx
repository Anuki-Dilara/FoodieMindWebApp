import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { NOTIF_ICONS } from '../utils/helpers';

export default function NotificationDropdown() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const prevUnread = useRef(null);
  const toastedPantryEmpty = useRef(false);

  const fetchNotifications = async () => {
    try {
      const res = await API.get('/notifications');
      const list = res.data.notifications || [];
      setNotifications(list.slice(0, 5));
      setUnread(res.data.unreadCount);

      // Toast once when a new unread pantry-empty alert arrives.
      const pantryAlert = list.find((n) => n.type === 'pantry_empty' && !n.isRead);
      if (pantryAlert && prevUnread.current !== null && res.data.unreadCount > prevUnread.current && !toastedPantryEmpty.current) {
        toastedPantryEmpty.current = true;
        toast(pantryAlert.title, { icon: '🧺' });
      }
      if (!pantryAlert) toastedPantryEmpty.current = false;
      prevUnread.current = res.data.unreadCount;
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id) => {
    await API.put(`/notifications/${id}/read`);
    fetchNotifications();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-primary/10 transition-colors"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-soft z-[60] border border-primary/10 animate-fade-in">
            <div className="p-4 border-b border-primary/10 flex justify-between items-center">
              <h3 className="font-bold">Notifications</h3>
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-sm text-primary font-semibold hover:underline">
                View all
              </Link>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="p-4 text-center text-charcoal/50 text-sm">All caught up! 🎉</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n._id}
                    className={`p-3 border-b border-primary/5 hover:bg-cream cursor-pointer ${!n.isRead ? 'bg-primary/5' : ''}`}
                    onClick={async () => {
                      await markRead(n._id);
                      if (n.link) { setOpen(false); navigate(n.link); }
                    }}
                  >
                    <div className="flex gap-2">
                      <span>{NOTIF_ICONS[n.type] || '🔔'}</span>
                      <div>
                        <p className="text-sm font-semibold">{n.title}</p>
                        <p className="text-xs text-charcoal/60 line-clamp-2">{n.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
