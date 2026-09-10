import { Link } from 'react-router-dom';
import CuteButton from '../components/CuteButton';

const features = [
  { icon: '🥫', title: 'Smart Food Inventory', desc: 'Track everything in your pantry with ease' },
  { icon: '⏰', title: 'Expiry Reminders', desc: 'Never let food go to waste again' },
  { icon: '🤖', title: 'AI Recipe Recommendations', desc: 'Get recipes based on what you have' },
  { icon: '😊', title: 'Mood-Based Meals', desc: 'Meals that match how you feel today' },
  { icon: '📅', title: 'Meal Planner', desc: 'Plan your week with smart suggestions' },
  { icon: '🛒', title: 'Shopping List', desc: 'Auto-generated lists when you run out' },
  { icon: '💰', title: 'Budget Tracker', desc: 'Track spending in Sri Lankan Rupees' },
  { icon: '📊', title: 'Waste Analytics', desc: 'See how much you save from waste' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream">
      {/* Hero */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🥗</span>
          <span className="text-xl font-bold text-charcoal">FoodieMind</span>
        </div>
        <div className="flex gap-3">
          <Link to="/login"><CuteButton variant="outline">Login</CuteButton></Link>
          <Link to="/register"><CuteButton variant="primary">Get Started</CuteButton></Link>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <div className="animate-float inline-block text-8xl mb-6">🍳</div>
        <h1 className="text-4xl md:text-6xl font-extrabold text-charcoal mb-4 leading-tight">
          Cook smarter,<br />
          <span className="text-primary">waste less</span>, feel better.
        </h1>
        <p className="text-lg text-charcoal/70 max-w-2xl mx-auto mb-8">
          FoodieMind is your cozy AI kitchen assistant. Track food expiry, manage inventory,
          get personalized recipe recommendations, plan meals, and save money — all in one cute app.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link to="/register"><CuteButton variant="primary" className="text-lg px-8 py-3">Get Started Free 🌱</CuteButton></Link>
          <Link to="/login"><CuteButton variant="secondary" className="text-lg px-8 py-3">Login</CuteButton></Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center text-charcoal mb-2">Everything your pantry needs</h2>
        <p className="text-center text-charcoal/60 mb-12">A complete kitchen companion in pastel perfection</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card text-center hover:scale-105 transition-transform">
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-charcoal mb-2">{f.title}</h3>
              <p className="text-sm text-charcoal/60">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <div className="card bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20">
          <div className="text-5xl mb-4">🌿</div>
          <h2 className="text-2xl font-bold text-charcoal mb-3">Ready to transform your kitchen?</h2>
          <p className="text-charcoal/70 mb-6">Join FoodieMind and start reducing food waste today!</p>
          <Link to="/register"><CuteButton variant="primary" className="text-lg px-8">Start Your Pantry Journey</CuteButton></Link>
        </div>
      </section>

      <footer className="text-center py-8 text-charcoal/40 text-sm">
        <p>🥗 FoodieMind · MoodMeal Pantry · Made with love for Sri Lankan kitchens</p>
      </footer>
    </div>
  );
}
