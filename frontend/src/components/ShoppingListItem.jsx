import { formatLKR } from '../utils/helpers';
import CuteButton from './CuteButton';

export default function ShoppingListItemCard({ item, onEdit, onDelete, onMarkBought }) {
  const priorityColors = { High: 'border-danger/30', Medium: 'border-warning/30', Low: 'border-primary/20' };

  return (
    <div className={`card border-2 ${priorityColors[item.priority] || 'border-primary/20'} ${item.status === 'Bought' ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{item.status === 'Bought' ? '✅' : '🛒'}</span>
          <div>
            <h3 className={`font-bold ${item.status === 'Bought' ? 'line-through' : ''}`}>{item.name}</h3>
            <p className="text-sm text-charcoal/60">
              {item.quantity} {item.unit}
              {item.estimatedPrice > 0 && ` · ${formatLKR(item.estimatedPrice)}`}
            </p>
            <span className="text-xs bg-primary/10 px-2 py-0.5 rounded-full">{item.source}</span>
          </div>
        </div>
        {item.status === 'Pending' && (
          <div className="flex gap-2">
            <CuteButton variant="primary" className="!px-3 !py-1.5 text-sm" onClick={() => onMarkBought?.(item)}>Bought</CuteButton>
            <CuteButton variant="ghost" className="!px-3 !py-1.5 text-sm" onClick={() => onDelete?.(item)}>✕</CuteButton>
          </div>
        )}
      </div>
    </div>
  );
}
