import { motion } from 'framer-motion';
import { Fuel, TrendingUp, AlertTriangle, Truck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useState } from 'react';
import { fuelService } from '../services/api';

export default function FuelManagement() {
  const { fuelTanks, addFuelDelivery, recordPhysicalCount, activeStoreId } = useData();
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [delivery, setDelivery] = useState({ id: fuelTanks[0]?.id || '', gallons: 1000 });
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [audit, setAudit] = useState({ id: fuelTanks[0]?.id || '', gallons: 0 });

  const openDeliveryModal = () => {
    setDelivery((current) => ({ ...current, id: current.id || fuelTanks[0]?.id || '' }));
    setShowDeliveryModal(true);
  };

  const openAuditModal = () => {
    setAudit((current) => ({ ...current, id: current.id || fuelTanks[0]?.id || '' }));
    setShowAuditModal(true);
  };

  const handleDeliverySubmit = async (e) => {
    e.preventDefault();
    if (delivery.id && delivery.gallons > 0) {
      try {
        const tank = fuelTanks.find(t => String(t.id) === String(delivery.id));
        const fuel_type = tank ? tank.type : 'Regular';
        
        await fuelService.recordLog({
          store_id: activeStoreId,
          fuel_type: fuel_type,
          gallons_received: parseFloat(delivery.gallons),
          date: new Date().toISOString()
        });
        
        await addFuelDelivery();
        setShowDeliveryModal(false);
        setDelivery({ ...delivery, gallons: 1000 });
        alert("Fuel delivery recorded successfully!");
      } catch (error) {
        const errorMsg = error.response?.data?.error || error.message;
        console.error("Failed to record fuel delivery", error);
        alert(`Failed to record delivery: ${errorMsg}`);
      }
    }
  };

  const handleAuditSubmit = async (e) => {
    e.preventDefault();
    if (audit.id && audit.gallons >= 0) {
      try {
        await recordPhysicalCount('fuel', audit.id, parseFloat(audit.gallons));
        setShowAuditModal(false);
        setAudit({ ...audit, gallons: 0 });
      } catch (error) {
        alert(error.response?.data?.error || error.message || 'Unable to save tank audit.');
      }
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
              <Fuel className="w-5 h-5" />
            </div>
            Fuel Management
          </h2>
          <p className="text-slate-500 font-medium mt-1">Live tank levels, pricing, and automated profit calculations.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={openAuditModal}
            className="btn-secondary flex items-center gap-2 bg-white text-rose-600 border-rose-200 hover:bg-rose-50"
          >
            <AlertTriangle className="w-4 h-4" /> Tank Audit
          </button>
          <button 
            onClick={openDeliveryModal}
            className="btn-primary flex items-center gap-2"
          >
            <Truck className="w-4 h-4" /> Receive Fuel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {fuelTanks.map((tank, i) => {
          const fillPercentage = (tank.current / tank.capacity) * 100;
          const isLow = fillPercentage < 20;
          const profitMargin = ((tank.price - tank.cost) / tank.price * 100).toFixed(1);

          return (
            <motion.div 
              key={tank.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="glass-panel p-6 relative overflow-hidden group hover:border-slate-300 transition-colors"
            >
              {/* Dynamic Background Glow based on fuel type */}
              <div className={`absolute -right-20 -top-20 w-40 h-40 blur-3xl opacity-10 rounded-full transition-opacity group-hover:opacity-20 ${
                tank.type.includes('Regular') ? 'bg-amber-400' :
                tank.type.includes('Premium') ? 'bg-blue-500' :
                tank.type.includes('Dyed') ? 'bg-rose-400' : 'bg-emerald-400'
              }`}></div>

              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">{tank.type}</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">Capacity: {tank.capacity.toLocaleString()} gal</p>
                </div>
                {isLow ? (
                  <span className="badge badge-danger">
                    <AlertTriangle className="w-3 h-3" />
                    LOW TANK
                  </span>
                ) : (
                  <span className="badge badge-success">
                    HEALTHY
                  </span>
                )}
              </div>

              {/* Tank Level Visualizer */}
              <div className="mb-8 relative z-10">
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span className="text-slate-500">Current Level</span>
                  <span className={`font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                    {tank.current.toFixed(1).toLocaleString()} gal ({fillPercentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${fillPercentage}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      isLow ? 'bg-rose-500' : 
                      tank.type.includes('Premium') ? 'bg-blue-500' : 
                      'bg-amber-500'
                    }`}
                  ></motion.div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-100 relative z-10">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cost / Price</p>
                  <p className="font-mono text-slate-700 font-semibold text-sm">
                    ${tank.cost.toFixed(2)} <span className="text-slate-300 mx-1">→</span> <span className="text-slate-900">${tank.price.toFixed(2)}</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Sold</p>
                  <p className="font-bold text-slate-900 font-mono text-sm">{tank.totalSold.toFixed(1)} gal</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margin</p>
                  <p className="font-bold text-emerald-600 flex items-center gap-1 text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {profitMargin}%
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Fuel Delivery Modal */}
      {showDeliveryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Record Fuel Delivery</h3>
            </div>
            <form onSubmit={handleDeliverySubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fuel Grade</label>
                <select 
                  value={delivery.id}
                  onChange={e => setDelivery({...delivery, id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                >
                  {fuelTanks.map(tank => (
                    <option key={tank.id} value={tank.id}>{tank.type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Gallons Received</label>
                <input 
                  type="number" required min="1" step="0.1"
                  value={delivery.gallons}
                  onChange={e => setDelivery({...delivery, gallons: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowDeliveryModal(false)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Save Delivery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tank Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-rose-100 bg-rose-50/30 rounded-t-2xl">
              <h3 className="text-xl font-bold text-rose-900 tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Tank Reconciliation (Audit)
              </h3>
              <p className="text-sm text-rose-600/80 mt-1">Enter physical tank stick reading to detect loss.</p>
            </div>
            <form onSubmit={handleAuditSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fuel Tank</label>
                <select 
                  value={audit.id}
                  onChange={e => setAudit({...audit, id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm"
                >
                  {fuelTanks.map(tank => (
                    <option key={tank.id} value={tank.id}>{tank.type} (Expected: {tank.current.toFixed(1)} gal)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Actual Stick Reading (Gallons)</label>
                <input 
                  type="number" required min="0" step="0.1"
                  value={audit.gallons}
                  onChange={e => setAudit({...audit, gallons: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-sm"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAuditModal(false)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary bg-rose-600 hover:bg-rose-700 border-rose-700 shadow-rose-200">
                  Save Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
