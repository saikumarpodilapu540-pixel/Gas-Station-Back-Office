import { useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { saleOptions, quoteCart } from '../utils/saleQuote.mjs';
const empty = () => ({ id: '', packageId: '', location: 'SHELF', qty: 1 });
const money = value => `$${Number(value || 0).toFixed(2)}`;
export default function SalesTerminal() {
  const data = useData();
  if (!data.activeStoreId || data.activeStoreId === 'hq') return <div className="glass-panel p-8">Select a store to record a sale.</div>;
  return <StoreTerminal key={data.activeStoreId} data={data} />;
}
function StoreTerminal({ data: { inventory, recordStoreSale, dataLoading } }) {
  const [cart, setCart] = useState([empty()]), [paymentType, setPaymentType] = useState('CASH');
  const [message, setMessage] = useState(''), [submitting, setSubmitting] = useState(false);
  const request = useRef(null);
  const totals = quoteCart(cart, inventory);
  const update = (index, patch) => setCart(current => current.map((line,i) => i === index ? { ...line, ...patch } : line));
  const submit = async event => {
    event.preventDefault(); if (totals.error) return;
    const fingerprint = JSON.stringify({ cart, paymentType });
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: `sale-${crypto.randomUUID()}` };
    setSubmitting(true); setMessage('');
    try {
      const sale = await recordStoreSale(cart, paymentType, request.current.key);
      setCart([empty()]); request.current = null;
      setMessage(`Sale recorded: ${money(sale.totalAmount)} including ${money(sale.taxAmount)} tax. Receipt ${sale.id}.`);
    } catch (error) { setMessage(error.response?.data?.error || 'Could not confirm the sale. Retry the unchanged cart to check it safely.'); }
    finally { setSubmitting(false); }
  };
  return <div className="max-w-5xl mx-auto space-y-6"><div><h2 className="text-2xl font-bold">Sales Terminal</h2><p className="text-slate-600 mt-1">Choose the package and location being sold. Reserved stock is unavailable.</p></div>
    {message && <div role="status" className="bg-blue-50 border border-blue-200 rounded-lg p-4">{message}</div>}
    <form onSubmit={submit} className="glass-panel p-6"><fieldset disabled={submitting || dataLoading} className="space-y-5">
      {cart.map((line,index) => { const product = inventory.find(item => item.id === line.id); return <div key={index} className="grid md:grid-cols-[1fr_1fr_100px_70px] gap-3 items-end">
        <label className="text-sm font-medium">Product<select required value={line.id} className="input w-full mt-1" onChange={event => update(index, { id: event.target.value, packageId: '' })}><option value="">Select product</option>{inventory.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label>
        <label className="text-sm font-medium">Package & location<select required className="input w-full mt-1" value={line.packageId ? `${line.packageId}/${line.location}` : ''} onChange={event => { const [packageId, location] = event.target.value.split('/'); update(index, { packageId, location }); }}><option value="">Select available stock</option>{saleOptions(product).map(option => <option key={option.id} disabled={option.price === null} value={`${option.packageId}/${option.location}`}>{option.package.name} · {option.location} · {option.available} available · {option.price === null ? 'Set pack price in Inventory' : money(option.price)}</option>)}</select></label>
        <label className="text-sm font-medium">Quantity<input required type="number" min="1" step="1" className="input w-full mt-1" value={line.qty} onChange={event => update(index, { qty: event.target.value })} /></label>
        <button className="text-rose-700 py-2 disabled:opacity-40" disabled={cart.length === 1} type="button" onClick={() => setCart(current => current.filter((_,i) => i !== index))}>Remove</button>
      </div>; })}
      <button type="button" className="btn-secondary" disabled={cart.length >= 100} onClick={() => setCart(current => [...current, empty()])}>Add item</button>
      {totals.error && <p className="text-amber-800">{totals.error}</p>}
      <div className="grid sm:grid-cols-2 gap-4 border-t pt-4"><label className="text-sm font-medium">Payment<select className="input w-full mt-1" value={paymentType} onChange={e => setPaymentType(e.target.value)}>{['CASH','CREDIT','DEBIT','EBT','OTHER'].map(value => <option key={value}>{value}</option>)}</select></label><div><p>Subtotal: {money(totals.subtotal)}</p><p>Estimated tax using product rates: {money(totals.tax)}</p><p className="text-lg font-bold">Total: {money(totals.total)}</p></div></div>
      <button type="submit" className="btn-primary" disabled={Boolean(totals.error) || !inventory.length}>{submitting ? 'Recording…' : 'Ring Up Sale'}</button>
    </fieldset></form></div>;
}
