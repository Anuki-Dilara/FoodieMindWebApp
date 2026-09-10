import { useState } from 'react';
import CuteButton from './CuteButton';
import { UNITS } from '../utils/helpers';

export default function ConsumeFoodModal({ isOpen, onClose, item, onConfirm }) {
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState(item?.unit || 'pieces');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !item) return null;

  const handleConfirm = async () => {
    if (!quantity || Number(quantity) <= 0) return;
    setLoading(true);
    try {
      await onConfirm({ consumedQuantity: Number(quantity), consumedUnit: unit });
      setQuantity('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft max-w-md w-full animate-fade-in p-6">
        <h2 className="text-xl font-bold text-charcoal mb-1">🍽️ Mark as Consumed</h2>
        <p className="text-sm text-charcoal/60 mb-4">How much of <strong>{item.name}</strong> did you use?</p>

        <div className="bg-primary/10 rounded-xl p-4 mb-4">
          <p className="text-sm text-charcoal/60">Current quantity</p>
          <p className="text-lg font-bold">{item.quantity} {item.unit}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold mb-1">Consumed Quantity</label>
            <input
              type="number" step="any" className="input-field"
              value={quantity} onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Unit</label>
            <select className="input-field" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <CuteButton variant="primary" className="flex-1" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Updating...' : 'Confirm'}
          </CuteButton>
          <CuteButton variant="outline" onClick={onClose}>Cancel</CuteButton>
        </div>
      </div>
    </div>
  );
}
