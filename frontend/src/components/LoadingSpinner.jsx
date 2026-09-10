export default function LoadingSpinner({ fullScreen = false, size = 'md' }) {
  const sizes = { sm: 'w-5 h-5', md: 'w-10 h-10', lg: 'w-16 h-16' };
  const spinner = (
    <div className={`${sizes[size]} border-4 border-primary/30 border-t-primary rounded-full animate-spin`} />
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          {spinner}
          <p className="mt-4 text-charcoal/60 font-medium">Loading your pantry...</p>
        </div>
      </div>
    );
  }
  return <div className="flex justify-center py-8">{spinner}</div>;
}
