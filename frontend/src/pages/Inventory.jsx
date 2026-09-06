import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Edit2, Eye, Filter, Package, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { inventoryService } from '../services/api';
import { DEPARTMENTS, autoSuggestDepartment, getDepartmentConfig } from '../utils/departments';

const EMPTY_FORM = {
  product_name: '', category: '', cost_price: '', selling_price: '', stock_quantity: '', reorder_level: 10
};

const errorText = (error, fallback) => {
  const value = error.response?.data?.error;
  if (Array.isArray(value)) return value.map((item) => item.message || item).join(', ');
  return value || error.message || fallback;
};

export default function Inventory() {
  const { activeStoreId, inventory, recordPhysicalCount, refreshStoreData } = useData();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [audit, setAudit] = useState({ id: '', count: '' });
  const [loading, setLoading] = useState(false);
  const [formMessage, setFormMessage] = useState(null);

  const categories = useMemo(() => [
    'All', ...new Set(inventory.map((item) => item.category).filter(Boolean))
  ], [inventory]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inventory.filter((item) => {
      const name = String(item.productName || item.name || '').toLowerCase();
      const sku = String(item.sku || '').toLowerCase();
      const stock = Number(item.stockQuantity ?? item.stock ?? 0);
      const reorderLevel = Number(item.reorderLevel ?? item.lowStockAlert ?? 10);
      const matchesSearch = !query || name.includes(query) || sku.includes(query);
      const matchesCategory = categoryFilter === 'All' || item.category === categoryFilter;
      const matchesStock = stockFilter === 'All'
        || (stockFilter === 'Low stock' && stock > 0 && stock <= reorderLevel)
        || (stockFilter === 'Out of stock' && stock === 0);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [categoryFilter, inventory, search, stockFilter]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormMessage(null);
    setFormMode('add');
  };

  const openEdit = (item) => {
    setForm({
      product_name: item.productName || item.name || '',
      category: item.category || '',
      cost_price: item.costPrice ?? item.cost ?? '',
      selling_price: item.sellingPrice ?? item.price ?? '',
      stock_quantity: item.stockQuantity ?? item.stock ?? 0,
      reorder_level: item.reorderLevel ?? item.lowStockAlert ?? 10,
      id: item.id
    });
    setFormMessage(null);
    setFormMode('edit');
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setFormMessage(null);
    const payload = {
      product_name: form.product_name.trim(),
      category: form.category,
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity),
      reorder_level: Number(form.reorder_level)
    };
    if (!payload.product_name || !payload.category) {
      setFormMessage({ type: 'error', text: 'Product name and category are required.' });
      return;
    }
    if (!Number.isFinite(payload.cost_price) || payload.cost_price <= 0 || !Number.isFinite(payload.selling_price) || payload.selling_price <= 0) {
      setFormMessage({ type: 'error', text: 'Prices must be greater than zero.' });
      return;
    }
    if (!Number.isInteger(payload.stock_quantity) || payload.stock_quantity < 0 || !Number.isInteger(payload.reorder_level) || payload.reorder_level < 0) {
      setFormMessage({ type: 'error', text: 'Stock and reorder levels must be whole numbers of zero or more.' });
      return;
    }
    setLoading(true);
    try {
      if (formMode === 'edit') await inventoryService.updateItem(form.id, payload);
      else await inventoryService.createItem({ ...payload, store_id: activeStoreId });
      await refreshStoreData(activeStoreId);
      setFormMode(null);
    } catch (error) {
      setFormMessage({ type: 'error', text: errorText(error, 'Unable to save product.') });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete ${item.productName || item.name}? This cannot be undone.`)) return;
    try {
      await inventoryService.deleteItem(item.id);
      await refreshStoreData(activeStoreId);
    } catch (error) {
      window.alert(errorText(error, 'Unable to delete product.'));
    }
  };

  const handleAuditSubmit = async (event) => {
    event.preventDefault();
    if (!audit.id || audit.count === '' || Number(audit.count) < 0) return;
    try {
      await recordPhysicalCount('inventory', audit.id, Number(audit.count));
      setShowAuditModal(false);
      setAudit({ id: '', count: '' });
    } catch (error) {
      window.alert(errorText(error, 'Unable to update physical count.'));
    }
  };

  const displayedStock = (item) => Number(item.stockQuantity ?? item.stock ?? 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Management</h2>
          <p className="text-slate-500 font-medium mt-1">Track SKUs, margins, and stock alerts.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { setAudit({ id: inventory[0]?.id || '', count: '' }); setShowAuditModal(true); }} disabled={activeStoreId === 'hq' || !inventory.length} className="btn-secondary flex items-center gap-2 bg-white text-rose-600 border-rose-200 hover:bg-rose-50 disabled:opacity-50">
            <AlertTriangle className="w-4 h-4" /> Physical Count
          </button>
          <button onClick={openAdd} disabled={activeStoreId === 'hq'} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            <Plus className="w-5 h-5" /> Add Product
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-white">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search products by name or SKU..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-slate-50 border border-slate-200 text-sm rounded-lg py-2.5 pl-9 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-900 placeholder:text-slate-400" />
          </div>
          <button onClick={() => setShowFilters((visible) => !visible)} aria-expanded={showFilters} className={`p-2.5 border rounded-lg transition-colors bg-white shadow-sm flex items-center gap-2 text-sm font-medium ${showFilters || categoryFilter !== 'All' || stockFilter !== 'All' ? 'border-blue-300 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}>
            <Filter className="w-4 h-4" /> Filters
          </button>
          {showFilters && (
            <div className="w-full flex flex-wrap items-center gap-3 pt-1">
              <label className="text-sm font-semibold text-slate-600">Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-600">Stock
                <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <option>All</option><option>Low stock</option><option>Out of stock</option>
                </select>
              </label>
              <button onClick={() => { setCategoryFilter('All'); setStockFilter('All'); setSearch(''); }} className="text-sm font-semibold text-slate-500 hover:text-slate-900">Clear filters</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header"><tr>
              <th className="px-6 py-4">Product</th><th className="px-6 py-4">SKU</th><th className="px-6 py-4">Category</th>
              <th className="px-6 py-4 text-right">Cost</th><th className="px-6 py-4 text-right">Price</th><th className="px-6 py-4 text-right">Margin</th><th className="px-6 py-4 text-right">In Stock</th><th className="px-6 py-4 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100/50">
              {filtered.map((item, index) => {
                const cost = Number(item.costPrice ?? item.cost ?? 0);
                const price = Number(item.sellingPrice ?? item.price ?? 0);
                const stock = displayedStock(item);
                const reorder = Number(item.reorderLevel ?? item.lowStockAlert ?? 10);
                const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : '0.0';
                const isLow = stock <= reorder;
                return <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }} key={item.id} className="table-row group">
                  <td className="px-6 py-4 font-semibold text-slate-900"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-500"><Package className="w-4 h-4" /></div>{item.productName || item.name}</div></td>
                  <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.sku}</td>
                  <td className="px-6 py-4"><span className={`badge ${getDepartmentConfig(item.category).color}`}>{item.category}</span></td>
                  <td className="px-6 py-4 text-slate-500 font-medium text-right">${cost.toFixed(2)}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900 text-right">${price.toFixed(2)}</td>
                  <td className="px-6 py-4 font-bold text-emerald-600 text-right">{margin}%</td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2">{isLow && <AlertTriangle className="w-4 h-4 text-rose-500" />}<span className={`font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>{stock}</span></div></td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-1">
                    <button aria-label={`View ${item.productName || item.name}`} onClick={() => setViewItem(item)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors"><Eye className="w-4 h-4" /></button>
                    <button aria-label={`Edit ${item.productName || item.name}`} onClick={() => openEdit(item)} disabled={activeStoreId === 'hq'} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors disabled:opacity-40"><Edit2 className="w-4 h-4" /></button>
                    <button aria-label={`Delete ${item.productName || item.name}`} onClick={() => handleDelete(item)} disabled={activeStoreId === 'hq'} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                  </div></td>
                </motion.tr>;
              })}
            </tbody>
          </table>
          {!filtered.length && <div className="p-12 text-center font-medium text-slate-500">{activeStoreId === 'hq' ? 'Select a store to view inventory.' : 'No products found.'}</div>}
        </div>
      </div>

      {formMode && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"><div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl my-8">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center"><div><h3 className="text-xl font-bold text-slate-900">{formMode === 'edit' ? 'Edit Product' : 'Add New Product'}</h3><p className="text-sm text-slate-500 mt-1">Changes are saved to PostgreSQL.</p></div><button onClick={() => setFormMode(null)} className="text-slate-400 hover:text-slate-600"><XCircle className="w-6 h-6" /></button></div>
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {formMessage && <div className={`p-3 rounded-lg text-sm font-semibold border flex items-center gap-2 ${formMessage.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>{formMessage.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}{formMessage.text}</div>}
          <label className="block text-sm font-semibold text-slate-700">Product Name<input required value={form.product_name} onChange={(event) => { const productName = event.target.value; const suggested = autoSuggestDepartment(productName); setForm((current) => ({ ...current, product_name: productName, ...(suggested && !current.manualCategoryOverride ? { category: suggested } : {}) })); }} className="mt-1.5 w-full input" /></label>
          <label className="block text-sm font-semibold text-slate-700">Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, manualCategoryOverride: true })} className="mt-1.5 w-full input"><option value="">Select Department...</option>{DEPARTMENTS.map((department) => <option key={department.id} value={department.name}>{department.name}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-4"><label className="block text-sm font-semibold text-slate-700">Cost Price<input required type="number" min="0.01" step="0.01" value={form.cost_price} onChange={(event) => setForm({ ...form, cost_price: event.target.value })} className="mt-1.5 w-full input" /></label><label className="block text-sm font-semibold text-slate-700">Selling Price<input required type="number" min="0.01" step="0.01" value={form.selling_price} onChange={(event) => setForm({ ...form, selling_price: event.target.value })} className="mt-1.5 w-full input" /></label></div>
          <div className="grid grid-cols-2 gap-4"><label className="block text-sm font-semibold text-slate-700">Stock Quantity<input required type="number" min="0" step="1" value={form.stock_quantity} onChange={(event) => setForm({ ...form, stock_quantity: event.target.value })} className="mt-1.5 w-full input" /></label><label className="block text-sm font-semibold text-slate-700">Low-stock alert at<input required type="number" min="0" step="1" value={form.reorder_level} onChange={(event) => setForm({ ...form, reorder_level: event.target.value })} className="mt-1.5 w-full input" /></label></div>
          <div className="flex gap-3 pt-4 border-t border-slate-100"><button type="button" onClick={() => setFormMode(null)} className="flex-1 btn-secondary">Cancel</button><button type="submit" disabled={loading} className="flex-1 btn-primary">{loading ? 'Saving...' : 'Save Product'}</button></div>
        </form>
      </div></div>}

      {viewItem && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl"><div className="p-6 border-b border-slate-100 flex justify-between items-center"><h3 className="text-xl font-bold text-slate-900">Product Details</h3><button onClick={() => setViewItem(null)} className="text-slate-400"><XCircle className="w-6 h-6" /></button></div><div className="p-6 space-y-4 text-sm"><div><p className="text-xs uppercase font-bold text-slate-400">Product</p><p className="text-lg font-bold text-slate-900">{viewItem.productName || viewItem.name}</p></div><div className="grid grid-cols-2 gap-4"><div><p className="text-xs uppercase font-bold text-slate-400">SKU</p><p className="font-mono text-slate-700">{viewItem.sku}</p></div><div><p className="text-xs uppercase font-bold text-slate-400">Category</p><p className="text-slate-700">{viewItem.category}</p></div><div><p className="text-xs uppercase font-bold text-slate-400">Cost</p><p className="text-slate-700">${Number(viewItem.costPrice ?? viewItem.cost ?? 0).toFixed(2)}</p></div><div><p className="text-xs uppercase font-bold text-slate-400">Selling Price</p><p className="text-slate-700">${Number(viewItem.sellingPrice ?? viewItem.price ?? 0).toFixed(2)}</p></div><div><p className="text-xs uppercase font-bold text-slate-400">Stock</p><p className="font-bold text-slate-900">{displayedStock(viewItem)}</p></div><div><p className="text-xs uppercase font-bold text-slate-400">Reorder Level</p><p className="text-slate-700">{viewItem.reorderLevel ?? viewItem.lowStockAlert ?? 10}</p></div></div><button onClick={() => { setViewItem(null); openEdit(viewItem); }} disabled={activeStoreId === 'hq'} className="w-full btn-primary disabled:opacity-50">Edit Product</button></div></div></div>}

      {showAuditModal && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl"><div className="p-6 border-b border-rose-100 bg-rose-50/30"><h3 className="text-xl font-bold text-rose-900">Inventory Reconciliation</h3><p className="text-sm text-rose-600/80 mt-1">Enter the actual physical count on shelves.</p></div><form onSubmit={handleAuditSubmit} className="p-6 space-y-5"><label className="block text-sm font-semibold text-slate-700">Select Product<select required value={audit.id} onChange={(event) => setAudit({ ...audit, id: event.target.value })} className="mt-1.5 w-full input">{inventory.map((item) => <option key={item.id} value={item.id}>{item.productName || item.name} (Expected: {displayedStock(item)})</option>)}</select></label><label className="block text-sm font-semibold text-slate-700">Actual Count<input required min="0" type="number" value={audit.count} onChange={(event) => setAudit({ ...audit, count: event.target.value })} className="mt-1.5 w-full input" /></label><div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowAuditModal(false)} className="flex-1 btn-secondary">Cancel</button><button type="submit" className="flex-1 btn-primary bg-rose-600 hover:bg-rose-700">Save Count</button></div></form></div></div>}
    </div>
  );
}
