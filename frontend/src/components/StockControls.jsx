import { useRef, useState } from 'react';
import { inventoryService } from '../services/api';
export default function StockControls({ initialItem, onClose, onRefresh }) {
  const [item, setItem] = useState(initialItem), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [action, setAction] = useState({ kind: 'CONVERT', packageId: '', location: 'BACKROOM', toPackageId: '', toLocation: 'SHELF', quantity: 1, sellingPrice: '', reason: '' });
  const [packageForm, setPackageForm] = useState({ name: '', unitsPerPackage: '', barcode: '' });
  const [history, setHistory] = useState(null);
  const request = useRef(null);
  const key = payload => { const fingerprint = JSON.stringify(payload); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: `stock-${crypto.randomUUID()}` }; return request.current.key; };
  const packs = item.catalog?.packages || [];
  const pack = packs.find(p => p.id === action.packageId), target = packs.find(p => p.id === action.toPackageId);
  const save = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const payload = { kind: action.kind, packageId: action.packageId, location: action.location,
        quantity: action.kind === 'PRICE' ? 0 : Number(action.quantity), expectedVersion: item.version, reason: action.reason,
        ...(action.kind === 'MOVE' || action.kind === 'CONVERT' ? { toLocation: action.toLocation } : {}),
        ...(action.kind === 'CONVERT' ? { toPackageId: action.toPackageId } : {}),
        ...(action.kind === 'PRICE' ? { sellingPrice: Number(action.sellingPrice) } : {}) };
      const response = await inventoryService.stockAction(item.id, payload, key(payload));
      setItem(response.data); setHistory(null); setMessage('Stock operation saved. Counts and costs remain linked to this product.');
      setAction(current => ({ ...current, reason: '' })); await onRefresh();
    } catch (error) { setMessage(error.response?.data?.error || error.message); } finally { setBusy(false); }
  };
  const addPackage = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const payload = { name: packageForm.name, unitsPerPackage: Number(packageForm.unitsPerPackage), ...(packageForm.barcode ? { barcode: packageForm.barcode } : {}) };
      await inventoryService.addPackage(item.id, payload, key(payload)); setItem((await inventoryService.getItem(item.id)).data);
      setPackageForm({ name: '', unitsPerPackage: '', barcode: '' }); setMessage('Packaging added. Defining a package does not add stock.'); await onRefresh();
    } catch (error) { setMessage(error.response?.data?.error || error.message); } finally { setBusy(false); }
  };
  const change = patch => setAction(current => ({ ...current, ...patch }));
  return <div className="fixed inset-0 bg-slate-900/50 z-50 overflow-y-auto p-4"><div role="dialog" aria-modal="true" aria-label="Manage stock and packages" className="max-w-3xl mx-auto my-6 bg-white rounded-xl p-6 space-y-5">
    <div className="flex justify-between gap-3"><div><h3 className="text-xl font-bold">{item.productName || item.name} — stock & packages</h3><p className="text-slate-600">{item.stockQuantity} individual units in total. Receiving new deliveries is available in Purchases & Invoice Inbox.</p></div><button className="btn-secondary" disabled={busy} onClick={onClose}>Close</button></div>
    {message && <p role="status" className="p-3 rounded-lg bg-blue-50">{message}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Package</th><th>Location</th><th>On hand</th><th>Reserved</th><th>Available</th></tr></thead><tbody>{item.balances.map(balance => <tr className="border-t" key={balance.id}><td className="py-2">{balance.package?.name} ({balance.package?.unitsPerPackage} units)</td><td>{balance.location}</td><td>{balance.quantity}</td><td>{balance.reserved}</td><td>{balance.quantity - balance.reserved}</td></tr>)}</tbody></table></div>
    <form onSubmit={save}><fieldset disabled={busy} className="space-y-4 border rounded-lg p-4">
      <label className="block text-sm font-medium">Action<select className="input w-full mt-1" value={action.kind} onChange={e => change({ kind: e.target.value, quantity: 1 })}><option value="CONVERT">Open / repack packages</option><option value="MOVE">Move between backroom and shelf</option><option value="COUNT">Count this package and location</option><option value="PRICE">Set retail package price</option></select></label>
      <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm font-medium">Source package<select required className="input w-full mt-1" value={action.packageId} onChange={e => change({ packageId: e.target.value })}><option value="">Select package</option>{packs.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unitsPerPackage} units)</option>)}</select></label>
        <label className="text-sm font-medium">Source location<select className="input w-full mt-1" value={action.location} onChange={e => change({ location: e.target.value })}><option value="BACKROOM">Backroom</option><option value="SHELF">Shelf</option></select></label>
        {action.kind === 'PRICE' ? <label className="text-sm font-medium">Retail price per package ($)<input required className="input w-full mt-1" type="number" min="0" step="0.01" value={action.sellingPrice} onChange={e => change({ sellingPrice: e.target.value })} /></label> : <label className="text-sm font-medium">{action.kind === 'COUNT' ? 'Actual package count' : 'Number of source packages'}<input required className="input w-full mt-1" type="number" min={action.kind === 'COUNT' ? 0 : 1} step="1" value={action.quantity} onChange={e => change({ quantity: e.target.value })} /></label>}
        {action.kind === 'CONVERT' && <label className="text-sm font-medium">Destination package<select required className="input w-full mt-1" value={action.toPackageId} onChange={e => change({ toPackageId: e.target.value })}><option value="">Select package</option>{packs.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unitsPerPackage} units)</option>)}</select></label>}
        {['MOVE','CONVERT'].includes(action.kind) && <label className="text-sm font-medium">Destination location<select className="input w-full mt-1" value={action.toLocation} onChange={e => change({ toLocation: e.target.value })}><option value="BACKROOM">Backroom</option><option value="SHELF">Shelf</option></select></label>}
      </div>
      {action.kind === 'CONVERT' && pack && target && <p className="bg-slate-50 p-3 text-sm">{action.quantity} × {pack.name} becomes {Number(action.quantity) * pack.unitsPerPackage / target.unitsPerPackage} × {target.name}. Total individual units stay the same. Only whole packages can be converted.</p>}
      <label className="block text-sm font-medium">Reason<input required minLength={3} maxLength={500} className="input w-full mt-1" value={action.reason} onChange={e => change({ reason: e.target.value })} placeholder="Opened one case to restock the cooler" /></label>
      <button type="submit" className="btn-primary">Save operation</button><button type="button" className="btn-secondary ml-2" onClick={async () => { setBusy(true); try { setItem((await inventoryService.getItem(item.id)).data); setMessage('Loaded current stock. Recheck quantities before saving.'); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>Reload current stock</button>
    </fieldset></form>
    <details className="border rounded-lg p-4"><summary className="cursor-pointer font-medium">Define a new package size</summary><form onSubmit={addPackage}><fieldset disabled={busy} className="grid sm:grid-cols-2 gap-3 mt-3"><label className="text-sm">Package name<input required maxLength={50} className="input w-full" placeholder="Case 24" value={packageForm.name} onChange={e => setPackageForm({ ...packageForm, name: e.target.value })} /></label><label className="text-sm">Individual units per package<input required type="number" min="2" max="10000" step="1" className="input w-full" value={packageForm.unitsPerPackage} onChange={e => setPackageForm({ ...packageForm, unitsPerPackage: e.target.value })} /></label><label className="text-sm">Barcode (optional)<input maxLength={100} className="input w-full" value={packageForm.barcode} onChange={e => setPackageForm({ ...packageForm, barcode: e.target.value })} /></label><button className="btn-secondary" type="submit">Add packaging</button></fieldset></form></details>
    <button className="btn-secondary" disabled={busy} onClick={async () => { setBusy(true); try { setHistory((await inventoryService.movements(item.storeId, item.id)).data); } catch (error) { setMessage(error.message); } finally { setBusy(false); } }}>Show recent stock history</button>
    {history && <div className="space-y-2 text-sm">{history.length ? history.map(m => <p className="border-t pt-2" key={m.id}>{new Date(m.createdAt).toLocaleString()} · {m.kind} · {m.quantity > 0 ? '+' : ''}{m.quantity} {m.package.name} · {m.location} · {m.reason}</p>) : <p>No stock movements.</p>}</div>}
  </div></div>;
}
