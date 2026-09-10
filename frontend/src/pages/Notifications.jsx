import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { NOTIF_ICONS } from '../utils/helpers';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await API.get('/notifications');
      setNotifications(res.data.notifications);
    } catch (e) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const markRead = async (id) => {
    await API.put(`/notifications/${id}/read`);
    fetchNotifications();
  };

  const markAllRead = async () => {
    await API.put('/notifications/read-all');
    toast.success('All notifications marked as read');
    fetchNotifications();
  };

  const deleteNotif = async (id) => {
    await API.delete(`/notifications/${id}`);
    fetchNotifications();
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">🔔 Notifications</h1>
          <p className="text-charcoal/60">Stay updated on your pantry</p>
        </div>
        {notifications.some((n) => !n.isRead) && (
          <CuteButton variant="outline" className="!py-1.5 !px-4 text-sm" onClick={markAllRead}>
            Mark all read
          </CuteButton>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState emoji="🎉" title="All caught up!" message="You have no notifications right now. Your pantry is happy!" />
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`card flex items-start gap-4 cursor-pointer transition-all ${
                !n.isRead ? 'border-2 border-primary/30 bg-primary/5' : ''
              }`}
              onClick={() => !n.isRead && markRead(n._id)}
            >
              <span className="text-2xl flex-shrink-0">{NOTIF_ICONS[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-charcoal">{n.title}</h3>
                  {!n.isRead && <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />}
                </div>
                <p className="text-sm text-charcoal/70 mt-1">{n.message}</p>
                <p className="text-xs text-charcoal/40 mt-2">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteNotif(n._id); }}
                className="text-charcoal/30 hover:text-danger transition-colors flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
