import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import CuteButton from '../components/CuteButton';

export default function Register() {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', confirmPassword: '', phone: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const validate = () => {
    const e = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!form.email) e.email = 'Email is required';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const data = await register(form);
      toast.success(data.message || 'Welcome to FoodieMind!');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.message || 'Registration failed.';
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) {
        const e = {};
        fieldErrors.forEach((fe) => { e[fe.field] = fe.message; });
        setErrors(e);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌱</div>
          <h1 className="text-2xl font-bold text-charcoal">Join FoodieMind</h1>
          <p className="text-charcoal/60 mt-1">Start your waste-free kitchen journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Full Name *</label>
            <input className="input-field" value={form.fullName} onChange={set('fullName')} placeholder="Your name" />
            {errors.fullName && <p className="text-danger text-xs mt-1">{errors.fullName}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Email *</label>
            <input type="email" className="input-field" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            {errors.email && <p className="text-danger text-xs mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Phone (optional)</label>
            <input className="input-field" value={form.phone} onChange={set('phone')} placeholder="+94 77 123 4567" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Profile Picture (optional)</label>
            <div className="input-field flex items-center gap-2 cursor-pointer bg-cream">
              <span className="text-2xl">📷</span>
              <span className="text-charcoal/50 text-sm">Upload coming soon</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Password *</label>
            <input type="password" className="input-field" value={form.password} onChange={set('password')} />
            {errors.password && <p className="text-danger text-xs mt-1">{errors.password}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Confirm Password *</label>
            <input type="password" className="input-field" value={form.confirmPassword} onChange={set('confirmPassword')} />
            {errors.confirmPassword && <p className="text-danger text-xs mt-1">{errors.confirmPassword}</p>}
          </div>

          <CuteButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </CuteButton>
        </form>

        <p className="text-center text-sm text-charcoal/60 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-semibold hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}
