import { useEffect, useState } from 'react';
import { CheckCircle2, FileSearch, Loader2, Upload, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { invoiceService } from '../services/api';

const key = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const errorText = (error, fallback) => error.response?.data?.error || error.message || fallback;
const today = () => new Date().toISOString().slice(0, 10);

export default function InvoiceInbox() {
  const { activeStoreId, inventory, vendors } = useData();
  const [documents, setDocuments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [selected, setSelected] = useState(null);
  const [approval, setApproval] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!activeStoreId || activeStoreId === 'hq') return;
    try {
      const [docs, posted] = await Promise.all([invoiceService.getAll(activeStoreId), invoiceService.getPurchases(activeStoreId)]);
      setDocuments(docs.data); setPurchases(posted.data);
    } catch (error) { setMessage(errorText(error, 'Unable to load invoice records.')); }
  };
  useEffect(() => { refresh(); }, [activeStoreId]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const upload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setMessage('');
    try {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await invoiceService.upload({ storeId: activeStoreId, filename: file.name, fileBase64: base64 });
      setSelected(response.data); setMessage('Invoice uploaded. Review the extracted draft before receiving stock.'); await refresh();
    } catch (error) { setMessage(errorText(error, 'Unable to upload invoice.')); }
    finally { setBusy(false); event.target.value = ''; }
  };

  const extract = async (document) => {
    setBusy(true); setMessage('');
    try { const response = await invoiceService.extract(document.id); setSelected(response.data); setMessage('Invoice draft extracted. Verify every line before approval.'); await refresh(); }
    catch (error) { setMessage(errorText(error, 'Extraction is unavailable; enter the invoice manually.')); }
    finally { setBusy(false); }
  };

  const openApproval = (document) => {
    const draft = document.extraction || document.reviewDraft || {};
    const lines = (draft.items?.length ? draft.items : [{}]).map((item) => {
      const match = inventory.find((entry) => (item.sku && entry.sku.toLowerCase() === item.sku.toLowerCase()) || entry.productName.toLowerCase().includes(String(item.description || '').toLowerCase())) || inventory[0];
      const pack = match?.catalog?.packages?.find((entry) => entry.unitsPerPackage === (Number(item.unitsPerPackage) || 1)) || match?.catalog?.packages?.find((entry) => entry.unitsPerPackage === 1);
      return { inventoryId: match?.id || '', packageId: pack?.id || '', location: 'BACKROOM', supplierDescription: item.description || '', quantity: Number(item.quantity || 1), unitCost: Number(item.unitCost || 0) };
    });
    setSelected(document); setApproval({ vendorId: vendors[0]?.id || '', invoiceNumber: draft.invoiceNumber || document.filename.replace(/\.[^.]+$/, ''), date: draft.date || today(), totalCost: Number(draft.totalCost || draft.subtotal || 0), extraCharges: Number(draft.extraCharges || 0), chargesTreatment: 'CAPITALIZE', lines });
  };

  const approve = async (event) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      await invoiceService.approve(selected.id, { vendorId: approval.vendorId, invoiceNumber: approval.invoiceNumber, date: approval.date, totalCost: Number(approval.totalCost), extraCharges: Number(approval.extraCharges), chargesTreatment: approval.chargesTreatment, reviewed: true, lines: approval.lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitCost: Number(line.unitCost) })) }, key('invoice-approve'));
      setApproval(null); setMessage('Invoice approved and stock received at cost.'); await refresh();
    } catch (error) { setMessage(errorText(error, 'Unable to approve invoice. Check the totals and line mapping.')); }
    finally { setBusy(false); }
  };

  if (!activeStoreId || activeStoreId === 'hq') return <div className="glass-panel p-8 text-slate-600">Select one store to manage supplier invoices.</div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">Invoice Inbox</h2><p className="text-slate-500 mt-1">Upload a supplier PDF or photo, review its draft, and post the approved cost into stock.</p></div><label className="btn-primary flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" /> {busy ? 'Working…' : 'Upload invoice'}<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={upload} className="hidden" disabled={busy} /></label></div>
    {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800">{message}</div>}
    <div className="glass-panel overflow-hidden"><div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900">Review queue</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="table-header"><tr><th className="px-6 py-4">File</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Uploaded</th><th className="px-6 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100/50">{documents.map((document) => <tr key={document.id} className="table-row"><td className="px-6 py-4 font-medium">{document.filename}</td><td className="px-6 py-4"><span className={`badge ${document.status === 'POSTED' ? 'badge-success' : document.status === 'FAILED' ? 'badge-danger' : 'badge-warning'}`}>{document.status}</span></td><td className="px-6 py-4 text-slate-500">{document.createdAt?.slice(0, 10)}</td><td className="px-6 py-4"><div className="flex justify-end gap-2">{document.status !== 'POSTED' && <button onClick={() => setSelected(document)} className="btn-secondary text-xs flex items-center gap-1"><FileSearch className="w-3 h-3" /> Review</button>}{document.status !== 'POSTED' && <button onClick={() => extract(document)} disabled={busy} className="btn-secondary text-xs">Extract</button>}{document.status !== 'POSTED' && <button onClick={() => openApproval(document)} className="btn-primary text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approve</button>}</div></td></tr>)}</tbody></table>{!documents.length && <div className="p-10 text-center text-slate-500">Upload the first supplier invoice for this store.</div>}</div></div>
    {selected && <div className="glass-panel p-6"><div className="flex items-center justify-between mb-4"><div><h3 className="font-bold text-slate-900">{selected.filename}</h3><p className="text-sm text-slate-500">AI output is an untrusted draft. Approval always requires your line mapping and total check.</p></div><button onClick={() => { setSelected(null); setApproval(null); }} className="p-2 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button></div><pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(selected.extraction || selected.reviewDraft || { message: 'No extracted draft. Use manual approval.' }, null, 2)}</pre></div>}
    {approval && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><form onSubmit={approve} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"><div className="flex justify-between items-center"><h3 className="text-xl font-bold">Approve invoice and receive stock</h3><button type="button" onClick={() => setApproval(null)}><X className="w-5 h-5 text-slate-400" /></button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="text-sm font-semibold">Vendor<select required value={approval.vendorId} onChange={(event) => setApproval({ ...approval, vendorId: event.target.value })} className="input mt-1.5"><option value="">Choose vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label className="text-sm font-semibold">Invoice number<input required value={approval.invoiceNumber} onChange={(event) => setApproval({ ...approval, invoiceNumber: event.target.value })} className="input mt-1.5" /></label><label className="text-sm font-semibold">Invoice date<input required type="date" value={approval.date} onChange={(event) => setApproval({ ...approval, date: event.target.value })} className="input mt-1.5" /></label><label className="text-sm font-semibold">Total cost<input required type="number" min="0" step="0.01" value={approval.totalCost} onChange={(event) => setApproval({ ...approval, totalCost: event.target.value })} className="input mt-1.5" /></label><label className="text-sm font-semibold">Extra charges<input type="number" min="0" step="0.01" value={approval.extraCharges} onChange={(event) => setApproval({ ...approval, extraCharges: event.target.value })} className="input mt-1.5" /></label><label className="text-sm font-semibold">Charges treatment<select value={approval.chargesTreatment} onChange={(event) => setApproval({ ...approval, chargesTreatment: event.target.value })} className="input mt-1.5"><option value="CAPITALIZE">Capitalize into inventory cost</option><option value="EXPENSE">Post as expense</option></select></label></div><div className="border-t border-slate-100 pt-4"><div className="flex items-center justify-between mb-3"><p className="text-sm font-bold text-slate-800">Invoice lines ({approval.lines.length})</p><button type="button" onClick={() => setApproval({ ...approval, lines: [...approval.lines, { inventoryId: '', packageId: '', location: 'BACKROOM', supplierDescription: '', quantity: 1, unitCost: 0 }] })} className="btn-secondary text-xs">Add line</button></div><div className="space-y-4">{approval.lines.map((line, index) => { const item = inventory.find((entry) => entry.id === line.inventoryId); return <div key={index} className="rounded-lg border border-slate-200 p-4"><div className="flex justify-between items-center mb-3"><span className="text-xs font-bold uppercase text-slate-400">Line {index + 1}</span>{approval.lines.length > 1 && <button type="button" onClick={() => setApproval({ ...approval, lines: approval.lines.filter((_, lineIndex) => lineIndex !== index) })} className="text-xs font-semibold text-rose-600">Remove</button>}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="text-sm font-semibold">Inventory item<select required value={line.inventoryId} onChange={(event) => { const nextItem = inventory.find((entry) => entry.id === event.target.value); const nextPack = nextItem?.catalog?.packages?.find((pack) => pack.unitsPerPackage === 1); const lines = [...approval.lines]; lines[index] = { ...line, inventoryId: event.target.value, packageId: nextPack?.id || '' }; setApproval({ ...approval, lines }); }} className="input mt-1.5"><option value="">Choose item</option>{inventory.map((entry) => <option key={entry.id} value={entry.id}>{entry.productName} ({entry.sku})</option>)}</select></label><label className="text-sm font-semibold">Packaging<select required value={line.packageId} onChange={(event) => { const lines = [...approval.lines]; lines[index] = { ...line, packageId: event.target.value }; setApproval({ ...approval, lines }); }} className="input mt-1.5"><option value="">Choose package</option>{(item?.catalog?.packages || []).map((pack) => <option key={pack.id} value={pack.id}>{pack.name} ({pack.unitsPerPackage} units)</option>)}</select></label><label className="text-sm font-semibold">Supplier description<input required value={line.supplierDescription} onChange={(event) => { const lines = [...approval.lines]; lines[index] = { ...line, supplierDescription: event.target.value }; setApproval({ ...approval, lines }); }} className="input mt-1.5" /></label><label className="text-sm font-semibold">Quantity<input required type="number" min="1" step="1" value={line.quantity} onChange={(event) => { const lines = [...approval.lines]; lines[index] = { ...line, quantity: event.target.value }; setApproval({ ...approval, lines }); }} className="input mt-1.5" /></label><label className="text-sm font-semibold">Cost per package<input required type="number" min="0" step="0.000001" value={line.unitCost} onChange={(event) => { const lines = [...approval.lines]; lines[index] = { ...line, unitCost: event.target.value }; setApproval({ ...approval, lines }); }} className="input mt-1.5" /></label><label className="text-sm font-semibold">Location<select value={line.location} onChange={(event) => { const lines = [...approval.lines]; lines[index] = { ...line, location: event.target.value }; setApproval({ ...approval, lines }); }} className="input mt-1.5"><option value="BACKROOM">Backroom</option><option value="SHELF">Shelf</option></select></label></div></div>; })}</div></div><div className="flex gap-3 pt-3"><button type="button" onClick={() => setApproval(null)} className="flex-1 btn-secondary">Cancel</button><button type="submit" disabled={busy} className="flex-1 btn-primary">{busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting…</> : 'Approve and receive'}</button></div></form></div>}
    <div className="glass-panel overflow-hidden"><div className="px-6 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-900">Posted purchases</h3></div><div className="divide-y divide-slate-100">{purchases.map((purchase) => <div key={purchase.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-semibold">{purchase.vendor?.name || 'Vendor'} · {purchase.invoiceNumber}</span><span className="text-slate-500">{purchase.date?.slice(0, 10)}</span><span className="font-bold">${Number(purchase.totalCost || 0).toFixed(2)}</span></div>)}{!purchases.length && <div className="p-8 text-center text-slate-500">No posted purchases yet.</div>}</div></div>
  </div>;
}
