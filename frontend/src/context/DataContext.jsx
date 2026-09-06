/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  auditService,
  dailyCloseService,
  employeeService,
  fuelService,
  inventoryService,
  reportsService,
  salesService,
  socket,
  vendorService
} from '../services/api';
import { useAuth } from './AuthContext';
import { getDepartmentConfig } from '../utils/departments';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

const toInventoryView = (item) => ({
  id: item.id,
  name: item.productName,
  productName: item.productName,
  category: item.category,
  sku: item.sku,
  cost: Number(item.costPrice),
  costPrice: Number(item.costPrice),
  price: Number(item.sellingPrice),
  sellingPrice: Number(item.sellingPrice),
  stock: item.stockQuantity,
  stockQuantity: item.stockQuantity,
  lowStockAlert: item.reorderLevel,
  reorderLevel: item.reorderLevel
});

const toSaleView = (sale) => ({
  id: sale.id,
  type: sale.category === 'fuel' ? 'fuel' : 'store',
  date: sale.date?.split('T')[0],
  timestamp: sale.date,
  revenue: Number(sale.totalAmount),
  profit: (sale.saleItems || []).reduce((total, item) => (
    total + (Number(item.price) - Number(item.cost ?? item.product?.costPrice ?? 0)) * item.quantity
  ), 0),
  items: (sale.saleItems || []).map((item) => ({
    id: item.productId,
    qty: item.quantity,
    department: item.product?.category
  }))
});

const toTankView = (tank) => ({
  ...tank,
  current: Number(tank.current ?? tank.currentLevel ?? 0),
  capacity: Number(tank.capacity ?? tank.tankCapacity ?? 0),
  price: Number(tank.price ?? tank.pricePerGallon ?? 0),
  cost: Number(tank.cost ?? tank.costPerGallon ?? 0)
});

export const DataProvider = ({ children }) => {
  const { user } = useAuth();
  const stores = useMemo(() => user?.stores || [], [user?.stores]);
  const [selectedStoreId, setActiveStoreId] = useState('');
  const activeStoreId = selectedStoreId === 'hq' || stores.some((store) => store.id === selectedStoreId)
    ? selectedStoreId
    : (stores[0]?.id || '');
  const [inventory, setInventory] = useState([]);
  const [salesLog, setSalesLog] = useState([]);
  const [dailyHistory, setDailyHistory] = useState([]);
  const [report, setReport] = useState(null);
  const [hqReports, setHqReports] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');
  const [reportDateRange, setReportDateRange] = useState('all');
  const [employees, setEmployees] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [shrinkageLogs, setShrinkageLogs] = useState([]);
  const [fuelTanks, setFuelTanks] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);

  const refreshStoreData = useCallback(async (storeId) => {
    if (!storeId || storeId === 'hq') return;
    setDataLoading(true);
    setDataError('');
    try {
      const [inventoryResponse, salesResponse, reportResponse, closingsResponse, tankResponse, fuelLogResponse, vendorResponse, employeeResponse, auditResponse] = await Promise.all([
        inventoryService.getInventory(storeId),
        salesService.getSales(storeId),
        reportsService.getSummary(storeId, reportDateRange),
        dailyCloseService.getClosings(storeId),
        fuelService.getTanks(storeId),
        fuelService.getLogs(storeId),
        vendorService.getAll(),
        employeeService.getAll(storeId),
        auditService.getAll(storeId)
      ]);
      setInventory(inventoryResponse.data.map(toInventoryView));
      setSalesLog(salesResponse.data.map(toSaleView));
      setReport(reportResponse.data);
      setDailyHistory(closingsResponse.data.map((closing) => ({
        ...closing,
        date: closing.date?.split('T')[0],
        totalRevenue: Number(closing.totalSales),
        totalExpenses: Number(closing.totalExpenses),
        netProfit: Number(closing.netProfit)
      })));
      setFuelTanks(tankResponse.data.map(toTankView));
      setFuelLogs(fuelLogResponse.data);
      setVendors(vendorResponse.data);
      setEmployees(employeeResponse.data);
      setAuditLogs(auditResponse.data.map((log) => ({
        ...log,
        user: log.user || 'System',
        oldValue: log.oldValue ?? 'None',
        newValue: log.newValue ?? 'None'
      })));
    } catch (error) {
      setDataError(error.response?.data?.error || 'Unable to load store data');
    } finally {
      setDataLoading(false);
    }
  }, [reportDateRange]);

  useEffect(() => {
    if (!activeStoreId) return;
    if (activeStoreId === 'hq') {
      Promise.all(stores.map(async (store) => ({
        store,
        report: (await reportsService.getSummary(store.id, reportDateRange)).data
      }))).then(setHqReports).catch(() => setDataError('Unable to load company totals'));
      return;
    }
    const timer = window.setTimeout(() => {
      refreshStoreData(activeStoreId);
      socket.emit('join_store', activeStoreId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeStoreId, refreshStoreData, reportDateRange, stores]);

  useEffect(() => {
    const refresh = (payload) => {
      if (payload.storeId === activeStoreId) refreshStoreData(activeStoreId);
    };
    socket.on('sales_updated', refresh);
    socket.on('inventory_updated', refresh);
    return () => {
      socket.off('sales_updated', refresh);
      socket.off('inventory_updated', refresh);
    };
  }, [activeStoreId, refreshStoreData]);

  const recordStoreSale = async (items, paymentType = 'CASH') => {
    const response = await salesService.recordSale({
      storeId: activeStoreId,
      category: 'store',
      paymentType,
      items: items.map((item) => ({ productId: item.id, quantity: Number(item.qty) }))
    });
    await refreshStoreData(activeStoreId);
    return response.data;
  };

  const recordPhysicalCount = async (type, itemId, actualCount) => {
    if (type === 'fuel') {
      await fuelService.updateTank(itemId, { currentLevel: Number(actualCount) });
      await refreshStoreData(activeStoreId);
      return;
    }
    if (type !== 'inventory') return;
    const existing = inventory.find((item) => item.id === itemId);
    await inventoryService.updateItem(itemId, { stockQuantity: Number(actualCount) });
    if (existing && Number(actualCount) < existing.stock) {
      setShrinkageLogs((logs) => [{
        id: Date.now(), name: existing.name, expected: existing.stock, actual: Number(actualCount),
        lossQty: existing.stock - Number(actualCount),
        lossValue: (existing.stock - Number(actualCount)) * existing.cost
      }, ...logs]);
    }
    await refreshStoreData(activeStoreId);
  };

  const adjustInventoryStock = async (itemId, delta) => {
    const existing = inventory.find((item) => item.id === itemId);
    if (!existing) throw new Error('Inventory item not found');
    const nextStock = Number(existing.stock) + Number(delta);
    if (!Number.isInteger(nextStock) || nextStock < 0) throw new Error('Inventory cannot be negative');
    await inventoryService.updateItem(itemId, { stockQuantity: nextStock });
    await refreshStoreData(activeStoreId);
    return nextStock;
  };

  const addAuditLog = async (actor, action, module, oldValue, newValue) => {
    if (!activeStoreId || activeStoreId === 'hq') return;
    try {
      const response = await auditService.create({
        storeId: activeStoreId,
        action,
        module,
        oldValue: oldValue === 'None' ? null : String(oldValue),
        newValue: newValue === 'None' ? null : String(newValue)
      });
      setAuditLogs((logs) => [{
        ...response.data,
        user: user?.name || actor,
        oldValue: response.data.oldValue ?? 'None',
        newValue: response.data.newValue ?? 'None'
      }, ...logs]);
    } catch (error) {
      setDataError(error.response?.data?.error || 'Unable to save audit log');
    }
  };

  const addFuelDelivery = async () => {
    await refreshStoreData(activeStoreId);
  };

  const calculateKPIs = () => ({
    revenue: Number(report?.totalRevenue || 0),
    profit: Number(report?.netProfit || 0),
    gallons: Number(report?.gallonsSold || 0),
    lowStockCount: Number(report?.lowStockCount || 0)
  });

  const getHQStats = () => ({
    totalRevenue: hqReports.reduce((sum, item) => sum + Number(item.report.totalRevenue || 0), 0),
    totalProfit: hqReports.reduce((sum, item) => sum + Number(item.report.netProfit || 0), 0),
    storeComparisons: hqReports.map(({ store, report: storeReport }) => ({
      name: store.name,
      revenue: Number(storeReport.totalRevenue || 0),
      profit: Number(storeReport.netProfit || 0)
    }))
  });

  const deptSales = useMemo(() => (report?.departmentSales || []).map((department) => ({
    ...department,
    value: Number(department.revenue),
    revenue: Number(department.revenue),
    profit: Number(department.profit),
    margin: Number(department.revenue) > 0 ? Number(department.profit) / Number(department.revenue) * 100 : 0
  })).sort((a, b) => b.revenue - a.revenue), [report]);

  const taxByDept = useMemo(() => {
    const breakdown = deptSales.map((department) => {
      const tax = department.revenue * (getDepartmentConfig(department.name).taxRate || 0);
      return { name: department.name, value: tax };
    }).filter((department) => department.value > 0);
    return { breakdown, total: breakdown.reduce((sum, department) => sum + department.value, 0) };
  }, [deptSales]);

  const getSmartInsights = () => {
    if (!deptSales.length) return [{ id: 'empty', type: 'warning', text: 'Record a sale to generate store insights.' }];
    const highestMargin = [...deptSales].sort((a, b) => b.margin - a.margin)[0];
    return [{ id: 'margin', type: 'success', text: `${highestMargin.name} currently has the highest margin at ${highestMargin.margin.toFixed(1)}%.` }];
  };

  const hourlyTrends = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ time: `${String(hour).padStart(2, '0')}:00`, sales: 0 }));
    const today = new Date().toISOString().split('T')[0];
    salesLog.forEach((sale) => {
      if (sale.date === today && sale.timestamp) hours[new Date(sale.timestamp).getHours()].sales += sale.revenue;
    });
    return hours;
  }, [salesLog]);

  return (
    <DataContext.Provider value={{
      currentUser: user, subscription: { plan: 'Pro', status: 'Active' }, stores,
      activeStoreId, setActiveStoreId, reportDateRange, setReportDateRange,
      inventory, setInventory, salesLog, dailyHistory, setDailyHistory,
      employees, setEmployees, vendors, setVendors, auditLogs, shrinkageLogs,
      dataLoading, dataError, refreshStoreData, recordStoreSale, recordPhysicalCount, adjustInventoryStock,
      addAuditLog, calculateKPIs, getHQStats, deptSales,
      taxByDept, getSmartInsights, hourlyTrends,
      fuelTanks, setFuelTanks, fuelLogs, recordFuelSale: async () => {}, addFuelDelivery
    }}>
      {children}
    </DataContext.Provider>
  );
};
