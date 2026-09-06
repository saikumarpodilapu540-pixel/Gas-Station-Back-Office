import { useState } from 'react';
import { Edit2, Eye, Loader2, Plus, Trash2, Truck, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { vendorService } from '../services/api';

const CATEGORIES = ['Groceries/Tobacco', 'Beverages', 'Beer/Liquor', 'Fuel', 'Supplies'];
const EMPTY_FORM = { name: '', category: CATEGORIES[0], contactInfo: '' };

const getStatusStyle = (status) => {
  if (status === 'Active' || status === 'Delivered') return 'badge badge-success';
  if (status === 'Pending') return 'badge badge-warning';
  return 'badge badge-danger';
};

export default function Vendors() {
  const { vendors, activeStoreId, refreshStoreData } = useData();
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openAdd = () => { setSelected(null); setForm(EMPTY_FORM); setError(''); setModal('form'); };
  const openEdit = (vendor) => { setSelected(vendor); setForm({ name: vendor.name || '', category: vendor.category || CATEGORIES[0], contactInfo: vendor.contactInfo || '' }); setError(''); setModal('form'); };
  const openView = (vendor) => { setSelected(vendor); setError(''); setModal('view'); };
  const closeModal = () => { if (!saving) setModal(null); };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, storeId: activeStoreId };
      if (selected) await vendorService.update(selected.id, payload);
      else await vendorService.create(payload);
      await refreshStoreData(activeStoreId);
      setModal(null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to save vendor.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vendor) => {
    if (!window.confirm(`Delete ${vendor.name}? Vendors with purchase history cannot be deleted.`)) return;
    setSaving(true);
    setError('');
    try {
      await vendorService.remove(vendor.id, activeStoreId);
      await refreshStoreData(activeStoreId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to delete vendor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Vendor Management</h2>
          <p className="text-slate-500 font-medium mt-1">Track suppliers, purchase orders, and deliveries.</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus className="w-5 h-5" /> Add Vendor</button>
      </div>

      {error && !modal && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header"><tr><th className="px-6 py-4">Vendor</th><th className="px-6 py-4">Category</th><th className="px-6 py-4">Last Order</th><th className="px-6 py-4">Reliability</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100/50">
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="table-row group">
                  <td className="px-6 py-4 font-semibold text-slate-900"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:text-primary group-hover:border-primary/20 group-hover:shadow-sm transition-all duration-300"><Truck className="w-4 h-4" /></div>{vendor.name}</div></td>
                  <td className="px-6 py-4 text-slate-500 font-medium">{vendor.category}</td>
                  <td className="px-6 py-4 font-mono text-slate-500 text-xs">{vendor.lastOrder || 'N/A'}</td>
                  <td className="px-6 py-4 font-semibold text-slate-700">{vendor.rating || 'New'}</td>
                  <td className="px-6 py-4"><span className={getStatusStyle(vendor.status)}>{vendor.status || 'Active'}</span></td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"><button title="View vendor" onClick={() => openView(vendor)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors"><Eye className="w-4 h-4" /></button><button title="Edit vendor" onClick={() => openEdit(vendor)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button><button title="Delete vendor" onClick={() => handleDelete(vendor)} disabled={saving} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {vendors.length === 0 && <div className="p-12 text-center font-medium text-slate-500">No vendors found.</div>}
        </div>
      </div>

      {modal && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900 tracking-tight">{modal === 'view' ? 'Vendor Details' : selected ? 'Edit Vendor' : 'Add New Vendor'}</h3><button onClick={closeModal} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button></div>
        {modal === 'view' ? <div className="p-6 space-y-4 text-sm"><div><p className="text-slate-400 font-semibold uppercase text-xs">Name</p><p className="font-semibold text-slate-900 mt-1">{selected.name}</p></div><div><p className="text-slate-400 font-semibold uppercase text-xs">Category</p><p className="font-medium text-slate-700 mt-1">{selected.category}</p></div><div><p className="text-slate-400 font-semibold uppercase text-xs">Contact</p><p className="font-medium text-slate-700 mt-1">{selected.contactInfo || 'Not provided'}</p></div><div className="grid grid-cols-2 gap-4"><div><p className="text-slate-400 font-semibold uppercase text-xs">Last order</p><p className="font-medium text-slate-700 mt-1">{selected.lastOrder || 'N/A'}</p></div><div><p className="text-slate-400 font-semibold uppercase text-xs">Purchases</p><p className="font-medium text-slate-700 mt-1">{selected.purchaseCount || 0}</p></div></div><button onClick={closeModal} className="w-full btn-secondary mt-2">Close</button></div> : <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Vendor Name</label><input required minLength="2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" /></div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="input">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Contact information <span className="font-normal text-slate-400">(optional)</span></label><input value={form.contactInfo} onChange={(event) => setForm({ ...form, contactInfo: event.target.value })} className="input" placeholder="Phone or email" /></div>
          <div className="flex gap-3 pt-4"><button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancel</button><button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : selected ? 'Update Vendor' : 'Save Vendor'}</button></div>
        </form>}
      </div></div>}
    </div>
  );
}
