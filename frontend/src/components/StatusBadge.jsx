import { getStatusBadgeClass } from '../utils/helpers';

export default function StatusBadge({ status }) {
  return <span className={getStatusBadgeClass(status)}>{status}</span>;
}

export function ExpiryBadge({ daysLeft, status }) {
  if (status === 'Expired') {
    return <span className="badge-expired">Expired {Math.abs(daysLeft)}d ago</span>;
  }
  if (status === 'Use Soon') {
    return <span className="badge-soon">{daysLeft === 0 ? 'Expires today!' : `${daysLeft}d left`}</span>;
  }
  return <span className="badge-fresh">{daysLeft}d left</span>;
}
