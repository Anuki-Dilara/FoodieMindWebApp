import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import CuteButton from '../components/CuteButton';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      toast.success(data.message || 'Welcome back!');
      navigate(data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="card max-w-md w-full animate-fade-in">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 animate-float">🥗</div>
          <h1 className="text-2xl font-bold text-charcoal">Welcome back!</h1>
          <p className="text-charcoal/60 mt-1">Your pantry missed you</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Email</label>
            <input
              type="email" className="input-field" required
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Password</label>
            <input
              type="password" className="input-field" required
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </div>

          <p className="text-sm text-charcoal/50 text-right">
            <span className="cursor-pointer hover:text-primary">Forgot password? (Coming soon)</span>
          </p>

          <CuteButton type="submit" variant="primary" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </CuteButton>
        </form>

        <p className="text-center text-sm text-charcoal/60 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-semibold hover:underline">Register</Link>
        </p>

        <div className="mt-4 p-3 bg-primary/10 rounded-xl text-xs text-charcoal/60 text-center">
          Demo: demo@moodmeal.com / Demo123!
        </div>
      </div>
    </div>
  );
}
