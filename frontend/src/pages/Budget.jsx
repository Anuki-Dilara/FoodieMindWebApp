import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import { formatLKR } from '../utils/helpers';
import ProgressBar from '../components/ProgressBar';
import LoadingSpinner from '../components/LoadingSpinner';
import CuteButton from '../components/CuteButton';

export default function Budget() {
  const [summary, setSummary] = useState(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchBudget = async () => {
    try {
      const res = await API.get('/budget/summary');
      setSummary(res.data);
      setBudgetInput(res.data.monthlyBudget);
    } catch (e) {
      toast.error('Failed to load budget');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBudget(); }, []);

  const handleSaveBudget = async () => {
    setSaving(true);
    try {
      await API.post('/budget', { monthlyBudget: Number(budgetInput) });
      toast.success('Monthly budget updated!');
      fetchBudget();
    } catch (e) {
      toast.error('Failed to update budget');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!summary) return null;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-charcoal mb-2">💰 Budget Tracker</h1>
      <p className="text-charcoal/60 mb-8">Track your grocery spending in Sri Lankan Rupees</p>

      <div className="card mb-6">
        <h2 className="font-bold mb-4">Set Monthly Budget</h2>
        <div className="flex gap-3">
          <input
            type="number" className="input-field flex-1"
            value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)}
            placeholder="Monthly budget in LKR"
          />
          <CuteButton variant="primary" onClick={handleSaveBudget} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </CuteButton>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold">Budget Usage</h2>
          {summary.budgetWarning && (
            <span className="text-warning font-semibold text-sm">⚠️ Budget almost reached!</span>
          )}
        </div>
        <ProgressBar value={summary.totalSpent} max={summary.monthlyBudget} warningAt={80} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { icon: '💰', label: 'Monthly Budget', value: formatLKR(summary.monthlyBudget), color: 'bg-accent/30' },
          { icon: '💸', label: 'Total Spent', value: formatLKR(summary.totalSpent), color: 'bg-secondary/30' },
          { icon: '💵', label: 'Remaining', value: formatLKR(summary.remainingBudget), color: 'bg-success/20' },
          { icon: '🛍️', label: 'Shopping List Est.', value: formatLKR(summary.shoppingListEstimate), color: 'bg-info/20' },
          { icon: '🗑️', label: 'Wasted Food Value', value: formatLKR(summary.wastedFoodCost), color: 'bg-danger/10' },
          { icon: '📊', label: 'Usage', value: `${summary.usagePercent}%`, color: 'bg-primary/20' },
        ].map((item) => (
          <div key={item.label} className={`card ${item.color}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-sm text-charcoal/60">{item.label}</p>
                <p className="text-xl font-bold">{item.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {summary.budgetWarning && (
        <div className="card mt-6 border-2 border-warning bg-warning/10 text-center">
          <div className="text-3xl mb-2">⚠️</div>
          <p className="font-semibold text-charcoal">You're close to your monthly budget limit!</p>
          <p className="text-sm text-charcoal/60 mt-1">Consider reviewing your shopping list to stay on track.</p>
        </div>
      )}
    </div>
  );
}
