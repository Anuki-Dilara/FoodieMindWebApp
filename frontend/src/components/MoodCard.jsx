export default function MoodCard({ mood, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(mood.id)}
      className={`card text-center cursor-pointer transition-all duration-200 hover:scale-105 ${
        selected ? 'ring-4 ring-primary scale-105 shadow-soft' : ''
      } ${mood.color}`}
    >
      <div className="text-4xl mb-2">{mood.emoji}</div>
      <p className="font-bold text-charcoal">{mood.label}</p>
    </button>
  );
}
