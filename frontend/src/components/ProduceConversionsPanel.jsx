import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import API from '../utils/api';
import CuteButton from './CuteButton';

const SIZE_KEYS = ['xs', 's', 'm', 'l', 'xl', 'd'];
const COUNT_UNIT_LABELS = {
  piece: 'Piece', whole: 'Whole', head: 'Head', bulb: 'Bulb', clove: 'Clove',
  bunch: 'Bunch', stalk: 'Stalk', ear: 'Ear', cob: 'Cob', wedge: 'Wedge',
  slice: 'Slice', segment: 'Segment', pod: 'Pod', sprig: 'Sprig', loaf: 'Loaf', cube: 'Cube',
};

function countUnitSummary(countUnits = {}) {
  return Object.entries(countUnits)
    .map(([u, def]) => {
      const g = typeof def === 'number' ? def : (def.m ?? def.d ?? '—');
      return `${COUNT_UNIT_LABELS[u] || u}: ~${g}g`;
    })
    .join(' · ');
}

export default function ProduceConversionsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState({ qty: 2, from: 'pieces', to: 'g', size: '', form: '' });
  const [previewResult, setPreviewResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/produce-conversions', { params: { q: q || undefined, category: category || undefined } });
      setItems(data.conversions || []);
    } catch {
      toast.error('Failed to load conversion profiles');
    } finally {
      setLoading(false);
    }
  }, [q, category]);

  useEffect(() => { load(); }, [load]);

  const openEditor = (c) => {
    setEditing({
      canonicalName: c.canonicalName,
      name: c.name,
      enabled: c.enabled,
      confidence: c.profile?.confidence || 'medium',
      countUnits: JSON.parse(JSON.stringify(c.profile?.countUnits || {})),
      cupsChopped: c.profile?.cups?.chopped ?? '',
      bread: c.profile?.bread ? { ...c.profile.bread } : null,
    });
    setPreviewResult(null);
  };

  const setCountGrams = (unit, sizeKey, value) => {
    setEditing((e) => {
      const def = { ...(e.countUnits[unit] || {}) };
      if (value === '' || value == null) delete def[sizeKey];
      else def[sizeKey] = Number(value);
      if (!Object.keys(def).length) {
        const next = { ...e.countUnits };
        delete next[unit];
        return { ...e, countUnits: next };
      }
      return { ...e, countUnits: { ...e.countUnits, [unit]: def } };
    });
  };

  const save = async () => {
    try {
      const profile = {
        countUnits: editing.countUnits,
        confidence: editing.confidence,
      };
      if (editing.cupsChopped !== '') {
        // cups map is derived server-side from the chopped-cup weight
        profile.cups = { chopped: Number(editing.cupsChopped) };
      }
      if (editing.bread) {
        profile.bread = {
          ...editing.bread,
          slicesPerLoaf: editing.bread.slicesPerLoaf === '' || editing.bread.slicesPerLoaf == null
            ? null : Number(editing.bread.slicesPerLoaf),
        };
      }
      await API.put(`/admin/produce-conversions/${editing.canonicalName}`, {
        enabled: editing.enabled,
        profile,
      });
      toast.success('Conversion profile saved');
      setEditing(null);
      load();
    } catch {
      toast.error('Failed to save profile');
    }
  };

  const runPreview = async () => {
    if (!editing) return;
    try {
      const { data } = await API.get(`/admin/produce-conversions/${editing.canonicalName}/preview`, {
        params: { qty: preview.qty, from: preview.from, to: preview.to, size: preview.size || undefined, form: preview.form || undefined },
      });
      setPreviewResult(data.result);
    } catch {
      setPreviewResult({ success: false, message: 'Preview failed' });
    }
  };

  if (loading) return <p className="text-charcoal/50">Loading conversion profiles…</p>;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          className="input-field max-w-xs"
          placeholder="Search produce…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input-field max-w-[180px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="vegetable">Vegetables</option>
          <option value="fruit">Fruits</option>
          <option value="herb">Herbs</option>
          <option value="bakery">Bakery</option>
          <option value="dairy">Dairy</option>
        </select>
        <p className="text-sm text-charcoal/50">{items.length} profile(s) — all conversions are estimates</p>
      </div>

      <div className="space-y-2">
        {items.map((c) => (
          <div key={c.canonicalName} className="card flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold">{c.name}</p>
                <span className="text-xs bg-primary/20 text-charcoal px-2 py-0.5 rounded-full capitalize">{c.category}</span>
                {c.adminModified && <span className="text-xs bg-warning/30 text-charcoal px-2 py-0.5 rounded-full">admin-edited</span>}
                {!c.enabled && <span className="text-xs bg-danger/15 text-danger px-2 py-0.5 rounded-full">disabled</span>}
              </div>
              <p className="text-xs text-charcoal/50 mt-1">
                {countUnitSummary(c.profile?.countUnits)}
                {c.profile?.cups?.chopped ? ` · ~${c.profile.cups.chopped}g/cup chopped` : ''}
                {` · ${c.profile?.confidence || 'medium'} confidence`}
              </p>
            </div>
            <CuteButton variant="outline" className="!py-1 !px-3 text-sm shrink-0" onClick={() => openEditor(c)}>Edit</CuteButton>
          </div>
        ))}
        {!items.length && <p className="text-charcoal/50">No conversion profiles found.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-soft max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold mb-1">Edit conversion — {editing.name}</h3>
            <p className="text-xs text-charcoal/50 mb-4">All values are estimated averages in grams. Leave blank to remove a size.</p>

            <div className="space-y-3 mb-4">
              {Object.keys(editing.countUnits).length === 0 && (
                <p className="text-sm text-charcoal/50">No count units configured (weight/volume only).</p>
              )}
              {Object.entries(editing.countUnits).map(([unit]) => (
                <div key={unit}>
                  <p className="text-sm font-semibold capitalize mb-1">{COUNT_UNIT_LABELS[unit] || unit}</p>
                  <div className="grid grid-cols-6 gap-2">
                    {SIZE_KEYS.map((k) => (
                      <div key={k}>
                        <label className="text-xs text-charcoal/50">{k === 'd' ? 'default' : k}</label>
                        <input
                          type="number" step="any" className="input-field !py-1 text-sm"
                          value={editing.countUnits[unit]?.[k] ?? ''}
                          onChange={(e) => setCountGrams(unit, k, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Grams per cup (chopped)</label>
                <input type="number" step="any" className="input-field" value={editing.cupsChopped}
                  onChange={(e) => setEditing({ ...editing, cupsChopped: e.target.value })} placeholder="e.g. 110" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Confidence</label>
                <select className="input-field" value={editing.confidence} onChange={(e) => setEditing({ ...editing, confidence: e.target.value })}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {editing.bread && editing.bread.breadType !== 'roll' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1">Default slices per loaf</label>
                <input
                  type="number" step="1" min="1" className="input-field max-w-[160px]"
                  value={editing.bread.slicesPerLoaf ?? ''}
                  onChange={(e) => setEditing({ ...editing, bread: { ...editing.bread, slicesPerLoaf: e.target.value } })}
                  placeholder="e.g. 18"
                />
                <p className="text-xs text-charcoal/50 mt-1">
                  Leave empty to require a per-item slice count — a universal loaf size is never assumed. Users can override this on their inventory item.
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="w-4 h-4" />
              Enable estimated conversions for this ingredient
            </label>

            <div className="border-t border-primary/10 pt-4 mb-4">
              <p className="text-sm font-semibold mb-2">Preview conversion</p>
              <div className="flex flex-wrap gap-2 items-center">
                <input type="number" step="any" className="input-field !py-1.5 w-20" value={preview.qty}
                  onChange={(e) => setPreview({ ...preview, qty: e.target.value })} />
                <select className="input-field !py-1.5 w-28" value={preview.from} onChange={(e) => setPreview({ ...preview, from: e.target.value })}>
                  {['pieces', 'g', 'kg', 'cups', 'tablespoons', 'teaspoons', 'ml', 'l', 'head', 'clove', 'bunch', 'stalk', 'ear', 'cob', 'wedge', 'slice', 'loaf', 'pod', 'sprig', 'whole', 'cube'].map((u) => <option key={u}>{u}</option>)}
                </select>
                <span>→</span>
                <select className="input-field !py-1.5 w-28" value={preview.to} onChange={(e) => setPreview({ ...preview, to: e.target.value })}>
                  {['g', 'kg', 'pieces', 'cups', 'tablespoons', 'teaspoons', 'ml', 'l', 'head', 'clove', 'bunch', 'stalk', 'ear', 'cob', 'wedge', 'slice', 'loaf', 'pod', 'sprig', 'whole', 'cube'].map((u) => <option key={u}>{u}</option>)}
                </select>
                <select className="input-field !py-1.5 w-28" value={preview.size} onChange={(e) => setPreview({ ...preview, size: e.target.value })}>
                  <option value="">any size</option>
                  {['xs', 's', 'm', 'l', 'xl'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="input-field !py-1.5 w-28" value={preview.form} onChange={(e) => setPreview({ ...preview, form: e.target.value })}>
                  <option value="">any form</option>
                  {['whole', 'chopped', 'diced', 'sliced', 'grated', 'mashed'].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <CuteButton variant="outline" className="!py-1.5 !px-3 text-sm" onClick={runPreview}>Preview</CuteButton>
              </div>
              {previewResult && (
                <p className={`text-sm mt-2 ${previewResult.success ? 'text-success' : 'text-danger'}`}>
                  {previewResult.success
                    ? `≈ ${previewResult.quantity} ${previewResult.unit} (estimated)`
                    : previewResult.message || 'Conversion not supported'}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <CuteButton variant="primary" onClick={save}>Save</CuteButton>
              <CuteButton variant="outline" onClick={() => setEditing(null)}>Cancel</CuteButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
