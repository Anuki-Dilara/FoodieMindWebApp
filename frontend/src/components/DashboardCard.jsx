export default function DashboardCard({ icon, title, value, subtitle, color = 'bg-primary/20', onClick }) {
  return (
    <div
      className={`card cursor-${onClick ? 'pointer' : 'default'} hover:scale-[1.02] transition-transform`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-2xl flex-shrink-0`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-charcoal/60 font-medium">{title}</p>
          <p className="text-2xl font-bold text-charcoal">{value}</p>
          {subtitle && <p className="text-xs text-charcoal/50 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
