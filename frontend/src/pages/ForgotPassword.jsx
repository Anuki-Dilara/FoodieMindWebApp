import { useState } from 'react';
import { Link } from 'react-router-dom';
import API from '../utils/api';
import CuteButton from '../components/CuteButton';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(null); // epoch ms

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await API.post('/auth/forgot-password', { email: trimmed });
      setSent(true);
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        const retryAfter = Number(err.response?.headers?.['retry-after']) || 900;
        setCooldownUntil(Date.now() + retryAfter * 1000);
        setError(`Too many reset requests. Please wait ${Math.ceil(retryAfter / 60)} minute(s) before trying again.`);
      } else if (status === 503) {
        setError(err.response?.data?.message || 'The reset email could not be sent right now. Please try again later.');
      } else {
        setError(err.response?.data?.message || 'Something went wrong. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 animate-float">🔑</div>
          <h1 className="text-2xl font-bold text-charcoal">Forgot your password?</h1>
          <p className="text-charcoal/60 mt-1 text-sm">
            Enter your registered email and we'll send you a secure reset link.
          </p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">📬</div>
            <p className="text-charcoal">
              If an account exists for <strong>{email.trim().toLowerCase()}</strong>, a password reset
              link is on its way. The link expires in 30 minutes.
            </p>
            <p className="text-xs text-charcoal/50">
              Didn't get it? Check your spam folder, or wait a few minutes before trying again.
            </p>
            <Link to="/login">
              <CuteButton variant="primary" className="w-full">Back to Login</CuteButton>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Email</label>
              <input
                type="email" className="input-field" required autoFocus
                value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
              />
              {error && <p className="text-danger text-xs mt-1">{error}</p>}
            </div>

            <CuteButton
              type="submit" variant="primary" className="w-full"
              disabled={loading || (cooldownUntil && Date.now() < cooldownUntil)}
            >
              {loading
                ? 'Sending reset link…'
                : cooldownUntil && Date.now() < cooldownUntil
                  ? `Try again in ${Math.ceil((cooldownUntil - Date.now()) / 60000)} min`
                  : 'Send Reset Link'}
            </CuteButton>

            <p className="text-center text-sm text-charcoal/60">
              Remembered it?{' '}
              <Link to="/login" className="text-primary font-semibold hover:underline">Back to Login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
