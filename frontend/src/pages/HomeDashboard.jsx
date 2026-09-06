import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Droplets, Package, ShoppingCart, BarChart3, 
  ClipboardCheck, Truck, Users, Settings as POSIcon, 
  ShieldAlert, Settings, TrendingUp, DollarSign 
} from 'lucide-react';
import { useData } from '../context/DataContext';

export default function HomeDashboard() {
  const navigate = useNavigate();
  const { currentUser, calculateKPIs } = useData();

  const firstName = currentUser?.name?.split(' ')[0] || 'User';
  const kpis = calculateKPIs();
  const profitMargin = kpis.revenue > 0 ? (kpis.profit / kpis.revenue) * 100 : 0;

  const modules = [
    { 
      name: 'Fuel Management', 
      desc: 'Track fuel sales, tanks, and pricing', 
      path: '/fuel', 
      icon: Droplets, 
      color: 'bg-orange-100 text-orange-600', 
      shadow: 'hover:shadow-orange-500/20',
      stat: `Fuel Sold: ${kpis.gallons.toLocaleString()} gal`
    },
    { 
      name: 'Inventory', 
      desc: 'Manage SKUs, margins, and stock levels', 
      path: '/inventory', 
      icon: Package, 
      color: 'bg-blue-100 text-blue-600',
      shadow: 'hover:shadow-blue-500/20',
      stat: `Low Stock: ${kpis.lowStockCount} items`
    },
    { 
      name: 'Sales Terminal', 
      desc: 'Process transactions and view receipts', 
      path: '/sales-terminal', 
      icon: ShoppingCart, 
      color: 'bg-emerald-100 text-emerald-600',
      shadow: 'hover:shadow-emerald-500/20',
      stat: `Revenue: $${kpis.revenue.toLocaleString()}`
    },
    { 
      name: 'Reports & Analytics', 
      desc: 'Deep dive into revenue and profit metrics', 
      path: '/reports', 
      icon: BarChart3, 
      color: 'bg-purple-100 text-purple-600',
      shadow: 'hover:shadow-purple-500/20',
      stat: `Profit Margin: ${profitMargin.toFixed(1)}%`
    },
    { 
      name: 'Daily Closing', 
      desc: 'Reconcile shifts and cash registers', 
      path: '/daily-close', 
      icon: ClipboardCheck, 
      color: 'bg-indigo-100 text-indigo-600',
      shadow: 'hover:shadow-indigo-500/20',
      stat: 'Status: Pending'
    },
    { 
      name: 'Vendors', 
      desc: 'Manage supplier contacts and orders', 
      path: '/vendors', 
      icon: Truck, 
      color: 'bg-cyan-100 text-cyan-600',
      shadow: 'hover:shadow-cyan-500/20',
      stat: 'Database-backed'
    },
    { 
      name: 'Employees', 
      desc: 'Manage staff, roles, and access', 
      path: '/employees', 
      icon: Users, 
      color: 'bg-pink-100 text-pink-600',
      shadow: 'hover:shadow-pink-500/20',
      stat: 'Database-backed'
    },
    { 
      name: 'POS Integration', 
      desc: 'Sync external POS data and APIs', 
      path: '/pos-integration', 
      icon: POSIcon, 
      color: 'bg-teal-100 text-teal-600',
      shadow: 'hover:shadow-teal-500/20',
      stat: 'CSV/API ready'
    },
    { 
      name: 'Audit Logs', 
      desc: 'Review security events and changes', 
      path: '/audit-logs', 
      icon: ShieldAlert, 
      color: 'bg-rose-100 text-rose-600',
      shadow: 'hover:shadow-rose-500/20',
      stat: 'Persisted history'
    },
    { 
      name: 'Settings', 
      desc: 'Configure platform preferences', 
      path: '/billing', 
      icon: Settings, 
      color: 'bg-slate-100 text-slate-600',
      shadow: 'hover:shadow-slate-500/20',
      stat: 'All Systems Normal'
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* HEADER SECTION */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-200/60"
      >
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-slate-500 font-medium mt-1">Here is what is happening across your operations today.</p>
        </div>
        <div className="flex gap-6">
          <div className="flex items-center gap-4 bg-emerald-50 px-5 py-3 rounded-xl border border-emerald-100">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm shadow-emerald-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Today's Revenue</p>
              <p className="text-xl font-black text-slate-900">${kpis.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-blue-50 px-5 py-3 rounded-xl border border-blue-100">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-sm shadow-blue-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Net Profit</p>
              <p className="text-xl font-black text-slate-900">${kpis.profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* MODULES GRID */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Quick Access Modules</h2>
        </div>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {modules.map((mod) => (
            <motion.button
              key={mod.name}
              variants={itemVariants}
              whileHover={{ y: -5, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(mod.path)}
              className={`text-left bg-white p-6 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 transition-all duration-300 group flex flex-col justify-between min-h-[180px] ${mod.shadow}`}
            >
              <div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${mod.color}`}>
                  <mod.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{mod.name}</h3>
                <p className="text-sm text-slate-500 font-medium mt-1 leading-snug">{mod.desc}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600 uppercase tracking-wider">
                  {mod.stat}
                </span>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
