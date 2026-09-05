import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ClipboardCheck, TrendingUp, History, Save, Calendar, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useData } from '../context/DataContext';
import { dailyCloseService } from '../services/api';

export default function DailyClose() {
  const { dailyHistory, setDailyHistory, activeStoreId } = useData();
  const [activeTab, setActiveTab] = useState('entry'); // 'entry', 'summary', 'history'
  
  // Single day's entry state
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    fuel: { regular: 0, premium: 0, diesel: 0 },
    store: { grocery: 0, liquor: 0, beer: 0, cigarettes: 0, vapes: 0, hotFood: 0 },
    expenses: { utilities: 0, wages: 0, rent: 0, misc: 0 },
    cogs: 0 // Estimated Cost of Goods Sold for the day
  });

  const handleInputChange = (category, field, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  const handleSimpleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'date' ? value : parseFloat(value) || 0
    }));
  };

  // Calculations
  const calculatedData = useMemo(() => {
    const fuelRevenue = Object.values(formData.fuel).reduce((a, b) => a + b, 0);
    const storeRevenue = Object.values(formData.store).reduce((a, b) => a + b, 0);
    const totalRevenue = fuelRevenue + storeRevenue;
    const totalExpenses = Object.values(formData.expenses).reduce((a, b) => a + b, 0);
    const netProfit = totalRevenue - totalExpenses - formData.cogs;

    // Highest/Lowest Category
    const allCategories = { ...formData.fuel, ...formData.store };
    let highest = { name: 'None', val: -1 };
    let lowest = { name: 'None', val: Infinity };

    Object.entries(allCategories).forEach(([key, val]) => {
      if (val > highest.val) highest = { name: key, val };
      if (val < lowest.val && val > 0) lowest = { name: key, val };
    });

    if (lowest.val === Infinity) lowest = { name: 'N/A', val: 0 };

    return { fuelRevenue, storeRevenue, totalRevenue, totalExpenses, netProfit, highest, lowest };
  }, [formData]);

  const handleSaveClose = async () => {
    const newEntry = {
      storeId: activeStoreId,
      date: formData.date,
      totalSales: calculatedData.totalRevenue,
      totalRevenue: calculatedData.totalRevenue,
      totalExpenses: calculatedData.totalExpenses + formData.cogs,
      netProfit: calculatedData.netProfit,
      highestCategory: calculatedData.highest.name,
      lowestCategory: calculatedData.lowest.name,
      data: formData
    };
    
    try {
      await dailyCloseService.submitClosing(newEntry);
      
      // Update UI
      setDailyHistory([
        { ...newEntry, id: Date.now() }, 
        ...dailyHistory
      ].sort((a, b) => new Date(b.date) - new Date(a.date)));
      
      setActiveTab('summary');
      alert('Daily closing submitted successfully!');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error("Failed to submit daily close", error);
      alert(`Failed to submit daily close: ${errorMsg}`);
    }
  };

  // Chart Data preparation
  const chartData = [...dailyHistory].reverse().map(h => ({
    date: h.date.substring(5), // MM-DD
    Profit: h.netProfit,
    Revenue: h.totalRevenue
  }));

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            Daily Closing System
          </h2>
          <p className="text-slate-500 font-medium mt-1">Reconcile daily sales, track expenses, and calculate net profit.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'entry' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('entry')}
          >
            Entry Form
          </button>
          <button 
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'summary' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button 
            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setActiveTab('history')}
          >
            History
          </button>
        </div>
      </div>

      {activeTab === 'entry' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Shift Details</h3>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => handleSimpleChange('date', e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Fuel Sales ($)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.keys(formData.fuel).map(key => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 capitalize">{key}</label>
                        <input type="number" min="0" value={formData.fuel[key] || ''} onChange={(e) => handleInputChange('fuel', key, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-primary" />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Store Sales ($)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.keys(formData.store).map(key => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                        <input type="number" min="0" value={formData.store[key] || ''} onChange={(e) => handleInputChange('store', key, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-primary" />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Daily Expenses ($)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.keys(formData.expenses).map(key => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-slate-600 mb-1.5 capitalize">{key}</label>
                        <input type="number" min="0" value={formData.expenses[key] || ''} onChange={(e) => handleInputChange('expenses', key, e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-primary" />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Cost of Goods Sold ($)</h4>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estimated Daily COGS</label>
                    <input type="number" min="0" value={formData.cogs || ''} onChange={(e) => handleSimpleChange('cogs', e.target.value)} className="w-full md:w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-900 focus:outline-none focus:border-primary" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Sidebar */}
          <div className="lg:col-span-1">
            <div className="glass-panel p-6 sticky top-8">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Live Calculation</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-500">Fuel Revenue</span>
                  <span className="text-sm font-mono font-bold text-slate-900">${calculatedData.fuelRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm font-semibold text-slate-500">Store Revenue</span>
                  <span className="text-sm font-mono font-bold text-slate-900">${calculatedData.storeRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-slate-50 rounded-lg px-3 border border-slate-100">
                  <span className="text-sm font-bold text-slate-700">Total Revenue</span>
                  <span className="text-sm font-mono font-bold text-primary">${calculatedData.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                
                <div className="pt-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-500">Total Expenses</span>
                    <span className="text-sm font-mono font-bold text-rose-500">-${calculatedData.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-500">COGS</span>
                    <span className="text-sm font-mono font-bold text-rose-500">-${formData.cogs.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Projected Net Profit</p>
                  <p className="text-3xl font-black text-emerald-700 tracking-tighter">${calculatedData.netProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                </div>
              </div>

              <button 
                onClick={handleSaveClose}
                className="w-full btn-primary mt-8 py-3 text-base"
              >
                <Save className="w-5 h-5" /> Save Daily Close
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'summary' && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
          <div className="glass-panel p-8 text-center bg-gradient-to-b from-white to-slate-50">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
              <ClipboardCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Closing Summary</h3>
            <p className="text-slate-500 font-medium mt-1">Review your business performance for {formData.date}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-6 flex flex-col justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Gross Revenue</p>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-black text-slate-900 tracking-tighter">${calculatedData.totalRevenue.toLocaleString()}</p>
                <TrendingUp className="w-6 h-6 text-emerald-500 mb-1" />
              </div>
            </div>
            
            <div className="glass-panel p-6 flex flex-col justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Total Deductions</p>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-black text-rose-600 tracking-tighter">${(calculatedData.totalExpenses + formData.cogs).toLocaleString()}</p>
                <TrendingDown className="w-6 h-6 text-rose-500 mb-1" />
              </div>
            </div>

            <div className="glass-panel p-6 flex flex-col justify-between bg-emerald-50 border-emerald-200/60 shadow-sm">
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4">Net Profit</p>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-black text-emerald-700 tracking-tighter">${calculatedData.netProfit.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-6 flex items-center justify-between border-l-4 border-l-primary">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Top Performing Category</p>
                <p className="text-xl font-bold text-slate-900 capitalize">{calculatedData.highest.name.replace(/([A-Z])/g, ' $1')}</p>
              </div>
              <p className="text-2xl font-mono font-bold text-primary">${calculatedData.highest.val.toLocaleString()}</p>
            </div>
            <div className="glass-panel p-6 flex items-center justify-between border-l-4 border-l-rose-400">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Lowest Performing Category</p>
                <p className="text-xl font-bold text-slate-900 capitalize">{calculatedData.lowest.name.replace(/([A-Z])/g, ' $1')}</p>
              </div>
              <p className="text-2xl font-mono font-bold text-rose-500">${calculatedData.lowest.val.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'history' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* History Chart */}
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Profit & Revenue Trends</h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="date" stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} dy={10} />
                  <YAxis stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="Revenue" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="Profit" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <History className="w-5 h-5 text-slate-400" />
                Closing Logs
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4 text-right">Revenue</th>
                    <th className="px-6 py-4 text-right">Expenses</th>
                    <th className="px-6 py-4 text-right">Net Profit</th>
                    <th className="px-6 py-4">Top Category</th>
                    <th className="px-6 py-4">Bottom Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                  {dailyHistory.map((entry) => (
                    <tr key={entry.id} className="table-row group">
                      <td className="px-6 py-4 font-semibold text-slate-900 flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {entry.date}
                      </td>
                      <td className="px-6 py-4 font-mono font-semibold text-slate-700 text-right">${entry.totalRevenue.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                      <td className="px-6 py-4 font-mono font-semibold text-rose-500 text-right">-${entry.totalExpenses.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                      <td className="px-6 py-4 font-mono font-bold text-emerald-600 text-right">${entry.netProfit.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                      <td className="px-6 py-4 text-slate-600 font-medium capitalize">{entry.highestCategory}</td>
                      <td className="px-6 py-4 text-slate-500 text-xs capitalize">{entry.lowestCategory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
