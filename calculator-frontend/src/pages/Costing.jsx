// pages/CostingDashboard.jsx
// Unified Costing Dashboard - Verisma, MRO, Datavant with button navigation
// Clean, compact design with minimal colors - aesthetic table styling

import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

const CostingDashboard = () => {
  const [activeClient, setActiveClient] = useState('verisma');
  const [projects, setProjects] = useState([]);
  const [clientId, setClientId] = useState(null);
  
  const [filters, setFilters] = useState({
    project: '',
    subProject: '',
    requestType: '',
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString()
  });
  
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'resource_name', direction: 'asc' });
  
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [totals, setTotals] = useState({
    totalCases: 0, totalHours: 0, totalCosting: 0, totalRevenue: 0, profit: 0, resourceCount: 0
  });
  
  const scrollRef = useRef(null);
  const loadingRef = useRef(false);
  const saveTimeouts = useRef(new Map());

  const formatCurrency = (amt) => `$${(amt || 0).toFixed(2)}`;
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);

  const clients = [
    { id: 'verisma', label: 'Verisma' },
    { id: 'mro', label: 'MRO' },
    { id: 'datavant', label: 'Datavant' }
  ];

  const REQUEST_TYPES = {
    verisma: ['New Request', 'Key', 'Duplicate'],
    mro: ['NRS-NO Records', 'Manual'],
    datavant: ['New Request', 'Key', 'Duplicate']
  };

  // Fetch client and projects when client changes
  useEffect(() => {
    const fetchClientData = async () => {
      try {
        const clientName = activeClient.charAt(0).toUpperCase() + activeClient.slice(1);
        const clientRes = await fetch(`${apiBaseUrl}/client?search=${encodeURIComponent(clientName)}`);
        const clientsData = await clientRes.json();
        const clientList = Array.isArray(clientsData) ? clientsData : clientsData.data || [];
        const client = clientList.find(c => c.name.toLowerCase() === activeClient);
        
        if (client) {
          setClientId(client._id);
          const projRes = await fetch(`${apiBaseUrl}/project?client_id=${client._id}`);
          const projectsData = await projRes.json();
          setProjects(Array.isArray(projectsData) ? projectsData : projectsData.data || []);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };
    fetchClientData();
    setFilters(prev => ({ ...prev, project: '', subProject: '', requestType: '' }));
    setRecords([]);
  }, [activeClient]);

  // Fetch billing data
  const fetchBillingData = useCallback(async (pageNum = 1, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    
    try {
      const params = new URLSearchParams({
        month: filters.month,
        year: filters.year,
        page: pageNum.toString(),
        limit: '50',
        sort_by: sortConfig.key,
        sort_order: sortConfig.direction
      });

      if (filters.project) params.append('project_id', filters.project);
      if (filters.subProject) params.append('subproject_id', filters.subProject);
      if (filters.requestType) params.append('request_type', filters.requestType);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`${apiBaseUrl}/billing/live/${activeClient}?${params}`);
      const data = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Failed to fetch');
      
      if (append) {
        setRecords(prev => [...prev, ...data.records]);
      } else {
        setRecords(data.records || []);
      }
      
      setTotalRecords(data.total || 0);
      setPage(pageNum);
      setHasMore(data.hasMore || false);
      setTotals(data.totals || {});
      
    } catch (error) {
      console.error(error);
      if (!append) setRecords([]);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [filters, searchTerm, sortConfig, activeClient]);

  // Debounce search and fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      setRecords([]);
      setPage(1);
      fetchBillingData(1, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, searchTerm, sortConfig, activeClient, fetchBillingData]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.2) {
      fetchBillingData(page + 1, true);
    }
  }, [page, hasMore, isLoading, fetchBillingData]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Handle hours change with auto-save
  const handleHoursChange = useCallback((uniqueId, value) => {
    setRecords(prev => prev.map(r => {
      if (r.uniqueId === uniqueId) {
        const hours = Number(value) || 0;
        const costing = hours * (r.rate || 0);
        const profit = (r.total_amount || 0) - costing;
        return { ...r, hours, costing, profit };
      }
      return r;
    }));

    if (saveTimeouts.current.has(uniqueId)) {
      clearTimeout(saveTimeouts.current.get(uniqueId));
    }

    const timeout = setTimeout(async () => {
      try {
        const currentRecord = records.find(r => r.uniqueId === uniqueId);
        if (!currentRecord) return;

        await fetch(`${apiBaseUrl}/billing/update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource_id: currentRecord.resource_id,
            subproject_id: currentRecord.subproject_id,
            request_type: currentRecord.request_type || currentRecord.requestor_type,
            month: parseInt(filters.month),
            year: parseInt(filters.year),
            hours: Number(value) || 0
          })
        });
      } catch (error) {
        console.error('Save failed:', error);
      }
    }, 1000);

    saveTimeouts.current.set(uniqueId, timeout);
  }, [records, filters]);

  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    setFilters(prev => ({ ...prev, [id]: value, ...(id === 'project' ? { subProject: '' } : {}) }));
  };

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = () => {
    const params = new URLSearchParams({ month: filters.month, year: filters.year });
    if (filters.project) params.append('project_id', filters.project);
    window.open(`${apiBaseUrl}/billing/export/${activeClient}?${params}`, '_blank');
  };

  const SortIcon = ({ column }) => (
    <span className="ml-0.5 text-slate-400 text-[10px]">
      {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '◆'}
    </span>
  );

  const profitPercent = totals.totalRevenue > 0 ? ((totals.profit / totals.totalRevenue) * 100).toFixed(1) : 0;

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Compact Header */}
      <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Costing Dashboard</h1>
          <p className="text-xs text-slate-400">Live billing from allocations</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div><span className="text-slate-400">Cases:</span> <span className="font-semibold">{formatNumber(totals.totalCases)}</span></div>
          <div><span className="text-slate-400">Cost:</span> <span className="font-semibold text-rose-400">{formatCurrency(totals.totalCosting)}</span></div>
          <div><span className="text-slate-400">Revenue:</span> <span className="font-semibold text-blue-400">{formatCurrency(totals.totalRevenue)}</span></div>
          <div><span className="text-slate-400">Profit:</span> <span className={`font-semibold ${totals.profit >= 0 ? 'text-emerald-400' : 'text-orange-400'}`}>{formatCurrency(totals.profit)} ({profitPercent}%)</span></div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap items-center gap-2">
        {/* Client Tabs */}
        <div className="flex items-center gap-1 mr-3">
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

        <span className="text-slate-200">|</span>

        {/* Filters */}
        <select id="project" value={filters.project} onChange={handleFilterChange}
          className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
          <option value="">All Process</option>
          {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>

        <select id="requestType" value={filters.requestType} onChange={handleFilterChange}
          className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
          <option value="">All Types</option>
          {(REQUEST_TYPES[activeClient] || []).map(rt => <option key={rt} value={rt}>{rt}</option>)}
        </select>

        <select id="month" value={filters.month} onChange={handleFilterChange}
          className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
          ))}
        </select>

        <select id="year" value={filters.year} onChange={handleFilterChange}
          className="px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-slate-400">
          {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <input type="text" placeholder="Search..." value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-2 py-1.5 text-xs border rounded w-28 focus:ring-1 focus:ring-slate-400" />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{records.length}/{totalRecords}</span>
          <button onClick={() => fetchBillingData(1, false)} disabled={isLoading}
            className="px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">↻</button>
          <button onClick={handleExport} disabled={records.length === 0}
            className="px-3 py-1.5 text-xs bg-slate-800 text-white hover:bg-slate-700 rounded disabled:opacity-50">
            ↓ Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="p-3">
        <div ref={scrollRef} className="bg-white rounded-lg shadow-sm overflow-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr>
                <th onClick={() => requestSort('project_name')} className="border-b border-slate-200 px-2 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100">
                  Process<SortIcon column="project_name" />
                </th>
                <th onClick={() => requestSort('subproject_name')} className="border-b border-slate-200 px-2 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100">
                  Location<SortIcon column="subproject_name" />
                </th>
                <th className="border-b border-slate-200 px-2 py-2.5 text-left font-semibold text-slate-600">Type</th>
                <th onClick={() => requestSort('resource_name')} className="border-b border-slate-200 px-2 py-2.5 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100">
                  Resource<SortIcon column="resource_name" />
                </th>
                <th onClick={() => requestSort('cases')} className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 bg-blue-50/50">
                  Cases<SortIcon column="cases" />
                </th>
                <th className="border-b border-slate-200 px-2 py-2.5 text-center font-semibold text-slate-600">Hours</th>
                <th className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600">Rate</th>
                <th onClick={() => requestSort('costing')} className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 bg-rose-50/50">
                  Costing<SortIcon column="costing" />
                </th>
                <th className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600">Flat Rate</th>
                <th onClick={() => requestSort('total_amount')} className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 bg-blue-50/50">
                  Revenue<SortIcon column="total_amount" />
                </th>
                <th onClick={() => requestSort('profit')} className="border-b border-slate-200 px-2 py-2.5 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 bg-emerald-50/50">
                  Profit<SortIcon column="profit" />
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec, idx) => (
                <tr key={rec.uniqueId || idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600">
                      {rec.project_name?.replace('_', ' ') || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 font-medium text-slate-800 max-w-[140px] truncate" title={rec.subproject_name}>
                    {rec.subproject_name}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      rec.request_type === 'New Request' ? 'bg-blue-100 text-blue-700' :
                      rec.request_type === 'Key' ? 'bg-violet-100 text-violet-700' :
                      rec.request_type === 'Duplicate' ? 'bg-amber-100 text-amber-700' :
                      rec.requestor_type === 'NRS-NO Records' ? 'bg-emerald-100 text-emerald-700' :
                      rec.requestor_type === 'Manual' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {rec.request_type || rec.requestor_type || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600">
                        {rec.resource_name?.charAt(0) || '?'}
                      </span>
                      <span className="font-medium text-slate-700">{rec.resource_name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-bold text-blue-700 bg-blue-50/30">{formatNumber(rec.cases)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <input type="number" min={0} step={0.5} value={rec.hours || 0}
                      onChange={(e) => handleHoursChange(rec.uniqueId, e.target.value)}
                      className="w-12 px-1 py-0.5 border border-slate-200 rounded text-center text-xs focus:ring-1 focus:ring-slate-400 focus:outline-none" />
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{formatCurrency(rec.rate)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-rose-600 bg-rose-50/30">{formatCurrency(rec.costing)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{formatCurrency(rec.flatrate)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-blue-600 bg-blue-50/30">{formatCurrency(rec.total_amount)}</td>
                  <td className={`px-2 py-1.5 text-right font-bold bg-emerald-50/30 ${rec.profit >= 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {formatCurrency(rec.profit)}
                  </td>
                </tr>
              ))}

              {isLoading && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-slate-500">
                    <div className="flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Loading...
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && records.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-500">
                    <div className="text-2xl mb-2">📋</div>
                    <p className="font-medium">No data found</p>
                    <p className="text-[10px] mt-1">No allocations for this period</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CostingDashboard;