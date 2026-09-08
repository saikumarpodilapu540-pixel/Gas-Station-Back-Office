import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Download, FileText, RefreshCw, Truck, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { settlementService, transferService } from '../services/api';

const key = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const errorText = (error, fallback) => error.response?.data?.error || error.message || fallback;

export default function Transfers() {
  const { activeStoreId, inventory } = useData();
  const [stores, setStores] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [checkTransfer, setCheckTransfer] = useState(null);
  const [checkForm, setCheckForm] = useState({ checkNumber: '', amount: '', checkDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [destinationStoreId, setDestinationStoreId] = useState('');
  const [line, setLine] = useState({ inventoryId: '', packageId: '', location: 'BACKROOM', quantity: 1 });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const otherStores = useMemo(() => stores.filter((store) => store.id !== activeStoreId), [activeStoreId, stores]);
  const effectiveDestinationStoreId = destinationStoreId || otherStores[0]?.id || '';
  const effectiveInventoryId = line.inventoryId || inventory[0]?.id || '';
  const selectedInventory = inventory.find((item) => item.id === effectiveInventoryId);
  const packages = selectedInventory?.catalog?.packages || [];
  const effectivePackageId = line.packageId || packages.find((pack) => pack.unitsPerPackage === 1)?.id || packages[0]?.id || '';

  const refresh = async () => {
    if (!activeStoreId || activeStoreId === 'hq') return;
    setLoading(true);
    try {
      const [storeResponse, transferResponse, settlementResponse] = await Promise.all([
        transferService.getStores(), transferService.getAll(), settlementService.getAll()
      ]);
      setStores(storeResponse.data);
      setTransfers(transferResponse.data);
      setSettlements(settlementResponse.data);
      setMessage('');
    } catch (error) {
      setMessage(errorText(error, 'Unable to load transfer records.'));
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [activeStoreId]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const create = async (event) => {
    event.preventDefault(); setMessage('');
    if (!activeStoreId || activeStoreId === 'hq') return setMessage('Select a source store first.');
    if (!effectiveDestinationStoreId || !effectiveInventoryId || !effectivePackageId) return setMessage('Choose destination, product, and packaging.');
    try {
      await transferService.create({ sourceStoreId: activeStoreId, destinationStoreId: effectiveDestinationStoreId, notes: 'Internal stock transfer', lines: [{ ...line, inventoryId: effectiveInventoryId, packageId: effectivePackageId, quantity: Number(line.quantity) }] }, key('transfer-create'));
      setMessage('Transfer draft created. Reserve it, then dispatch it when the stock leaves the source store.');
      await refresh();
    } catch (error) { setMessage(errorText(error, 'Unable to create transfer.')); }
  };

  const transition = async (id, action, body = {}) => {
    setMessage('');
    try { await transferService.transition(id, action, body, key(`transfer-${action}`)); await refresh(); }
    catch (error) { setMessage(errorText(error, `Unable to ${action} transfer.`)); }
  };

  const receive = async (transfer) => {
    const lines = transfer.lines.filter((item) => item.quantity > item.received + item.returned + item.damaged).map((item) => ({ lineId: item.id, quantity: item.quantity - item.received - item.returned - item.damaged }));
    if (!lines.length) return;
    await transition(transfer.id, 'receipt', { kind: 'RECEIVE', location: 'BACKROOM', notes: 'Received at destination store', lines });
  };

  const download = async (id, number) => {
    try {
      const response = await transferService.downloadPdf(id);
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${number || 'transfer'}.pdf`; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(errorText(error, 'Unable to download receipt.')); }
  };

  const issueCheck = async (event) => {
    event.preventDefault(); setMessage('');
    try {
      // The destination store pays the source store, so fromStoreId is B and toStoreId is A.
      await settlementService.create({ fromStoreId: checkTransfer.destinationStoreId, toStoreId: checkTransfer.sourceStoreId, checkNumber: checkForm.checkNumber, checkDate: checkForm.checkDate, amount: Number(checkForm.amount), notes: checkForm.notes, allocations: [{ transferId: checkTransfer.id, amount: Number(checkForm.amount) }] }, key('settlement-create'));
      setCheckTransfer(null); setMessage('Check recorded as issued. Mark it deposited and cleared as it moves through the bank.'); await refresh();
    } catch (error) { setMessage(errorText(error, 'Unable to record check.')); }
  };

  if (!activeStoreId || activeStoreId === 'hq') return <div className="glass-panel p-8 text-slate-600">Select one store to manage internal transfers.</div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">Store Transfers</h2><p className="text-slate-500 mt-1">Move stock between stores at cost and keep the receipt and check trail together.</p></div><button onClick={refresh} className="btn-secondary flex items-center gap-2" disabled={loading}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
    {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{message}</div>}
    <form onSubmit={create} className="glass-panel p-6 space-y-4"><div className="flex items-center gap-2"><Truck className="w-5 h-5 text-primary" /><h3 className="font-bold text-slate-900">Create a cost transfer</h3></div><div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <label className="text-sm font-semibold text-slate-700">Destination<select value={effectiveDestinationStoreId} onChange={(event) => setDestinationStoreId(event.target.value)} className="input mt-1.5"><option value="">Choose store</option>{otherStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Product<select value={effectiveInventoryId} onChange={(event) => setLine({ ...line, inventoryId: event.target.value, packageId: '' })} className="input mt-1.5"><option value="">Choose product</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.productName} ({item.availableQuantity ?? item.stockQuantity} units)</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Packaging<select value={effectivePackageId} onChange={(event) => setLine({ ...line, packageId: event.target.value })} className="input mt-1.5"><option value="">Choose package</option>{packages.map((pack) => <option key={pack.id} value={pack.id}>{pack.name} ({pack.unitsPerPackage} units)</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Quantity<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => setLine({ ...line, quantity: event.target.value })} className="input mt-1.5" /></label>
    </div><button type="submit" className="btn-primary flex items-center gap-2"><ArrowRight className="w-4 h-4" /> Create draft</button></form>
    <div className="glass-panel overflow-hidden"><div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="font-bold text-slate-900">Transfer register</h3><span className="text-xs text-slate-500">Cost price is locked when dispatched</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="table-header"><tr><th className="px-6 py-4">Receipt</th><th className="px-6 py-4">Route</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Amount due</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100/50">{transfers.map((transfer) => <tr key={transfer.id} className="table-row"><td className="px-6 py-4 font-mono text-xs font-semibold">{transfer.number}</td><td className="px-6 py-4">{stores.find((store) => store.id === transfer.sourceStoreId)?.name || 'Source'} <ArrowRight className="inline w-3 h-3 mx-1" /> {stores.find((store) => store.id === transfer.destinationStoreId)?.name || 'Destination'}</td><td className="px-6 py-4"><span className="badge badge-info">{transfer.status}</span></td><td className="px-6 py-4 text-right font-semibold">{money(transfer.amountDue)}</td><td className="px-6 py-4"><div className="flex justify-end gap-2"><button title="Download receipt" onClick={() => download(transfer.id, transfer.number)} className="p-2 text-slate-500 hover:text-primary"><Download className="w-4 h-4" /></button>{transfer.status === 'DRAFT' && <button onClick={() => transition(transfer.id, 'reserve')} className="btn-secondary text-xs">Reserve</button>}{transfer.status === 'RESERVED' && <button onClick={() => transition(transfer.id, 'dispatch')} className="btn-primary text-xs">Dispatch</button>}{['DISPATCHED','PARTIAL'].includes(transfer.status) && <button onClick={() => receive(transfer)} className="btn-primary text-xs">Receive</button>}{['DISPATCHED','PARTIAL','RECEIVED'].includes(transfer.status) && Number(transfer.unallocated || 0) > 0 && <button onClick={() => { setCheckTransfer(transfer); setCheckForm({ checkNumber: '', amount: Number(transfer.unallocated || 0).toFixed(2), checkDate: new Date().toISOString().slice(0, 10), notes: '' }); }} className="btn-secondary text-xs">Issue check</button>}{['DRAFT','RESERVED'].includes(transfer.status) && <button onClick={() => transition(transfer.id, 'cancel')} className="p-2 text-rose-600 hover:bg-rose-50 rounded"><X className="w-4 h-4" /></button>}</div></td></tr>)}</tbody></table>{!transfers.length && <div className="p-10 text-center text-slate-500">No transfers yet.</div>}</div></div>
    <div className="glass-panel overflow-hidden"><div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /><h3 className="font-bold text-slate-900">Checks and settlements</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="table-header"><tr><th className="px-6 py-4">Check</th><th className="px-6 py-4">Amount</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Date</th></tr></thead><tbody className="divide-y divide-slate-100/50">{settlements.map((settlement) => <tr key={settlement.id}><td className="px-6 py-4 font-mono">{settlement.checkNumber}</td><td className="px-6 py-4">{money(settlement.amount)}</td><td className="px-6 py-4"><span className="badge badge-info">{settlement.status}</span></td><td className="px-6 py-4">{settlement.checkDate?.slice(0, 10)}</td></tr>)}</tbody></table>{!settlements.length && <div className="p-8 text-center text-slate-500">Checks appear here after the destination issues one against a dispatched transfer.</div>}</div></div>
    {checkTransfer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><form onSubmit={issueCheck} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4"><div className="flex items-center justify-between"><div><h3 className="text-xl font-bold text-slate-900">Issue store check</h3><p className="text-sm text-slate-500">Destination pays source · {checkTransfer.number}</p></div><button type="button" onClick={() => setCheckTransfer(null)}><X className="w-5 h-5 text-slate-400" /></button></div><label className="block text-sm font-semibold">Check number<input required value={checkForm.checkNumber} onChange={(event) => setCheckForm({ ...checkForm, checkNumber: event.target.value })} className="input mt-1.5" /></label><label className="block text-sm font-semibold">Amount due<input required type="number" min="0.01" max={Number(checkTransfer.unallocated || checkTransfer.amountDue)} step="0.01" value={checkForm.amount || Number(checkTransfer.unallocated || 0).toFixed(2)} onChange={(event) => setCheckForm({ ...checkForm, amount: event.target.value })} className="input mt-1.5" /></label><label className="block text-sm font-semibold">Check date<input required type="date" value={checkForm.checkDate} onChange={(event) => setCheckForm({ ...checkForm, checkDate: event.target.value })} className="input mt-1.5" /></label><label className="block text-sm font-semibold">Notes<textarea value={checkForm.notes} onChange={(event) => setCheckForm({ ...checkForm, notes: event.target.value })} className="input mt-1.5" rows="2" /></label><div className="flex gap-3 pt-2"><button type="button" onClick={() => setCheckTransfer(null)} className="flex-1 btn-secondary">Cancel</button><button type="submit" className="flex-1 btn-primary">Record issued check</button></div></form></div>}
  </div>;
}
