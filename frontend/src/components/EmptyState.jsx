export default function EmptyState({ emoji = '🥗', title, message, action }) {
  return (
    <div className="text-center py-16 animate-fade-in">
      <div className="text-6xl mb-4 animate-float">{emoji}</div>
      <h3 className="text-xl font-bold text-charcoal mb-2">{title}</h3>
      <p className="text-charcoal/60 mb-6 max-w-md mx-auto">{message}</p>
      {action}
    </div>
  );
}
