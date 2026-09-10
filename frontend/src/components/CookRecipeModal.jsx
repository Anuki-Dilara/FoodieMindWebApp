import { useState } from 'react';
import CuteButton from './CuteButton';

export default function CookRecipeModal({ isOpen, onClose, recipe, onConfirm }) {
  const [loading, setLoading] = useState(false);

  if (!isOpen || !recipe) return null;

  const handleCook = async () => {
    setLoading(true);
    try {
      await onConfirm(recipe);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft max-w-md w-full animate-fade-in p-6">
        <h2 className="text-xl font-bold text-charcoal mb-1">👨‍🍳 Cook {recipe.name}?</h2>
        <p className="text-sm text-charcoal/60 mb-4">This will deduct ingredients from your pantry.</p>

        <div className="bg-cream rounded-xl p-4 mb-4 max-h-48 overflow-y-auto">
          <p className="text-sm font-semibold mb-2">Required ingredients:</p>
          {recipe.ingredients?.map((ing, i) => (
            <div key={i} className="flex justify-between text-sm py-1 border-b border-primary/10 last:border-0">
              <span>{ing.name}</span>
              <span className="text-charcoal/60">{ing.quantity} {ing.unit}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-charcoal/50 mb-4">
          Items that run out will be automatically added to your shopping list.
        </p>

        <div className="flex gap-3">
          <CuteButton variant="primary" className="flex-1" onClick={handleCook} disabled={loading}>
            {loading ? 'Cooking...' : '🎉 Cook this!'}
          </CuteButton>
          <CuteButton variant="outline" onClick={onClose}>Cancel</CuteButton>
        </div>
      </div>
    </div>
  );
}
