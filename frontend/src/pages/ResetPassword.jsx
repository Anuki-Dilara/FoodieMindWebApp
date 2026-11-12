import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import API from '../utils/api';
import CuteButton from '../components/CuteButton';

function strength(pw) {
  if (!pw) return { label: '', color: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: 'Weak', color: 'bg-danger' };
  if (score <= 3) return { label: 'Fair', color: 'bg-warning' };
  return { label: 'Strong', color: 'bg-primary' };
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [status, setStatus] = useState('validating'); // validating | ready | invalid | done
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await API.get('/auth/verify-reset-token', { params: { token } });
        if (!cancelled) setStatus(data.valid ? 'ready' : 'invalid');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const validate = () => {
    const e = {};
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate() || loading) return;
    setLoading(true);
    try {
      await API.post('/auth/reset-password', { token, password: form.password, confirmPassword: form.confirmPassword });
      setStatus('done');
    } catch (err) {
      const msg = err.response?.data?.message || 'Reset failed. Please try again.';
      if (/invalid or has expired/i.test(msg)) setStatus('invalid');
      else setErrors({ form: msg });
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = strength(form.password);

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 animate-float">🔐</div>
          <h1 className="text-2xl font-bold text-charcoal">Reset your password</h1>
          <p className="text-charcoal/60 mt-1 text-sm">Choose a strong new password for your account.</p>
        </div>

        {status === 'validating' && (
          <p className="text-center text-charcoal/60 py-6">Checking your reset link…</p>
        )}

        {status === 'invalid' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">😕</div>
            <p className="text-charcoal">
              This password reset link is invalid or has expired.
            </p>
            <Link to="/forgot-password">
              <CuteButton variant="primary" className="w-full">Request a New Link</CuteButton>
            </Link>
            <Link to="/login" className="block text-sm text-primary font-semibold hover:underline">
              Back to Login
            </Link>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <p className="text-charcoal font-semibold">Your password has been reset successfully!</p>
            <Link to="/login">
              <CuteButton variant="primary" className="w-full">Go to Login</CuteButton>
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} className="input-field pr-16" required
                  value={form.password} onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors({}); }}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-charcoal/50 hover:text-charcoal"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {form.password && (
                <div className="mt-2">
                  <div className="h-1.5 bg-charcoal/10 rounded-full overflow-hidden">
                    <div className={`h-full ${pwStrength.color} transition-all`} style={{ width: `${Math.min(pwStrength.label === 'Weak' ? 33 : pwStrength.label === 'Fair' ? 66 : 100, 100)}%` }} />
                  </div>
                  <p className="text-xs text-charcoal/50 mt-1">Strength: {pwStrength.label}</p>
                </div>
              )}
              {errors.password && <p className="text-danger text-xs mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">Confirm New Password</label>
              <input
                type={showPw ? 'text' : 'password'} className="input-field" required
                value={form.confirmPassword} onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); setErrors({}); }}
                placeholder="Repeat your new password"
              />
              {errors.confirmPassword && <p className="text-danger text-xs mt-1">{errors.confirmPassword}</p>}
            </div>

            {errors.form && <p className="text-danger text-xs">{errors.form}</p>}

            <CuteButton type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </CuteButton>

            <p className="text-center text-sm text-charcoal/60">
              <Link to="/login" className="text-primary font-semibold hover:underline">Back to Login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
