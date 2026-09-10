import { Link } from 'react-router-dom';
import { ExpiryBadge } from './StatusBadge';
import CuteButton from './CuteButton';
import { formatDate } from '../utils/helpers';

const categoryEmojis = {
  Dairy: '🥛', Fruits: '🍎', Vegetables: '🥕', Meat: '🥩', Fish: '🐟',
  Bakery: '🍞', Grains: '🌾', 'Canned food': '🥫', Snacks: '🍿',
  Drinks: '🥤', Spices: '🌶️', Other: '📦',
};

export default function FoodCard({ item, onEdit, onConsume, onDelete, showActions = true }) {
  const borderColor = item.status === 'Expired' ? 'border-danger/40 bg-danger/5'
    : item.status === 'Use Soon' ? 'border-warning/40 bg-warning/5'
    : 'border-primary/20';

  return (
    <div className={`card border-2 ${borderColor} animate-fade-in`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{categoryEmojis[item.category] || '📦'}</span>
          <div>
            <h3 className="font-bold text-charcoal">{item.name}</h3>
            <p className="text-sm text-charcoal/60">{item.category}</p>
          </div>
        </div>
        <ExpiryBadge daysLeft={item.daysLeft} status={item.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div><span className="text-charcoal/50">Qty:</span> <strong>{item.quantity} {item.unit}</strong></div>
        <div><span className="text-charcoal/50">Expires:</span> <strong>{formatDate(item.expiryDate)}</strong></div>
        {item.price > 0 && <div><span className="text-charcoal/50">Price:</span> <strong>LKR {item.price}</strong></div>}
        {item.storageLocation && <div><span className="text-charcoal/50">Storage:</span> <strong>{item.storageLocation}</strong></div>}
      </div>

      {showActions && (
        <div className="flex flex-wrap gap-2">
          <CuteButton variant="outline" className="!px-3 !py-1.5 text-sm" onClick={() => onEdit?.(item)}>Edit</CuteButton>
          <CuteButton variant="primary" className="!px-3 !py-1.5 text-sm" onClick={() => onConsume?.(item)}>Mark Consumed</CuteButton>
          {item.status !== 'Fresh' && (
            <Link to="/recipes">
              <CuteButton variant="secondary" className="!px-3 !py-1.5 text-sm">Suggest Recipe</CuteButton>
            </Link>
          )}
          <CuteButton variant="ghost" className="!px-3 !py-1.5 text-sm text-danger" onClick={() => onDelete?.(item)}>Delete</CuteButton>
        </div>
      )}
    </div>
  );
}
