import { useState } from 'react';
import { CheckCircle2, Plus, Save, ShoppingCart, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useData } from '../context/DataContext';
import { getDepartmentConfig } from '../utils/departments';

export default function SalesTerminal() {
  const { inventory, recordStoreSale, activeStoreId, dataLoading } = useData();
  const [cart, setCart] = useState([{ id: '', qty: 1 }]);
  const [paymentType, setPaymentType] = useState('CASH');
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const updateCartItem = (index, changes) => {
    setCart((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...changes } : item
    )));
  };

  const totals = cart.reduce((result, cartItem) => {
    const product = inventory.find((item) => item.id === cartItem.id);
    if (!product) return result;
    const lineTotal = product.price * Number(cartItem.qty || 0);
    const tax = lineTotal * (getDepartmentConfig(product.category).taxRate || 0);
    return { subtotal: result.subtotal + lineTotal, tax: result.tax + tax };
  }, { subtotal: 0, tax: 0 });

  const submitSale = async (event) => {
    event.preventDefault();
    setMessage(null);

    const items = cart.filter((item) => item.id && Number(item.qty) > 0);
    if (!items.length) {
      setMessage({ type: 'error', text: 'Add at least one product to the sale.' });
      return;
    }

    const requestedByProduct = new Map();
    for (const item of items) {
      requestedByProduct.set(item.id, (requestedByProduct.get(item.id) || 0) + Number(item.qty));
    }
    const unavailable = Array.from(requestedByProduct).find(([id, quantity]) => (
      quantity > (inventory.find((item) => item.id === id)?.stock || 0)
    ));
    if (unavailable) {
      setMessage({ type: 'error', text: 'The requested quantity is greater than available stock.' });
      return;
    }

    setSubmitting(true);
    try {
      await recordStoreSale(items, paymentType);
      setMessage({ type: 'success', text: 'Sale recorded and inventory updated.' });
      setCart([{ id: inventory[0]?.id || '', qty: 1 }]);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Unable to record sale.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeStoreId || activeStoreId === 'hq') {
    return <div className="glass-panel p-8 text-slate-600">Select one store to record a sale.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Sales Terminal</h2>
        <p className="text-slate-500 mt-1">Sales are saved to PostgreSQL and stock is deducted in one transaction.</p>
      </div>

      {message && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`p-4 rounded-xl border ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
            <span className="font-medium">{message.text}</span>
          </div>
        </motion.div>
      )}

      <form onSubmit={submitSale} className="glass-panel p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <ShoppingCart className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-bold">C-Store Sale</h3>
        </div>

        {!dataLoading && inventory.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Add inventory before recording a sale.
          </p>
        )}

        {cart.map((cartItem, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_110px_44px] gap-3 items-end">
            <label className="block text-sm font-semibold text-slate-700">
              Product
              <select value={cartItem.id} onChange={(event) => updateCartItem(index, { id: event.target.value })}
                className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                <option value="">Select a product</option>
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — {item.stock} available — ${item.price.toFixed(2)}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Quantity
              <input type="number" min="1" step="1" value={cartItem.qty}
                onChange={(event) => updateCartItem(index, { qty: event.target.value })}
                className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5" />
            </label>
            <button type="button" aria-label="Remove item" disabled={cart.length === 1}
              onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              className="h-11 rounded-xl border border-slate-200 text-rose-600 disabled:opacity-30 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button type="button" disabled={!inventory.length}
          onClick={() => setCart((current) => [...current, { id: inventory[0]?.id || '', qty: 1 }])}
          className="text-sm font-semibold text-primary flex items-center gap-1 disabled:opacity-40">
          <Plus className="w-4 h-4" /> Add another item
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100">
          <label className="text-sm font-semibold text-slate-700">
            Payment type
            <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}
              className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              {['CASH', 'CREDIT', 'DEBIT', 'EBT', 'OTHER'].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><strong>${totals.subtotal.toFixed(2)}</strong></div>
            <div className="flex justify-between"><span className="text-slate-500">Estimated tax</span><strong>${totals.tax.toFixed(2)}</strong></div>
            <div className="flex justify-between text-lg border-t border-dashed pt-2"><span>Total</span><strong>${(totals.subtotal + totals.tax).toFixed(2)}</strong></div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={submitting || !inventory.length} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Save className="w-5 h-5" /> {submitting ? 'Recording…' : 'Ring Up Sale'}
          </button>
        </div>
      </form>
    </div>
  );
}
