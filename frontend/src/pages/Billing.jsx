import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Zap, Building2, Crown, Shield } from 'lucide-react';
import { useData } from '../context/DataContext';

export default function Billing() {
  const { subscription } = useData();
  const [message, setMessage] = useState('');

  const plans = [
    {
      name: 'Basic',
      price: '$99',
      interval: '/month',
      description: 'Perfect for a single gas station or small C-store.',
      icon: Zap,
      features: ['1 Store Location', 'Basic Reporting', 'Up to 5 Employees', 'Standard Email Support']
    },
    {
      name: 'Pro',
      price: '$249',
      interval: '/month',
      description: 'Ideal for growing businesses with multiple locations.',
      icon: Building2,
      features: ['Up to 5 Store Locations', 'Advanced Analytics', 'Loss Prevention Alerts', 'Unlimited Employees', 'Priority Support']
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      interval: '',
      description: 'Custom solutions for large fuel networks.',
      icon: Crown,
      features: ['Unlimited Locations', 'Custom API Access', 'White-labeling', 'Dedicated Account Manager', 'SLA Guarantee']
    }
  ];

  return (
    <div className="space-y-8 pb-12 max-w-6xl mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Billing & Subscriptions</h2>
        <p className="text-slate-500 font-medium mt-3 text-lg">Manage your FuelOps Pro SaaS subscription, upgrade your plan, and unlock multi-store features.</p>
      </div>

      {message && <div className="mx-auto max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-800">{message}</div>}

      {/* Current Plan Status */}
      <div className="glass-panel p-8 flex items-center justify-between border-blue-200 shadow-sm bg-blue-50/30">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-1">Current Plan</p>
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">FuelOps {subscription.plan}</h3>
            <p className="text-slate-500 font-medium mt-1">Your next billing date is May 27, 2026</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            {subscription.status}
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan, i) => {
          const isCurrent = subscription.plan === plan.name;
          return (
            <motion.div 
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative glass-panel p-8 flex flex-col ${isCurrent ? 'border-blue-500 ring-4 ring-blue-500/10' : 'hover:border-slate-300'}`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest py-1 px-4 rounded-full shadow-md">
                  Current Plan
                </div>
              )}
              
              <div className="mb-6">
                <plan.icon className={`w-8 h-8 mb-4 ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`} />
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-sm text-slate-500 mt-2 h-10">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-black text-slate-900 tracking-tighter">{plan.price}</span>
                <span className="text-slate-500 font-medium">{plan.interval}</span>
              </div>

              <div className="flex-1 space-y-4 mb-8">
                {plan.features.map(feature => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 shrink-0 ${isCurrent ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span className="text-sm font-medium text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setMessage(`${plan.name} checkout is not configured yet. Connect a billing provider before changing subscriptions.`)} className={`w-full py-3 rounded-xl font-bold transition-all shadow-sm ${
                isCurrent 
                  ? 'bg-slate-100 text-slate-400 cursor-default' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md'
              }`}>
                {isCurrent ? 'Current Plan' : 'Upgrade Plan'}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
