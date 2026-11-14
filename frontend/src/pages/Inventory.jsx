import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { CATEGORIES, isLowStock, formatLKR } from '../utils/helpers';
import FoodCard from '../components/FoodCard';
import AddFoodModal from '../components/AddFoodModal';
import ConsumeFoodModal from '../components/ConsumeFoodModal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ total: 0, expiringSoon: 0, expired: 0, lowStock: 0, value: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [consumeItem, setConsumeItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const fetchItems = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (category) params.category = category;
      if (statusFilter) params.status = statusFilter;
      const res = await API.get('/inventory', { params });
      setItems(res.data.items);
    } catch (e) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await API.get('/inventory');
      const all = res.data.items || [];
      setStats({
        total: all.length,
        expiringSoon: all.filter((i) => i.status === 'Use Soon').length,
        expired: all.filter((i) => i.status === 'Expired').length,
        lowStock: all.filter((i) => isLowStock(i)).length,
        value: all.reduce((sum, i) => sum + (Number(i.price) || 0), 0),
      });
    } catch (e) { /* stats are non-critical */ }
  };

  useEffect(() => { fetchItems(); }, [search, category, statusFilter]);
  useEffect(() => { fetchStats(); }, [search, category, statusFilter]);

  const handleSave = async (data) => {
    try {
      if (editItem) {
        const res = await API.put(`/inventory/${editItem._id}`, data);
        toast.success(res.data?.message || 'Food item updated!');
      } else {
        const res = await API.post('/inventory', data);
        toast.success(res.data?.message || 'Food item added to your pantry!');
      }
      setShowAdd(false);
      setEditItem(null);
      fetchItems();
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save item');
    }
  };

  const handleConsume = async (data) => {
    try {
      const res = await API.post(`/inventory/${consumeItem._id}/consume`, data);
      toast.success(res.data.message);
      fetchItems();
      fetchStats();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to consume item');
    }
  };

  const handleDelete = async () => {
    try {
      await API.delete(`/inventory/${deleteItem._id}`);
      toast.success('Item removed from pantry');
      setDeleteItem(null);
      fetchItems();
      fetchStats();
    } catch (e) {
      toast.error('Failed to delete item');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">🥫 My Pantry</h1>
          <p className="text-charcoal/60">Manage your food inventory</p>
        </div>
        <CuteButton variant="primary" onClick={() => { setEditItem(null); setShowAdd(true); }}>
          + Add Food
        </CuteButton>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="card !p-4 text-center">
          <p className="text-2xl font-bold text-primary">{stats.total}</p>
          <p className="text-xs text-charcoal/60">Total items</p>
        </div>
        <div className="card !p-4 text-center">
          <p className="text-2xl font-bold text-warning">{stats.expiringSoon}</p>
          <p className="text-xs text-charcoal/60">Expiring soon</p>
        </div>
        <div className="card !p-4 text-center">
          <p className="text-2xl font-bold text-danger">{stats.expired}</p>
          <p className="text-xs text-charcoal/60">Expired</p>
        </div>
        <div className="card !p-4 text-center">
          <p className="text-2xl font-bold text-charcoal">{stats.lowStock}</p>
          <p className="text-xs text-charcoal/60">Low stock</p>
        </div>
        <div className="card !p-4 text-center col-span-2 md:col-span-1">
          <p className="text-2xl font-bold text-charcoal">{formatLKR(stats.value)}</p>
          <p className="text-xs text-charcoal/60">Pantry value</p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid md:grid-cols-3 gap-4">
          <input
            className="input-field" placeholder="🔍 Search food..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option>Fresh</option>
            <option>Use Soon</option>
            <option>Expired</option>
          </select>
        </div>
      </div>

      {loading ? <LoadingSpinner /> : items.length === 0 ? (
        <EmptyState
          emoji="🥗"
          title="Your pantry is empty"
          message="Add ingredients to your pantry to get personalized recipe recommendations."
          action={<CuteButton variant="primary" onClick={() => setShowAdd(true)}>Add Your First Item</CuteButton>}
        />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <FoodCard
              key={item._id}
              item={item}
              onEdit={(i) => { setEditItem(i); setShowAdd(true); }}
              onConsume={setConsumeItem}
              onDelete={setDeleteItem}
            />
          ))}
        </div>
      )}

      <AddFoodModal isOpen={showAdd} onClose={() => { setShowAdd(false); setEditItem(null); }} onSave={handleSave} editItem={editItem} />
      <ConsumeFoodModal isOpen={!!consumeItem} onClose={() => setConsumeItem(null)} item={consumeItem} onConfirm={handleConsume} />
      <ConfirmDialog
        isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete}
        title="Remove from pantry?" message={`Are you sure you want to remove ${deleteItem?.name}?`}
      />
    </div>
  );
}
