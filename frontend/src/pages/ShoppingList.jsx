import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { formatLKR, UNITS } from '../utils/helpers';
import ShoppingListItemCard from '../components/ShoppingListItem';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function ShoppingList() {
  const [items, setItems] = useState([]);
  const [totalEstimated, setTotalEstimated] = useState(0);
  const [budgetWarning, setBudgetWarning] = useState(false);
  const [remainingBudget, setRemainingBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showBought, setShowBought] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', quantity: 1, unit: 'pieces', estimatedPrice: '', priority: 'Medium' });
  const [boughtForm, setBoughtForm] = useState({
    quantity: 1, unit: 'pieces', purchaseDate: new Date().toISOString().split('T')[0],
    expiryDate: '', price: '', category: 'Other', storageLocation: 'Pantry',
  });

  const fetchItems = async () => {
    try {
      const res = await API.get('/shopping-list');
      setItems(res.data.items);
      setTotalEstimated(res.data.totalEstimated);
      setBudgetWarning(res.data.budgetWarning);
      setRemainingBudget(res.data.remainingBudget);
    } catch (e) {
      toast.error('Failed to load shopping list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await API.post('/shopping-list', { ...newItem, estimatedPrice: Number(newItem.estimatedPrice) || 0 });
      toast.success('Item added to shopping list!');
      setShowAdd(false);
      setNewItem({ name: '', quantity: 1, unit: 'pieces', estimatedPrice: '', priority: 'Medium' });
      fetchItems();
    } catch (e) {
      toast.error('Failed to add item');
    }
  };

  const handleDelete = async (item) => {
    try {
      await API.delete(`/shopping-list/${item._id}`);
      toast.success('Item removed');
      fetchItems();
    } catch (e) {
      toast.error('Failed to delete item');
    }
  };

  const handleUpdate = async (id, { quantity, unit }) => {
    const res = await API.put(`/shopping-list/${id}`, { quantity, unit });
    setItems((prev) => prev.map((i) => (i._id === id ? res.data.item : i)));
    toast.success('Quantity updated');
  };

  const handleMarkBought = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post(`/shopping-list/${showBought._id}/mark-bought`, {
        ...boughtForm,
        quantity: Number(boughtForm.quantity),
        price: Number(boughtForm.price) || 0,
      });
      toast.success(res.data.message);
      setShowBought(null);
      fetchItems();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to mark as bought');
    }
  };

  const pending = items.filter((i) => i.status === 'Pending');

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">🛒 Shopping List</h1>
          <p className="text-charcoal/60">Items you need to restock</p>
        </div>
        <CuteButton variant="primary" onClick={() => setShowAdd(true)}>+ Add Item</CuteButton>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-sm text-charcoal/60">Pending Items</p>
          <p className="text-2xl font-bold">{pending.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-charcoal/60">Estimated Total</p>
          <p className="text-2xl font-bold">{formatLKR(totalEstimated)}</p>
        </div>
        <div className={`card text-center ${budgetWarning ? 'border-2 border-warning' : ''}`}>
          <p className="text-sm text-charcoal/60">Remaining Budget</p>
          <p className="text-2xl font-bold">{formatLKR(remainingBudget)}</p>
          {budgetWarning && <p className="text-xs text-warning font-semibold mt-1">⚠️ Exceeds remaining budget!</p>}
        </div>
      </div>

      {loading ? <LoadingSpinner /> : pending.length === 0 ? (
        <EmptyState emoji="🛍️" title="Shopping list is empty!" message="Items will appear here when you run out of food or plan meals with missing ingredients." />
      ) : (
        <div className="space-y-3">
          {pending.map((item) => (
            <ShoppingListItemCard
              key={item._id}
              item={item}
              onDelete={handleDelete}
              onSave={handleUpdate}
              onMarkBought={(i) => {
                setShowBought(i);
                setBoughtForm({ ...boughtForm, quantity: i.quantity, unit: i.unit });
              }}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-soft max-w-md w-full p-6 animate-fade-in">
            <h2 className="text-xl font-bold mb-4">🛒 Add Item</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <input className="input-field" placeholder="Item name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" className="input-field" placeholder="Qty" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} />
                <select className="input-field" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <input type="number" className="input-field" placeholder="Estimated price (LKR)" value={newItem.estimatedPrice} onChange={(e) => setNewItem({ ...newItem, estimatedPrice: e.target.value })} />
              <div className="flex gap-3">
                <CuteButton type="submit" variant="primary" className="flex-1">Add</CuteButton>
                <CuteButton type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</CuteButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBought && (
        <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-soft max-w-md w-full p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-1">✅ Mark as Bought</h2>
            <p className="text-sm text-charcoal/60 mb-4">Add <strong>{showBought.name}</strong> to your pantry</p>
            <form onSubmit={handleMarkBought} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input type="number" className="input-field" placeholder="Quantity" value={boughtForm.quantity} onChange={(e) => setBoughtForm({ ...boughtForm, quantity: e.target.value })} required />
                <select className="input-field" value={boughtForm.unit} onChange={(e) => setBoughtForm({ ...boughtForm, unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold">Purchase Date</label>
                  <input type="date" className="input-field" value={boughtForm.purchaseDate} onChange={(e) => setBoughtForm({ ...boughtForm, purchaseDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-semibold">Expiry Date</label>
                  <input type="date" className="input-field" value={boughtForm.expiryDate} onChange={(e) => setBoughtForm({ ...boughtForm, expiryDate: e.target.value })} required />
                </div>
              </div>
              <input type="number" className="input-field" placeholder="Price (LKR)" value={boughtForm.price} onChange={(e) => setBoughtForm({ ...boughtForm, price: e.target.value })} />
              <div className="flex gap-3">
                <CuteButton type="submit" variant="primary" className="flex-1">Add to Pantry</CuteButton>
                <CuteButton type="button" variant="outline" onClick={() => setShowBought(null)}>Cancel</CuteButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
