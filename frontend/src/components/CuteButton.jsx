export default function CuteButton({
  children, variant = 'primary', className = '', disabled, ...props
}) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    danger: 'bg-danger hover:bg-danger/90 text-white font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95',
    ghost: 'text-charcoal hover:bg-primary/10 font-semibold px-4 py-2 rounded-xl transition-all',
  };

  return (
    <button
      className={`${variants[variant]} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
