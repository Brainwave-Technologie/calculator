// pages/payout/PayrollDashboard.jsx
// Unified Payroll Dashboard - styled to match Daily Cases UI

import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL

const PayrollDashboard = () => {
  const [activeClient, setActiveClient] = useState('verisma');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);

  const [dates, setDates] = useState([]);
  const [resources, setResources] = useState([]);
  const [allClientResources, setAllClientResources] = useState([]);
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

  // Cell color matching Daily Cases UI
  const getCellColor = (value) => {
    if (!value) return 'bg-white text-gray-400';
    if (value >= 21) return 'bg-green-500 text-white font-bold';
    if (value >= 16) return 'bg-green-300 text-green-900';
    if (value >= 13) return 'bg-yellow-300 text-yellow-900';
    return 'bg-red-200 text-red-900';
  };

  const cellStyle = "border border-gray-300 px-1.5 py-1 text-[11px]";
  const headerStyle = "border border-gray-400 px-1.5 py-1.5 font-bold text-[11px]";

  // Fetch ALL resources assigned to this client
  const fetchAllResources = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const clientName = activeClient.charAt(0).toUpperCase() + activeClient.slice(1);
      const clientRes = await fetch(`${apiBaseUrl}/client?search=${encodeURIComponent(clientName)}`);
      const clientsData = await clientRes.json();
      const clientList = Array.isArray(clientsData) ? clientsData : clientsData.data || [];
      const client = clientList.find(c => c.name.toLowerCase() === activeClient.toLowerCase());

      if (!client) { setAllClientResources([]); return; }

      const response = await fetch(`${apiBaseUrl}/resource`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      const resourceList = data.resources || data.data || data || [];

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
    const loggedResourceMap = new Map();
    resources.forEach(r => {
      loggedResourceMap.set(r.resource_email || r.resource_name, r);
    });

    const merged = allClientResources.map(r => {
      const loggedData = loggedResourceMap.get(r.email) || loggedResourceMap.get(r.name);
      if (loggedData) return loggedData;
      return {
        resource_name: r.name,
        resource_email: r.email,
        daily_cases: {},
        total_cases: 0
      };
    });

    resources.forEach(r => {
      const exists = merged.some(m =>
        m.resource_email === r.resource_email || m.resource_name === r.resource_name
      );
      if (!exists) merged.push(r);
    });

    return merged.sort((a, b) => (a.resource_name || '').localeCompare(b.resource_name || ''));
  };

  const mergedResources = getMergedResources();
  const workingDays = dates.filter(d => !d.isWeekend).length;
  const avgPerDay = workingDays > 0 ? Math.round(grandTotal / workingDays) : 0;

  const clientLabel = clients.find(c => c.id === activeClient)?.label || activeClient;
  const monthLabel = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  // Format date as DD/MM
  const formatDate = (d) => {
    const day = String(d.day || new Date(d.isoDate).getDate()).padStart(2, '0');
    const mo = String(month).padStart(2, '0');
    return `${day}/${mo}`;
  };

  return (
    <div className="bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold">Payroll Dashboard</h1>
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
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}
            className="px-2 py-1.5 text-xs border rounded">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}
            className="px-2 py-1.5 text-xs border rounded">
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
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-green-500"></span> ≥21</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-green-300"></span> 16–20</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-yellow-300"></span> 13–15</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-200"></span> &lt;13</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300"></span> Weekend</span>
        <span className="ml-auto text-gray-400">
          {monthLabel} • {workingDays} working days • {mergedResources.length} resources
        </span>
      </div>

      {/* Table */}
      <div className="p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 bg-white rounded-lg shadow-sm">
            <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
            <span className="text-gray-500 text-sm">Loading...</span>
          </div>
        ) : mergedResources.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm py-16 text-center text-gray-500">
            <div className="text-3xl mb-2">📊</div>
            <p className="font-medium">No resources found</p>
            <p className="text-xs mt-1">No resources assigned to {clientLabel}</p>
          </div>
        ) : (
          <div ref={scrollRef} className="bg-white rounded shadow-sm w-full overflow-hidden">
            <div className="overflow-auto w-full" style={{ maxHeight: 'calc(100vh - 155px)' }}>
              <table className="text-[11px] border-collapse bg-white w-full" style={{ minWidth: 'max-content' }}>
                <thead className="sticky top-0 z-20">
                  {/* Group header row */}
                  <tr>
                    <th colSpan={3} className={`${headerStyle} bg-slate-700 text-white text-left sticky left-0 z-30`}>
                      DATE
                    </th>
                    <th colSpan={mergedResources.length} className={`${headerStyle} bg-indigo-600 text-white text-center`}>
                      RESOURCES — {clientLabel} Monthly Payroll ({mergedResources.length})
                    </th>
                  </tr>
                  {/* Column header row */}
                  <tr className="bg-gray-100">
                    <th className={`${headerStyle} sticky top-0 left-0 z-30 bg-gray-200 w-[70px] text-center`}>Date</th>
                    <th className={`${headerStyle} sticky top-0 left-[70px] z-30 bg-gray-200 w-[40px] text-center`}>Day</th>
                    <th className={`${headerStyle} sticky top-0 left-[110px] z-30 bg-slate-100 w-[60px] text-center`}>Total</th>
                    {mergedResources.map((r, i) => (
                      <th key={i}
                        className={`${headerStyle} sticky top-0 z-20 bg-gray-100 min-w-[110px] text-center whitespace-nowrap`}
                        title={r.resource_email || r.resource_name}
                      >
                        {r.resource_name || 'Unknown'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d, rowIdx) => {
                    const dayTotal = dailyTotals[d.isoDate] || 0;
                    return (
                      <tr key={rowIdx} className={d.isWeekend ? 'bg-amber-50/40' : ''}>
                        {/* Date */}
                        <td className={`${cellStyle} sticky left-0 z-10 bg-white font-medium text-slate-700 text-center`}>
                          {formatDate(d)}
                        </td>
                        {/* Day */}
                        <td className={`${cellStyle} sticky left-[70px] z-10 bg-white text-center ${d.isWeekend ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                          {d.dayName}
                        </td>
                        {/* Total */}
                        <td className={`${cellStyle} sticky left-[110px] z-10 text-center font-bold ${
                          d.isWeekend
                            ? 'bg-amber-100 text-amber-700'
                            : dayTotal > 0
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-50 text-rose-400'
                        }`}>
                          {formatNumber(dayTotal)}
                        </td>
                        {/* Resource cells */}
                        {mergedResources.map((r, colIdx) => {
                          const cases = r.daily_cases?.[d.isoDate] || 0;
                          return (
                            <td key={colIdx} className={`${cellStyle} text-center ${
                              d.isWeekend ? 'bg-amber-50 text-amber-600' : getCellColor(cases)
                            }`}>
                              {cases || 0}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Total Footer Row */}
                  <tr className="sticky bottom-0 z-10 bg-slate-800 text-white font-bold">
                    <td className={`${cellStyle} sticky left-0 z-20 bg-slate-800 border-slate-600 text-center`}>Total</td>
                    <td className={`${cellStyle} sticky left-[70px] z-20 bg-slate-800 border-slate-600`}></td>
                    <td className={`${cellStyle} sticky left-[110px] z-20 bg-emerald-600 border-emerald-500 text-center`}>
                      {formatNumber(grandTotal)}
                    </td>
                    {mergedResources.map((r, i) => (
                      <td key={i} className={`${cellStyle} text-center border-slate-600 ${
                        (r.total_cases || 0) > 0 ? 'bg-slate-700' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {formatNumber(r.total_cases || 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollDashboard;
