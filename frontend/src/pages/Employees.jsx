import { useState } from 'react';
import { Edit2, Eye, Loader2, Plus, Trash2, UserRound, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { employeeService } from '../services/api';

const SHIFTS = ['Morning (6AM-2PM)', 'Evening (2PM-10PM)', 'Night (10PM-6AM)', 'All'];
const EMPTY_FORM = { name: '', email: '', password: '', role: 'STAFF', shift: SHIFTS[0] };

export default function Employees() {
  const { employees, activeStoreId, currentUser, refreshStoreData } = useData();
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openAdd = () => { setSelected(null); setForm(EMPTY_FORM); setError(''); setModal('form'); };
  const openEdit = (employee) => {
    if (employee.role === 'Owner') return;
    setSelected(employee);
    setForm({ name: employee.name || '', email: employee.email || '', password: '', role: employee.role === 'Manager' ? 'MANAGER' : 'STAFF', shift: employee.shift || SHIFTS[0] });
    setError('');
    setModal('form');
  };
  const openView = (employee) => { setSelected(employee); setError(''); setModal('view'); };
  const closeModal = () => { if (!saving) setModal(null); };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, storeId: activeStoreId };
      if (!payload.password) delete payload.password;
      if (selected) await employeeService.update(selected.id, payload);
      else await employeeService.create(payload);
      await refreshStoreData(activeStoreId);
      setModal(null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to save employee.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (employee) => {
    if (employee.id === currentUser?.id) return;
    if (!window.confirm(`Delete ${employee.name}? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    try {
      await employeeService.remove(employee.id);
      await refreshStoreData(activeStoreId);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to delete employee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-2"><div><h2 className="text-2xl font-bold text-slate-900 tracking-tight">Employee Management</h2><p className="text-slate-500 font-medium mt-1">Manage staff roles, shifts, and performance.</p></div><button onClick={openAdd} className="btn-primary"><Plus className="w-5 h-5" /> Add Employee</button></div>
      {error && !modal && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>}
      <div className="glass-panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="table-header"><tr><th className="px-6 py-4">Employee</th><th className="px-6 py-4">Role</th><th className="px-6 py-4">Shift</th><th className="px-6 py-4 text-right">Sales Handled</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100/50">
        {employees.map((employee) => <tr key={employee.id} className="table-row group"><td className="px-6 py-4"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-500 font-bold text-sm"><UserRound className="w-4 h-4" /></div><div><span className="font-semibold text-slate-900">{employee.name}</span><p className="text-xs text-slate-400 mt-0.5">{employee.email}</p></div></div></td><td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex w-fit ${employee.role === 'Owner' ? 'bg-primary/10 text-primary border-primary/20' : employee.role === 'Manager' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{employee.role}</span></td><td className="px-6 py-4 text-slate-500 font-medium">{employee.shift || 'No shift'}</td><td className="px-6 py-4 font-mono text-slate-700 font-semibold text-right">${Number(employee.salesHandled || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200"><button title="View employee" onClick={() => openView(employee)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors"><Eye className="w-4 h-4" /></button><button title={employee.role === 'Owner' ? 'Owner account cannot be edited here' : 'Edit employee'} disabled={employee.role === 'Owner'} onClick={() => openEdit(employee)} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-md transition-colors disabled:opacity-30"><Edit2 className="w-4 h-4" /></button><button title="Delete employee" disabled={employee.role === 'Owner' || employee.id === currentUser?.id || saving} onClick={() => handleDelete(employee)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-30"><Trash2 className="w-4 h-4" /></button></div></td></tr>)}
      </tbody></table>{employees.length === 0 && <div className="p-12 text-center font-medium text-slate-500">No employees found.</div>}</div></div>

      {modal && <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl"><div className="p-6 border-b border-slate-100 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-900 tracking-tight">{modal === 'view' ? 'Employee Details' : selected ? 'Edit Employee' : 'Add New Employee'}</h3><button onClick={closeModal} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button></div>
        {modal === 'view' ? <div className="p-6 space-y-4 text-sm"><div><p className="text-slate-400 font-semibold uppercase text-xs">Name</p><p className="font-semibold text-slate-900 mt-1">{selected.name}</p></div><div><p className="text-slate-400 font-semibold uppercase text-xs">Email</p><p className="font-medium text-slate-700 mt-1">{selected.email}</p></div><div className="grid grid-cols-2 gap-4"><div><p className="text-slate-400 font-semibold uppercase text-xs">Role</p><p className="font-medium text-slate-700 mt-1">{selected.role}</p></div><div><p className="text-slate-400 font-semibold uppercase text-xs">Shift</p><p className="font-medium text-slate-700 mt-1">{selected.shift || 'No shift'}</p></div></div><button onClick={closeModal} className="w-full btn-secondary mt-2">Close</button></div> : <form onSubmit={handleSubmit} className="p-6 space-y-5">{error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}<div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label><input required minLength="2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" /></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Email</label><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input" /></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Password {selected && <span className="font-normal text-slate-400">(leave blank to keep current)</span>}</label><input required={!selected} minLength="6" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="input" /></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Role</label><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="input"><option value="STAFF">Staff</option><option value="MANAGER">Manager</option></select></div><div><label className="block text-sm font-semibold text-slate-700 mb-1.5">Shift</label><select value={form.shift} onChange={(event) => setForm({ ...form, shift: event.target.value })} className="input">{SHIFTS.map((shift) => <option key={shift}>{shift}</option>)}</select></div><div className="flex gap-3 pt-4"><button type="button" onClick={closeModal} className="flex-1 btn-secondary">Cancel</button><button type="submit" disabled={saving} className="flex-1 btn-primary">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving</> : selected ? 'Update Employee' : 'Save Employee'}</button></div></form>}
      </div></div>}
    </div>
  );
}
