import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { Settings, RefreshCw, Key, CheckCircle2, AlertCircle, UploadCloud, FileText } from 'lucide-react';
import Papa from 'papaparse';
import { useData } from '../context/DataContext';
import { posService, inventoryService } from '../services/api';

export default function PosIntegration() {
  const { activeStoreId, inventory } = useData();
  const [activeTab, setActiveTab] = useState('api');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ provider: 'SQUARE', apiKey: '' });
  const [message, setMessage] = useState('');
  const [syncLogs, setSyncLogs] = useState([]);
  
  // CSV State
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvType, setCsvType] = useState('sales');
  const [csvDate, setCsvDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!activeStoreId || activeStoreId === 'hq') return undefined;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(null);
    posService.getStatus(activeStoreId)
      .then((response) => {
        if (!cancelled) setStatus(response.data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false });
      });
    return () => { cancelled = true; };
  }, [activeStoreId]);

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await posService.connect({ storeId: activeStoreId, provider: form.provider, apiKey: form.apiKey });
      setStatus({ connected: true, integration: { provider: form.provider, status: 'ACTIVE' } });
      setMessage('POS Connected Successfully');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(error);
      setMessage(`Failed to connect POS: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const res = await posService.sync({ storeId: activeStoreId });
      const timestamp = new Date().toLocaleTimeString();
      const msg = res.data.message || 'Successfully synced from POS.';
      setMessage(msg);
      setSyncLogs(prev => [{ time: timestamp, message: msg }, ...prev]);
      setStatus(prev => ({ 
        ...prev, 
        integration: { ...prev.integration, lastSync: new Date().toISOString() } 
      }));
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(error);
      setMessage(`Failed to sync data: ${errorMsg}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields) return;
        const headers = results.meta.fields.map(f => f.toLowerCase());
        const isCatalog = headers.includes('product') && headers.some(h => h.includes('price')) && headers.includes('category');

        if (isCatalog) {
          setCsvType('catalog');
          const parsed = results.data.map(row => ({
            productName: row['product'] || row['Product'] || '',
            category: row['category'] || row['Category'] || 'General',
            sellingPrice: parseFloat(row['sale_price'] || row['Sale Price'] || row['price'] || 0)
          })).filter(item => item.productName);
          setCsvData(parsed);
        } else {
          setCsvType('sales');
          const parsed = results.data.map(row => ({
            productName: row['Product Name'] || row['Item'] || row['Name'] || '',
            quantity: parseInt(row['Quantity'] || row['Qty'] || 0, 10),
            price: parseFloat(row['Price'] || row['Unit Price'] || 0)
          })).filter(item => item.productName && item.quantity > 0);
          
          setCsvData(parsed);
        }
      }
    });
  };

  const [lastImport, setLastImport] = useState(null);
  const [unmatchedItems, setUnmatchedItems] = useState([]);
  const [mappings, setMappings] = useState({});

  const handleImportCsv = async () => {
    setLoading(true);
    setMessage('');
    setUnmatchedItems([]);
    try {
      if (csvType === 'catalog') {
        // Use inventoryService instead of posService for catalog imports
        // inventoryService is statically imported at the top
        await inventoryService.importCsv({ storeId: activeStoreId, items: csvData });
        setMessage(`Successfully imported ${csvData.length} catalog items into inventory.`);
        setLastImport({ file: csvFile?.name || 'catalog.csv', processed: csvData.length, errors: 0 });
      } else {
        const res = await posService.importCsv({
          storeId: activeStoreId,
          date: `${csvDate}T00:00:00.000Z`,
          filename: csvFile?.name,
          rows: csvData
        });
        const simulatedUnmatched = res.data?.unmatchedItems || [];
        const processedCount = res.data?.matchedCount ?? csvData.length - simulatedUnmatched.length;
        
        if (simulatedUnmatched.length > 0) {
          setMessage(`Partial import complete. Matched ${processedCount} items. ${simulatedUnmatched.length} items need manual mapping.`);
          setUnmatchedItems(simulatedUnmatched);
        } else {
          setMessage(`Successfully imported POS Sales CSV. Matched ${csvData.length} items. Unmatched: 0`);
        }
        setLastImport({ file: csvFile?.name || 'sales.csv', processed: processedCount, errors: simulatedUnmatched.length });
      }
      setCsvFile(null);
      setCsvData([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(error);
      setMessage(`Failed to import CSV: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoScan = async () => {
    setLoading(true);
    setMessage('');
    setUnmatchedItems([]);
    try {
      const res = await posService.autoScan({ storeId: activeStoreId });
      setMessage(res.data.message);
      setLastImport({ 
        file: res.data.filename, 
        processed: res.data.matchedCount, 
        errors: res.data.unmatchedCount 
      });
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(error);
      setMessage(`Failed to run auto-scan: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const saveMapping = async (posName) => {
    const invId = mappings[posName];
    if (!invId) return;
    
    try {
      await posService.saveMapping({ storeId: activeStoreId, posItemName: posName, inventoryId: invId });
      setUnmatchedItems(prev => prev.filter(name => name !== posName));
      setMessage(`Successfully mapped "${posName}" to inventory. It will automatically sync next time.`);
      
      if (lastImport) {
        setLastImport({
          ...lastImport,
          processed: lastImport.processed + 1,
          errors: lastImport.errors - 1
        });
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      console.error(error);
      setMessage(`Failed to save mapping: ${errorMsg}`);
    }
  };

  if (activeStoreId === 'hq') {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-500 font-medium">Please select a specific store to configure POS integration.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">POS Integration</h2>
        <p className="text-slate-500 font-medium mt-1">Connect your physical Point of Sale system or upload manual CSV reports.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={() => { setActiveTab('api'); setMessage(''); }}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${activeTab === 'api' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          API Connection
        </button>
        <button 
          onClick={() => { setActiveTab('csv'); setMessage(''); }}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${activeTab === 'csv' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          CSV Upload
        </button>
      </div>

      <div className="glass-panel p-8">
        {message && (
          <div className="mb-6 p-4 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm flex items-center gap-2 border border-blue-200">
            <CheckCircle2 className="w-5 h-5" />
            {message}
          </div>
        )}

        {activeTab === 'api' && (
          <>
            <div className="flex items-center justify-between mb-8 pb-8 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${status?.connected ? 'bg-emerald-600 shadow-emerald-500/30' : 'bg-slate-200'}`}>
                  {status?.connected ? <CheckCircle2 className="w-6 h-6 text-white" /> : <Settings className="w-6 h-6 text-slate-500" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Connection Status</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${status?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    <span className={`text-sm font-bold ${status?.connected ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {status?.connected ? `Active (${status.integration?.provider})` : 'Disconnected'}
                    </span>
                  </div>
                </div>
              </div>
              {status?.connected && status?.integration?.lastSync && (
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last Sync</p>
                  <p className="text-sm font-medium text-slate-900 mt-1">{new Date(status.integration.lastSync).toLocaleString()}</p>
                </div>
              )}
            </div>

            {!status?.connected ? (
              <form onSubmit={handleConnect} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">POS Provider</label>
                    <select 
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      value={form.provider}
                      onChange={e => setForm({...form, provider: e.target.value})}
                    >
                      <option value="SQUARE">Square POS</option>
                      <option value="GENERIC">Generic API Webhook</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">API Key or Access Token</label>
                    <div className="relative">
                      <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="password"
                        required
                        className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        placeholder="sq0atp-xxxxxxxxxxxxxxxx"
                        value={form.apiKey}
                        onChange={e => setForm({...form, apiKey: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50"
                >
                  {loading ? 'Connecting...' : 'Connect POS System'}
                </button>
              </form>
            ) : (
              <div className="space-y-8">
                <div>
                  <p className="text-slate-600 font-medium">Your POS system is actively sending transactions to FuelOps Pro. Inventory levels and sales dashboards will update in real-time.</p>
                  
                  <div className="flex gap-4 mt-6">
                    <button 
                      onClick={handleSync}
                      disabled={syncing}
                      className="px-6 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold transition-all flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Force Manual Sync'}
                    </button>
                    
                    <button
                      onClick={async () => {
                        setLoading(true);
                        try {
                          await posService.disconnect(activeStoreId);
                          setStatus({ connected: false });
                          setMessage('POS disconnected.');
                        } catch (error) {
                          setMessage(`Failed to disconnect POS: ${error.response?.data?.error || error.message}`);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className="px-6 py-3 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>

                {/* Sync Logs */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-white">
                    <h4 className="font-bold text-slate-900">Recent Sync Logs</h4>
                  </div>
                  <div className="p-6 space-y-4 max-h-60 overflow-y-auto font-mono text-sm">
                    {syncLogs.length === 0 ? (
                      <p className="text-slate-400">No recent sync activity.</p>
                    ) : (
                      syncLogs.map((log, i) => (
                        <div key={i} className="flex gap-4 items-start">
                          <span className="text-slate-400 whitespace-nowrap">[{log.time}]</span>
                          <span className={log.message.includes('Failed') ? 'text-rose-600' : 'text-emerald-600'}>
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'csv' && (
          <div className="space-y-6">
            <div className="flex gap-4 mb-8">
              <button
                onClick={handleAutoScan}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw className={`w-5 h-5 ${loading && !csvFile ? 'animate-spin' : ''}`} />
                {loading && !csvFile ? 'Scanning Folder...' : 'Auto-read from SFTP Folder'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-200">
              {csvType === 'sales' && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Transaction Date</label>
                  <input 
                    type="date"
                    value={csvDate}
                    onChange={(e) => setCsvDate(e.target.value)}
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              )}
              <div className={csvType === 'catalog' ? "md:col-span-2" : ""}>
                <label className="block text-sm font-bold text-slate-700 mb-2">Manual Upload (.csv)</label>
                <div className="relative">
                  <UploadCloud className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 text-slate-900 font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none pt-2.5 cursor-pointer file:hidden"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Upload POS Sales Report or BigBasket Product Catalog.</p>
              </div>
            </div>

            {/* Metrics Dashboard */}
            {lastImport && (
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Last Imported File</p>
                  <p className="font-semibold text-slate-900 truncate" title={lastImport.file}>{lastImport.file}</p>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Records Processed</p>
                  <p className="font-black text-slate-900 text-lg">{lastImport.processed}</p>
                </div>
                <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Errors / Duplicates</p>
                  <p className="font-black text-rose-700 text-lg">{lastImport.errors}</p>
                </div>
              </div>
            )}

            {/* Smart POS Mapping UI */}
            {unmatchedItems.length > 0 && (
              <div className="mt-8 border border-rose-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-rose-50 px-6 py-4 border-b border-rose-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-6 h-6 text-rose-600" />
                    <div>
                      <h3 className="font-bold text-rose-900">Unmapped POS Items ({unmatchedItems.length})</h3>
                      <p className="text-xs font-medium text-rose-700 mt-0.5">These items could not be auto-matched to your inventory. Please map them below.</p>
                    </div>
                  </div>
                </div>
                <div className="p-6 space-y-4 bg-white">
                  {unmatchedItems.map((posName, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row items-center gap-4 p-4 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex-1 w-full">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">POS Item Name</p>
                        <p className="font-bold text-slate-900">{posName}</p>
                      </div>
                      <div className="flex-1 w-full">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Map to Active Inventory</label>
                        <select
                          className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                          value={mappings[posName] || ''}
                          onChange={(e) => setMappings({ ...mappings, [posName]: e.target.value })}
                        >
                          <option value="">Select an inventory item...</option>
                          {inventory && inventory.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.productName} ({item.category}) - Stock: {item.stockQuantity}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="w-full md:w-auto flex items-end">
                        <button
                          onClick={() => saveMapping(posName)}
                          disabled={!mappings[posName]}
                          className="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-sm transition-all disabled:opacity-50"
                        >
                          Save Mapping
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {csvData.length > 0 && (
              <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden">
                {csvType === 'catalog' && (
                  <div className="bg-blue-50 px-6 py-3 border-b border-blue-200 flex items-center gap-2 text-blue-700 font-medium text-sm">
                    <AlertCircle className="w-5 h-5" />
                    This file contains product catalog data. It will be imported directly into inventory, not as sales.
                  </div>
                )}
                
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Data Preview ({csvData.length} items found)
                  </h3>
                  <button
                    onClick={handleImportCsv}
                    disabled={loading}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-sm shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Importing...' : csvType === 'catalog' ? 'Import as Inventory' : 'Confirm Sales Import'}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="bg-white sticky top-0 border-b border-slate-200 shadow-sm">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Product Name</th>
                        {csvType === 'sales' ? (
                          <>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Qty Sold</th>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Unit Price</th>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Total Sales</th>
                          </>
                        ) : (
                          <>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Category</th>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Selling Price</th>
                            <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Initial Stock</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {csvData.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-6 py-3 font-medium text-slate-900">{row.productName}</td>
                          {csvType === 'sales' ? (
                            <>
                              <td className="px-6 py-3 text-slate-600">{row.quantity}</td>
                              <td className="px-6 py-3 text-slate-600">${row.price.toFixed(2)}</td>
                              <td className="px-6 py-3 font-bold text-slate-900">${(row.quantity * row.price).toFixed(2)}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-6 py-3 text-slate-600">{row.category}</td>
                              <td className="px-6 py-3 font-bold text-emerald-600">${row.sellingPrice.toFixed(2)}</td>
                              <td className="px-6 py-3 text-slate-400 italic">0 (Default)</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvData.length > 10 && (
                  <div className="bg-slate-50 px-6 py-3 text-center text-sm font-medium text-slate-500 border-t border-slate-200">
                    Showing 10 of {csvData.length} items
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
