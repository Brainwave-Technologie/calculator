// pages/payout/PayrollDashboard.jsx
// Unified Payroll Dashboard - Shows ALL resources (even with 0 cases)
// Displays 0 values, not dashes - Horizontal scroll for all resources

import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL 

const PayrollDashboard = () => {
  const [activeClient, setActiveClient] = useState('verisma');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);
  
  const [dates, setDates] = useState([]);
  const [resources, setResources] = useState([]);
  const [allClientResources, setAllClientResources] = useState([]); // ALL resources for the client
  const [dailyTotals, setDailyTotals] = useState({});
  const [grandTotal, setGrandTotal] = useState(0);
  const [resourceCount, setResourceCount] = useState(0);

  const scrollRef = useRef(null);

  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  const clients = [
    { id: 'verisma', label: 'Verisma' },
    { id: 'mro', label: 'MRO' },
    { id: 'datavant', label: 'Datavant' }
  ];

  // Fetch ALL resources assigned to this client
  const fetchAllResources = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      
      // Get client ID first
      const clientName = activeClient.charAt(0).toUpperCase() + activeClient.slice(1);
      const clientRes = await fetch(`${apiBaseUrl}/client?search=${encodeURIComponent(clientName)}`);
      const clientsData = await clientRes.json();
      const clientList = Array.isArray(clientsData) ? clientsData : clientsData.data || [];
      const client = clientList.find(c => c.name.toLowerCase() === activeClient.toLowerCase());
      
      if (!client) {
        setAllClientResources([]);
        return;
      }

      // Get all resources
      const response = await fetch(`${apiBaseUrl}/resource`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const resourceList = data.resources || data.data || data || [];
      
      // Filter resources assigned to this client
      const clientResources = resourceList.filter(r => 
        r.assignments?.some(a => 
          a.client_id?.toString() === client._id?.toString() ||
          a.client_name?.toLowerCase() === activeClient.toLowerCase()
        )
      );
      
      setAllClientResources(clientResources);
    } catch (error) {
      console.error('Error fetching all resources:', error);
      setAllClientResources([]);
    }
  }, [activeClient]);

  // Fetch payroll data
  const fetchPayrollData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/payroll/${activeClient}?month=${month}&year=${year}`);
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      
      setDates(data.dates || []);
      setResources(data.resources || []);
      setDailyTotals(data.dailyTotals || {});
      setGrandTotal(data.grandTotal || 0);
      setResourceCount(data.resourceCount || 0);
    } catch (error) {
      console.error('Fetch error:', error);
      setResources([]);
      setDates([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeClient, month, year]);

  useEffect(() => { 
    fetchAllResources();
    fetchPayrollData(); 
  }, [fetchAllResources, fetchPayrollData]);

  const handleExport = () => {
    window.open(`${apiBaseUrl}/payroll/${activeClient}/export?month=${month}&year=${year}`, '_blank');
  };

  // Merge all resources with payroll data
  const getMergedResources = () => {
    // Create a map of resources with logged cases
    const loggedResourceMap = new Map();
    resources.forEach(r => {
      loggedResourceMap.set(r.resource_email || r.resource_name, r);
    });

    // Create merged list: all client resources with their cases (or empty)
    const merged = allClientResources.map(r => {
      const loggedData = loggedResourceMap.get(r.email) || loggedResourceMap.get(r.name);
      
      if (loggedData) {
        return loggedData;
      }
      
      // Resource has no logged cases - create empty entry
      return {
        resource_name: r.name,
        resource_email: r.email,
        daily_cases: {},
        total_cases: 0
      };
    });

    // Also add any logged resources not in allClientResources (edge case)
    resources.forEach(r => {
      const exists = merged.some(m => 
        m.resource_email === r.resource_email || m.resource_name === r.resource_name
      );
      if (!exists) {
        merged.push(r);
      }
    });

    // Sort by name
    return merged.sort((a, b) => (a.resource_name || '').localeCompare(b.resource_name || ''));
  };

  const mergedResources = getMergedResources();
  const workingDays = dates.filter(d => !d.isWeekend).length;
  const avgPerDay = workingDays > 0 ? Math.round(grandTotal / workingDays) : 0;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Compact Header */}
      <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Payroll Dashboard</h1>
          <p className="text-xs text-slate-400">Day-wise resource allocation</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div><span className="text-slate-400">Resources:</span> <span className="font-semibold">{mergedResources.length}</span></div>
          <div><span className="text-slate-400">Active:</span> <span className="font-semibold text-emerald-400">{resourceCount}</span></div>
          <div><span className="text-slate-400">Total:</span> <span className="font-semibold text-emerald-400">{formatNumber(grandTotal)}</span></div>
          <div><span className="text-slate-400">Avg/Day:</span> <span className="font-semibold">{formatNumber(avgPerDay)}</span></div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        {/* Client Tabs */}
        <div className="flex items-center gap-1">
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => setActiveClient(client.id)}
              className={`px-4 py-1.5 rounded text-xs font-medium transition-all ${
                activeClient === client.id 
                  ? 'bg-slate-800 text-white shadow' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {client.label}
            </button>
          ))}
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
            {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => { fetchAllResources(); fetchPayrollData(); }} disabled={isLoading}
            className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">↻</button>
          <button onClick={handleExport} disabled={isLoading || mergedResources.length === 0}
            className="px-3 py-1.5 text-xs bg-slate-800 text-white hover:bg-slate-700 rounded disabled:opacity-50">
            ↓ Export
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-b px-4 py-1.5 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span> Has Cases</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-50 border border-rose-200"></span> Zero Cases</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></span> Weekend</span>
        <span className="ml-auto text-gray-400">
          {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })} • {workingDays} working days • {mergedResources.length} resources
        </span>
      </div>

      {/* Table */}
      <div className="p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 bg-white rounded-lg shadow-sm">
            <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
            <span className="text-gray-500 text-sm">Loading...</span>
          </div>
        ) : mergedResources.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm py-16 text-center text-gray-500">
            <div className="text-3xl mb-2">📊</div>
            <p className="font-medium">No resources found</p>
            <p className="text-xs mt-1">No resources assigned to {activeClient}</p>
          </div>
        ) : (
          <div ref={scrollRef} className="bg-white rounded-lg shadow-sm overflow-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2.5 text-left font-semibold text-slate-600 min-w-[90px]">Date</th>
                  <th className="sticky top-0 left-[90px] z-30 bg-slate-50 border-b border-r border-slate-200 px-2 py-2.5 text-center font-semibold text-slate-600 min-w-[50px]">Day</th>
                  <th className="sticky top-0 left-[140px] z-30 bg-slate-100 border-b border-r border-slate-200 px-2 py-2.5 text-center font-semibold text-slate-700 min-w-[70px]">Overall</th>
                  {mergedResources.map((r, i) => (
                    <th key={i} className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-2 py-2.5 text-center font-medium text-slate-600 min-w-[100px] whitespace-nowrap" title={r.resource_email || r.resource_name}>
                      {r.resource_name || 'Unknown'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map((d, rowIdx) => {
                  const dayTotal = dailyTotals[d.isoDate] || 0;
                  return (
                    <tr key={rowIdx} className={d.isWeekend ? 'bg-amber-50/30' : 'hover:bg-slate-50/50'}>
                      <td className="sticky left-0 z-10 bg-white border-b border-r border-slate-100 px-3 py-1.5 font-medium text-slate-700">{d.dateStr}</td>
                      <td className="sticky left-[90px] z-10 bg-white border-b border-r border-slate-100 px-2 py-1.5 text-center text-slate-500">{d.dayName}</td>
                      <td className={`sticky left-[140px] z-10 border-b border-r border-slate-100 px-2 py-1.5 text-center font-bold ${
                        d.isWeekend ? 'bg-amber-100 text-amber-700' : dayTotal > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-50 text-rose-500'
                      }`}>
                        {formatNumber(dayTotal)}
                      </td>
                      {mergedResources.map((r, colIdx) => {
                        const cases = r.daily_cases?.[d.isoDate] || 0;
                        return (
                          <td key={colIdx} className={`border-b border-slate-100 px-2 py-1.5 text-center ${
                            d.isWeekend 
                              ? 'bg-amber-50 text-amber-700' 
                              : cases > 0 
                                ? 'bg-emerald-100 text-emerald-700 font-semibold' 
                                : 'bg-rose-50 text-rose-400'
                          }`}>
                            {formatNumber(cases)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="sticky bottom-0 z-10 bg-slate-800 text-white font-semibold">
                  <td className="sticky left-0 z-20 bg-slate-800 border-t border-slate-600 px-3 py-2.5">Grand Total</td>
                  <td className="sticky left-[90px] z-20 bg-slate-800 border-t border-slate-600 px-2 py-2.5"></td>
                  <td className="sticky left-[140px] z-20 bg-emerald-600 border-t border-slate-600 px-2 py-2.5 text-center">{formatNumber(grandTotal)}</td>
                  {mergedResources.map((r, i) => (
                    <td key={i} className={`border-t border-slate-600 px-2 py-2.5 text-center ${
                      r.total_cases > 0 ? 'bg-slate-700' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {formatNumber(r.total_cases || 0)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollDashboard;