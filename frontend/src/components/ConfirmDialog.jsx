import CuteButton from './CuteButton';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', variant = 'danger' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-soft max-w-sm w-full animate-fade-in p-6 text-center">
        <div className="text-4xl mb-3">🤔</div>
        <h2 className="text-lg font-bold text-charcoal mb-2">{title}</h2>
        <p className="text-sm text-charcoal/60 mb-6">{message}</p>
        <div className="flex gap-3">
          <CuteButton variant={variant} className="flex-1" onClick={onConfirm}>{confirmText}</CuteButton>
          <CuteButton variant="outline" className="flex-1" onClick={onClose}>Cancel</CuteButton>
        </div>
      </div>
    </div>
  );
}
