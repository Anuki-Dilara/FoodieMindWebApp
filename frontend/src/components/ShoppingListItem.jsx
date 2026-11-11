import { useState } from 'react';
import { formatLKR, UNITS } from '../utils/helpers';
import CuteButton from './CuteButton';
import API from '../utils/api';

export default function ShoppingListItemCard({ item, onDelete, onMarkBought, onSave }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit);
  const [unitOptions, setUnitOptions] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const priorityColors = { High: 'border-danger/30', Medium: 'border-warning/30', Low: 'border-primary/20' };

  const startEdit = async () => {
    setEditing(true);
    setQty(item.quantity);
    setUnit(item.unit);
    setError('');
    // Ingredient-appropriate units from the conversion profile (fallback: all).
    if (!unitOptions) {
      try {
        const { data } = await API.get('/inventory/units/for-ingredient', { params: { name: item.name } });
        if (data?.hasProfile && Array.isArray(data.units) && data.units.length) {
          const units = data.units.includes(item.unit) ? data.units : [item.unit, ...data.units];
          setUnitOptions([...new Set(units)]);
        }
      } catch { /* keep default UNITS */ }
      if (!unitOptions) setUnitOptions(UNITS);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const saveEdit = async () => {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    if (quantity === item.quantity && unit === item.unit) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(item._id, { quantity, unit });
      setEditing(false);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`card border-2 ${priorityColors[item.priority] || 'border-primary/20'} ${item.status === 'Bought' ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl">{item.status === 'Bought' ? '✅' : '🛒'}</span>
          <div className="min-w-0">
            <h3 className={`font-bold ${item.status === 'Bought' ? 'line-through' : ''}`}>{item.name}</h3>
            {!editing && (
              <p className="text-sm text-charcoal/60">
                {item.quantity} {item.unit}
                {item.estimatedPrice > 0 && ` · ${formatLKR(item.estimatedPrice)}`}
              </p>
            )}
            <span className="text-xs bg-primary/10 px-2 py-0.5 rounded-full">{item.source}</span>
          </div>
        </div>
        {item.status === 'Pending' && !editing && (
          <div className="flex gap-2 shrink-0">
            <CuteButton variant="outline" className="!px-3 !py-1.5 text-sm" onClick={startEdit}>Edit</CuteButton>
            <CuteButton variant="primary" className="!px-3 !py-1.5 text-sm" onClick={() => onMarkBought?.(item)}>Bought</CuteButton>
            <CuteButton variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => onDelete?.(item)}>✕</CuteButton>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-primary/10">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                className="input-field !py-1.5 w-28"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 mb-1">Unit</label>
              <select
                className="input-field !py-1.5 w-32"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={saving}
              >
                {(unitOptions || UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <CuteButton variant="primary" className="!px-4 !py-1.5 text-sm" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </CuteButton>
            <CuteButton variant="outline" className="!px-4 !py-1.5 text-sm" onClick={cancelEdit} disabled={saving}>
              Cancel
            </CuteButton>
          </div>
          {error && <p className="text-danger text-xs mt-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
