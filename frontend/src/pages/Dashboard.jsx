import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Droplets, AlertCircle, Sparkles, AlertTriangle, Building2 } from 'lucide-react';
import { useData } from '../context/DataContext';

export default function Dashboard() {
  const { calculateKPIs, getSmartInsights, hourlyTrends, shrinkageLogs, activeStoreId, getHQStats } = useData();
  
  if (activeStoreId === 'hq') {
    const hqStats = getHQStats();
    return (
      <div className="space-y-8 pb-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
              Global HQ Overview
            </h2>
            <p className="text-slate-500 font-medium mt-1">Compare performance across all locations.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <KPICard title="Global Revenue" value={`$${hqStats.totalRevenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" />
          <KPICard title="Global Net Profit" value={`$${hqStats.totalProfit.toLocaleString()}`} icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-6">Store Comparison (Revenue)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hqStats.storeComparisons} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#0F172A', fontWeight: 600 }}
                  cursor={{fill: '#F1F5F9'}}
                />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={60} />
                <Bar dataKey="profit" fill="#10B981" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  const kpis = calculateKPIs();
  const insights = getSmartInsights();

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Daily Overview</h2>
          <p className="text-slate-500 font-medium mt-1">Real-time store and fuel performance.</p>
        </div>
        <div className="text-sm font-bold text-slate-700 bg-white px-5 py-2.5 rounded-lg border border-slate-200/60 shadow-sm">
          {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard title="Total Revenue" value={`$${kpis.revenue.toLocaleString()}`} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-50" border="border-emerald-200" />
        <KPICard title="Net Profit" value={`$${kpis.profit.toLocaleString()}`} icon={TrendingUp} color="text-blue-600" bg="bg-blue-50" border="border-blue-200" />
        <KPICard title="Fuel Sold" value={`${kpis.gallons.toLocaleString()} gal`} icon={Droplets} color="text-amber-600" bg="bg-amber-50" border="border-amber-200" />
        <KPICard title="Low Stock Items" value={kpis.lowStockCount} icon={AlertCircle} color="text-rose-600" bg="bg-rose-50" border="border-rose-200" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Sales Chart */}
        <div className="lg:col-span-2 glass-panel p-6 flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight mb-6">Hourly Sales Trend</h3>
          <div className="h-80 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="time" stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#94A3B8" tick={{fill: '#64748B', fontSize: 12, fontWeight: 500}} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#0F172A', fontWeight: 600 }}
                  labelStyle={{ color: '#64748B', fontWeight: 500, marginBottom: '4px' }}
                />
                <Area type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Intelligence / Insights */}
        <div className="glass-panel p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Smart Insights</h3>
          </div>
          
          <div className="flex-1 space-y-4">
            {insights.map((insight, idx) => (
              <motion.div 
                key={insight.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`p-4 rounded-xl border ${
                  insight.type === 'success' ? 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800' :
                  insight.type === 'danger' ? 'bg-rose-50/50 border-rose-200/60 text-rose-800' :
                  'bg-amber-50/50 border-amber-200/60 text-amber-800'
                } shadow-sm`}
              >
                <div className="flex gap-3">
                  {insight.type === 'danger' && <TrendingDown className="w-5 h-5 shrink-0 text-rose-500" />}
                  {insight.type === 'warning' && <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />}
                  {insight.type === 'success' && <TrendingUp className="w-5 h-5 shrink-0 text-emerald-500" />}
                  <p className="text-sm font-medium leading-relaxed">{insight.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Loss Prevention Alerts */}
      <div className="glass-panel overflow-hidden border-rose-200 shadow-sm">
        <div className="p-5 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
          <h3 className="font-bold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            Active Loss & Shrinkage Alerts
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-500 text-xs uppercase font-bold tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Item / Tank</th>
                <th className="px-6 py-4">Expected Count</th>
                <th className="px-6 py-4">Actual Count</th>
                <th className="px-6 py-4 text-rose-600">Loss Amount</th>
                <th className="px-6 py-4 text-right">Financial Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/50 bg-white">
              {shrinkageLogs?.map((log) => (
                <tr key={log.id} className="table-row group">
                  <td className="px-6 py-4 font-semibold text-slate-900">{log.name}</td>
                  <td className="px-6 py-4 font-mono text-slate-500">{log.expected}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{log.actual}</td>
                  <td className="px-6 py-4 font-mono font-bold text-rose-600">-{log.lossQty}</td>
                  <td className="px-6 py-4 font-mono font-bold text-rose-600 text-right">
                    ${log.lossValue.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </td>
                </tr>
              ))}
              {(!shrinkageLogs || shrinkageLogs.length === 0) && (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500 font-medium bg-white">
                    No shrinkage alerts detected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon: Icon, color, bg, border }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-6 flex flex-col justify-between group cursor-pointer hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</p>
        <div className={`w-10 h-10 rounded-lg ${bg} border ${border} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <div>
        <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
      </div>
    </motion.div>
  );
}
