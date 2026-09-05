import { motion } from 'framer-motion';
import { Package, Search, Plus, Filter, AlertTriangle, Eye, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useState } from 'react';
import { inventoryService } from '../services/api';
import { DEPARTMENTS, getDepartmentConfig, autoSuggestDepartment } from '../utils/departments';

export default function Inventory() {
  const { activeStoreId, inventory, recordPhysicalCount, refreshStoreData } = useData();
  const [search, setSearch] = useState('');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [audit, setAudit] = useState({ id: '', count: 0 });
  const [loading, setLoading] = useState(false);
  
  // Add Product Form State
  const [form, setForm] = useState({
    product_name: '',
    category: '',
    cost_price: '',
    selling_price: '',
    stock_quantity: ''
  });
  const [formMessage, setFormMessage] = useState(null);

  const filtered = inventory.filter(item => 
    (item.productName || item.name || '').toLowerCase().includes(search.toLowerCase()) || 
    (item.sku || '').includes(search)
  );

  const handleAuditSubmit = async (e) => {
    e.preventDefault();
    if (audit.id && audit.count >= 0) {
      try {
        await recordPhysicalCount('inventory', audit.id, parseInt(audit.count, 10));
        setShowAuditModal(false);
        setAudit({ ...audit, count: 0 });
      } catch (error) {
        alert(error.response?.data?.error || 'Unable to update physical count');
      }
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormMessage(null);
    setLoading(true);

    // STEP 1: Form Validation
    if (!form.product_name || !form.category || form.cost_price === '' || form.selling_price === '' || form.stock_quantity === '') {
      setFormMessage({ type: 'error', text: 'Please fill all required fields' });
      setLoading(false);
      return;
    }

    const payload = {
      product_name: form.product_name,
      category: form.category,
      cost_price: parseFloat(form.cost_price),
      selling_price: parseFloat(form.selling_price),
      stock_quantity: parseInt(form.stock_quantity, 10),
      store_id: activeStoreId
    };

    // STEP 3: Backend Logic & STEP 2: API Connection
    if (payload.cost_price <= 0) {
      setFormMessage({ type: 'error', text: 'Cost price must be greater than 0' });
      setLoading(false); return;
    }
    if (payload.selling_price <= 0) {
      setFormMessage({ type: 'error', text: 'Selling price must be greater than 0' });
      setLoading(false); return;
    }
    if (payload.stock_quantity < 0) {
      setFormMessage({ type: 'error', text: 'Stock cannot be negative' });
      setLoading(false); return;
    }

    try {
      await inventoryService.createItem(payload);
      
      // STEP 4 & 5: Success Response & UI Update
      setFormMessage({ type: 'success', text: 'Product added successfully' });
      setForm({ product_name: '', category: '', cost_price: '', selling_price: '', stock_quantity: '' });
      await refreshStoreData(activeStoreId);
      setTimeout(() => {
        setShowAddModal(false);
        setFormMessage(null);
      }, 1500);
    } catch (error) {
      // Show exact backend error message
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to add product';
      setFormMessage({ type: 'error', text: `Error: ${errorMsg}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      try {
        await inventoryService.deleteItem(id);
        await refreshStoreData(activeStoreId);
      } catch (error) {
        const errorMsg = error.response?.data?.error || error.message;
        console.error("Failed to delete product", error);
        alert(`Failed to delete product: ${errorMsg}`);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Management</h2>
          <p className="text-slate-500 font-medium mt-1">Track SKUs, margins, and stock alerts.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setShowAuditModal(true)}
            disabled={activeStoreId === 'hq'}
            className="btn-secondary flex items-center gap-2 bg-white text-rose-600 border-rose-200 hover:bg-rose-50 disabled:opacity-50"
          >
            <AlertTriangle className="w-4 h-4" /> Physical Count
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            disabled={activeStoreId === 'hq'}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-5 h-5" />
            Add Product
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-white">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search products by name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-sm rounded-lg py-2.5 pl-9 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <button className="p-2.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors bg-white shadow-sm flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">SKU</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4 text-right">Cost</th>
                <th className="px-6 py-4 text-right">Price</th>
                <th className="px-6 py-4 text-right">Margin</th>
                <th className="px-6 py-4 text-right">In Stock</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50">
              {filtered.map((item, i) => {
                const cost = item.costPrice || item.cost || 0;
                const price = item.sellingPrice || item.price || 0;
                const margin = price > 0 ? ((price - cost) / price * 100).toFixed(1) : '0.0';
                const stock = item.stockQuantity || item.stock || 0;
                const isLow = stock <= (item.reorderLevel || item.lowStockAlert || 10);
                
                return (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={item.id} 
                    className="table-row group"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:text-primary group-hover:border-primary/20 group-hover:shadow-sm transition-all duration-300">
                        <Package className="w-4 h-4" />
                      </div>
                      {item.productName || item.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{item.sku}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${getDepartmentConfig(item.category).color}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-medium text-right">${cost.toFixed(2)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900 text-right">${price.toFixed(2)}</td>
                    <td className="px-6 py-4 font-bold text-emerald-600 text-right">{margin}%</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isLow && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                        <span className={`font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                          {stock}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-12 text-center font-medium text-slate-500">
              {activeStoreId === 'hq' ? 'Select a store to view inventory.' : 'No products found.'}
            </div>
          )}
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl my-8">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  Add New Product
                </h3>
                <p className="text-sm text-slate-500 mt-1">Add a new SKU to your inventory system.</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-5">
              {formMessage && (
                <div className={`p-4 rounded-lg flex items-center gap-2 text-sm font-bold border ${formMessage.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                  {formMessage.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  {formMessage.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Product Name *</label>
                  <input 
                    type="text" 
                    value={form.product_name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const suggested = autoSuggestDepartment(newName);
                      setForm(prev => ({
                        ...prev, 
                        product_name: newName,
                        ...(suggested && !prev.manualCategoryOverride ? { category: suggested } : {})
                      }));
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-bold text-slate-700">Department / Category *</label>
                    {form.category && !form.manualCategoryOverride && autoSuggestDepartment(form.product_name) === form.category && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">Auto-Suggested</span>
                    )}
                  </div>
                  <select 
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value, manualCategoryOverride: true})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none"
                  >
                    <option value="">Select Department...</option>
                    {DEPARTMENTS.map(dept => (
                      <option key={dept.id} value={dept.name}>{dept.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Cost Price *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                      <input 
                        type="number" step="0.01"
                        value={form.cost_price}
                        onChange={(e) => setForm({...form, cost_price: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">Selling Price *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">$</span>
                      <input 
                        type="number" step="0.01"
                        value={form.selling_price}
                        onChange={(e) => setForm({...form, selling_price: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Initial Stock Quantity *</label>
                  <input 
                    type="number" 
                    value={form.stock_quantity}
                    onChange={(e) => setForm({...form, stock_quantity: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddModal(false)} disabled={loading} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-1 btn-primary">
                  {loading ? 'Adding...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inventory Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-rose-100 bg-rose-50/30 rounded-t-2xl">
              <h3 className="text-xl font-bold text-rose-900 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Inventory Reconciliation
              </h3>
              <p className="text-sm text-rose-600/80 mt-1">Enter actual physical count on shelves.</p>
            </div>
            <form onSubmit={handleAuditSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Select Product</label>
                <select 
                  value={audit.id}
                  onChange={e => setAudit({...audit, id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm"
                >
                  {inventory.map(item => (
                    <option key={item.id} value={item.id}>{item.productName || item.name} (Expected: {item.stockQuantity || item.stock})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Actual Count</label>
                <input 
                  type="number" required min="0"
                  value={audit.count}
                  onChange={e => setAudit({...audit, count: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAuditModal(false)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary bg-rose-600 hover:bg-rose-700 border-rose-700 shadow-rose-200">
                  Save Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
