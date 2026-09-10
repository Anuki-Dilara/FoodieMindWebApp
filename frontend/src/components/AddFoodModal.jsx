import { useState, useEffect } from 'react';
import CuteButton from './CuteButton';
import { CATEGORIES, UNITS } from '../utils/helpers';

const emptyForm = {
  name: '', category: 'Other', quantity: '', unit: 'pieces',
  purchaseDate: new Date().toISOString().split('T')[0],
  expiryDate: '', storageLocation: 'Pantry', price: '', notes: '',
  packageContent: { quantity: '', unit: 'pieces' },
};

export default function AddFoodModal({ isOpen, onClose, onSave, editItem }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (editItem) {
      setForm({
        name: editItem.name,
        category: editItem.category,
        quantity: editItem.quantity,
        unit: editItem.unit,
        purchaseDate: editItem.purchaseDate?.split('T')[0] || '',
        expiryDate: editItem.expiryDate?.split('T')[0] || '',
        storageLocation: editItem.storageLocation || 'Pantry',
        price: editItem.price || '',
        notes: editItem.notes || '',
        packageContent: editItem.packageContent || { quantity: '', unit: 'pieces' },
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Food name is required';
    if (!form.quantity || Number(form.quantity) <= 0) e.quantity = 'Quantity must be greater than zero';
    if (!form.unit) e.unit = 'Unit is required';
    if (!form.expiryDate) e.expiryDate = 'Expiry date is required';
    if (form.price && Number(form.price) < 0) e.price = 'Price must be positive';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    const data = {
      ...form,
      quantity: Number(form.quantity),
      price: form.price ? Number(form.price) : 0,
    };
    
    // Only include package content if it's filled in
    if (form.unit === 'packets' && form.packageContent.quantity) {
      data.packageContent = {
        quantity: Number(form.packageContent.quantity),
        unit: form.packageContent.unit
      };
    } else {
      data.packageContent = null;
    }
    
    onSave(data);
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft max-w-lg w-full max-h-[90vh] overflow-y-auto animate-fade-in">
        <div className="p-6 border-b border-primary/10">
          <h2 className="text-xl font-bold text-charcoal">
            {editItem ? '✏️ Edit Food Item' : '🥗 Add to Pantry'}
          </h2>
          <p className="text-sm text-charcoal/60 mt-1">Keep your pantry happy and organized!</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Food Name *</label>
            <input className="input-field" value={form.name} onChange={set('name')} placeholder="e.g. Milk" />
            {errors.name && <p className="text-danger text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Category</label>
              <select className="input-field" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Storage</label>
              <input className="input-field" value={form.storageLocation} onChange={set('storageLocation')} placeholder="Pantry" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Quantity *</label>
              <input type="number" step="any" className="input-field" value={form.quantity} onChange={set('quantity')} />
              {errors.quantity && <p className="text-danger text-xs mt-1">{errors.quantity}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Unit *</label>
              <select className="input-field" value={form.unit} onChange={set('unit')}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {form.unit === 'packets' && (
            <div className="grid grid-cols-2 gap-4 bg-cream/50 p-4 rounded-lg">
              <div>
                <label className="block text-sm font-semibold mb-1">Content per Package</label>
                <input 
                  type="number" 
                  step="any" 
                  className="input-field" 
                  value={form.packageContent.quantity} 
                  onChange={(e) => setForm({ ...form, packageContent: { ...form.packageContent, quantity: e.target.value } })}
                  placeholder="e.g., 20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Content Unit</label>
                <select 
                  className="input-field" 
                  value={form.packageContent.unit} 
                  onChange={(e) => setForm({ ...form, packageContent: { ...form.packageContent, unit: e.target.value } })}
                >
                  <option value="pieces">Pieces/Slices</option>
                  <option value="g">Grams</option>
                  <option value="ml">Milliliters</option>
                </select>
              </div>
              <p className="col-span-2 text-xs text-charcoal/50">
                Enter package size to enable accurate recipe availability checking (e.g., 20 slices per bread packet)
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Purchase Date</label>
              <input type="date" className="input-field" value={form.purchaseDate} onChange={set('purchaseDate')} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Expiry Date *</label>
              <input type="date" className="input-field" value={form.expiryDate} onChange={set('expiryDate')} />
              {errors.expiryDate && <p className="text-danger text-xs mt-1">{errors.expiryDate}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Price (LKR)</label>
            <input type="number" className="input-field" value={form.price} onChange={set('price')} placeholder="Optional" />
            {errors.price && <p className="text-danger text-xs mt-1">{errors.price}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Notes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={set('notes')} placeholder="Optional notes..." />
          </div>

          <div className="flex gap-3 pt-2">
            <CuteButton type="submit" variant="primary" className="flex-1">
              {editItem ? 'Update Item' : 'Add to Pantry'}
            </CuteButton>
            <CuteButton type="button" variant="outline" onClick={onClose}>Cancel</CuteButton>
          </div>
        </form>
      </div>
    </div>
  );
}
