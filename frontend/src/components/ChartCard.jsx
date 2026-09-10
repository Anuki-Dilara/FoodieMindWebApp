export default function ChartCard({ title, icon, children }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{icon}</span>
        <h3 className="font-bold text-charcoal">{title}</h3>
      </div>
      {children}
    </div>
  );
}
