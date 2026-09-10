import { useState } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ALLERGIES, DIETARY_PREFS, SKILL_LEVELS } from '../utils/helpers';
import CuteButton from '../components/CuteButton';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    allergies: user?.allergies || [],
    dietaryPreferences: user?.dietaryPreferences || [],
    cookingSkillLevel: user?.cookingSkillLevel || 'Beginner',
  });
  const [loading, setLoading] = useState(false);

  const toggleArray = (field, value) => {
    const arr = form[field];
    setForm({
      ...form,
      [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await API.put('/users/profile', form);
      updateUser(res.data.user);
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-charcoal mb-2">👤 Your Profile</h1>
      <p className="text-charcoal/60 mb-6">Help us recommend the perfect meals for you</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <h2 className="font-bold mb-4">Basic Info</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Full Name</label>
              <input className="input-field" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Email</label>
              <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Phone</label>
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Profile Picture</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-primary/30 rounded-full flex items-center justify-center text-2xl font-bold">
                  {form.fullName?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm text-charcoal/50">Upload coming soon</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="font-bold mb-4">🚫 Allergies</h2>
          <div className="flex flex-wrap gap-2">
            {ALLERGIES.map((a) => (
              <button
                key={a} type="button"
                onClick={() => toggleArray('allergies', a)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  form.allergies.includes(a) ? 'bg-danger/20 text-danger ring-2 ring-danger/30' : 'bg-cream hover:bg-primary/10'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-bold mb-4">🥗 Dietary Preferences</h2>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFS.map((d) => (
              <button
                key={d} type="button"
                onClick={() => toggleArray('dietaryPreferences', d)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  form.dietaryPreferences.includes(d) ? 'bg-primary/30 ring-2 ring-primary/40' : 'bg-cream hover:bg-primary/10'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-bold mb-4">👨‍🍳 Cooking Skill Level</h2>
          <div className="flex gap-3">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s} type="button"
                onClick={() => setForm({ ...form, cookingSkillLevel: s })}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  form.cookingSkillLevel === s ? 'bg-accent ring-2 ring-accent/50' : 'bg-cream hover:bg-primary/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <CuteButton type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile'}
        </CuteButton>
      </form>
    </div>
  );
}
