// pages/dashboards/MRODashboard.jsx - MRO CLIENT DASHBOARD
// Clean UI, Fixed filters, Process type dropdown, Integrated detailed entries

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL  ;

// Color palette for dynamic columns
const COLUMN_COLORS = [
  { bg: 'bg-teal-50', header: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-500' },
  { bg: 'bg-blue-50', header: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-500' },
  { bg: 'bg-purple-50', header: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-500' },
  { bg: 'bg-orange-50', header: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-500' },
  { bg: 'bg-pink-50', header: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-500' },
  { bg: 'bg-indigo-50', header: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-500' },
  { bg: 'bg-cyan-50', header: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-500' },
  { bg: 'bg-amber-50', header: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-500' },
];

const RequestTypeBadge = ({ type }) => {
  if (!type) return <span className="text-gray-400 text-xs">—</span>;
  const colors = {
    'New Request': 'bg-green-100 text-green-700',
    'Key': 'bg-yellow-100 text-yellow-700',
    'Duplicate': 'bg-orange-100 text-orange-700',
    'Follow up': 'bg-blue-100 text-blue-700',
    'Batch': 'bg-purple-100 text-purple-700',
    'NRS-NO Records': 'bg-teal-100 text-teal-700',
    'Manual': 'bg-amber-100 text-amber-700'
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>{type}</span>;
};

const MRODashboard = () => {
  const [activeView, setActiveView] = useState('processing');
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    geography_id: '',
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString(),
    resource_email: '',
    subproject_id: '',
    process_type: '' // Added process type filter
  });
  
  // Master data
  const [geographies, setGeographies] = useState([]);
  const [allResources, setAllResources] = useState([]); // ALL resources
  const [mroResources, setMroResources] = useState([]); // Filtered MRO resources
  const [subprojects, setSubprojects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Summary Data
  const [allocations, setAllocations] = useState([]);
  const [processingSummary, setProcessingSummary] = useState([]);
  const [loggingSummary, setLoggingSummary] = useState([]);
  const [processingTotals, setProcessingTotals] = useState(null);
  const [loggingTotals, setLoggingTotals] = useState(null);
  const [allTypes, setAllTypes] = useState([]);
  const [loggingTypes, setLoggingTypes] = useState([]);
  
  // Detailed Entries
  const [showDetailed, setShowDetailed] = useState(true);
  const [detailedData, setDetailedData] = useState([]);
  const [detailedPage, setDetailedPage] = useState(1);
  const [detailedPages, setDetailedPages] = useState(1);
  const [detailedTotal, setDetailedTotal] = useState(0);
  const [detailedLoading, setDetailedLoading] = useState(false);
  const [detailedSearch, setDetailedSearch] = useState('');
  
  const [sortConfig, setSortConfig] = useState({ key: 'location', direction: 'asc' });

  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amt || 0);
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);
  const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—';
  const getAuthToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
  const getColumnColor = (idx) => COLUMN_COLORS[idx % COLUMN_COLORS.length];

  // Fetch geographies
  useEffect(() => {
    const fetchGeo = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/geography`);
        const data = await res.json();
        setGeographies(Array.isArray(data) ? data : data.geographies || data.data || []);
      } catch (e) { console.error(e); }
    };
    fetchGeo();
  }, []);

  // Fetch ALL resources (handle pagination) and filter for MRO - FIXED
  useEffect(() => {
    const fetchAllResources = async () => {
      try {
        const token = getAuthToken();
        let allResourcesList = [];
        let page = 1;
        let hasMore = true;
        
        // Fetch all pages of resources
        while (hasMore) {
          const res = await fetch(`${apiBaseUrl}/resource?page=${page}&limit=100`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          
          const pageResources = data.resources || data.data || data || [];
          allResourcesList = [...allResourcesList, ...pageResources];
          
          // Check if there are more pages
          if (data.pagination) {
            hasMore = data.pagination.hasMore || page < data.pagination.totalPages;
          } else if (data.pages) {
            hasMore = page < data.pages;
          } else {
            hasMore = false; // No pagination info, assume single page
          }
          page++;
          
          // Safety limit
          if (page > 20) break;
        }
        
        setAllResources(allResourcesList);
        
        // Filter MRO resources - check all possible assignment structures
        const mro = allResourcesList.filter(r => {
          // Check assignments array
          if (r.assignments?.length > 0) {
            return r.assignments.some(a => 
              a.client_name?.toLowerCase() === 'mro' ||
              a.client?.name?.toLowerCase() === 'mro'
            );
          }
          // Check allocated_clients
          if (r.allocated_clients?.length > 0) {
            return r.allocated_clients.some(c => 
              c.client_name?.toLowerCase() === 'mro' ||
              c.name?.toLowerCase() === 'mro'
            );
          }
          // Check direct client_name
          return r.client_name?.toLowerCase() === 'mro';
        });
        
        // If no MRO resources found, show all (fallback)
        setMroResources(mro.length > 0 ? mro : allResourcesList);
      } catch (e) { 
        console.error('Resource fetch error:', e);
        setMroResources([]);
      }
    };
    fetchAllResources();
  }, []);

  // Fetch subprojects - FIXED API path
  useEffect(() => {
    const fetchSP = async () => {
      try {
        const token = getAuthToken();
        // First get MRO client
        const clientRes = await fetch(`${apiBaseUrl}/client?search=MRO`);
        const clients = await clientRes.json();
        const mroClient = (Array.isArray(clients) ? clients : clients.data || []).find(c => c.name.toLowerCase() === 'mro');
        
        if (mroClient) {
          // Get projects for this client first
          const projRes = await fetch(`${apiBaseUrl}/project/client/${mroClient._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const projData = await projRes.json();
          const projectList = projData.projects || projData || [];
          
          // Fetch subprojects for each project
          let allSubprojects = [];
          for (const project of projectList) {
            try {
              const spRes = await fetch(`${apiBaseUrl}/project/${project._id}/subproject`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              const spData = await spRes.json();
              const sps = spData.data || spData || [];
              allSubprojects = [...allSubprojects, ...sps];
            } catch (e) {
              console.log('Error fetching subprojects for project:', project._id);
            }
          }
          
          setSubprojects(allSubprojects);
        }
      } catch (e) { console.error('Subproject fetch error:', e); }
    };
    fetchSP();
  }, []);

  // Fetch summary allocations
  const fetchAllocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams({
        month: filters.month,
        year: filters.year,
        limit: '1000',
        process_type: filters.process_type || (activeView === 'processing' ? 'Processing' : 'Logging')
      });

      if (filters.resource_email) params.append('resource_email', filters.resource_email);
      if (filters.subproject_id) params.append('subproject_key', filters.subproject_id);

      const res = await fetch(`${apiBaseUrl}/mro-daily-allocations/admin/all?${params}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAllocations(data.allocations || []);
      processIntoSummary(data.allocations || []);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load data');
      setAllocations([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters, activeView]);

  // Fetch detailed entries
  const fetchDetailed = useCallback(async (page = 1) => {
    setDetailedLoading(true);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams({
        month: filters.month,
        year: filters.year,
        page: page.toString(),
        limit: '20',
        process_type: filters.process_type || (activeView === 'processing' ? 'Processing' : 'Logging')
      });

      if (filters.resource_email) params.append('resource_email', filters.resource_email);
      if (filters.subproject_id) params.append('subproject_key', filters.subproject_id);
      if (detailedSearch) params.append('search', detailedSearch);

      const res = await fetch(`${apiBaseUrl}/mro-daily-allocations/admin/all?${params}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDetailedData(data.allocations || []);
      setDetailedPage(data.page || 1);
      setDetailedPages(data.pages || 1);
      setDetailedTotal(data.total || 0);
    } catch (e) {
      console.error(e);
      setDetailedData([]);
    } finally {
      setDetailedLoading(false);
    }
  }, [filters, activeView, detailedSearch]);

  // Process into summary
  const processIntoSummary = useCallback((allocs) => {
    let filtered = allocs;
    if (filters.geography_id) {
      const geo = geographies.find(g => g._id === filters.geography_id);
      if (geo) filtered = allocs.filter(a => a.geography_name?.toLowerCase() === geo.name?.toLowerCase());
    }

    const processType = filters.process_type || (activeView === 'processing' ? 'Processing' : 'Logging');

    if (processType === 'Processing' || activeView === 'processing') {
      // Fixed billing categories: only NRS-NO Records and Manual
      const fixedTypes = ['NRS-NO Records', 'Manual'];
      setAllTypes(fixedTypes);

      // Build rate map from loaded subprojects (project configuration is the primary source)
      // Subproject API returns requestor_types[]{name, rate} — NOT billing_rates[]{requestor_type, rate}
      const subprojectRatesMap = {};
      subprojects.forEach(sp => {
        if (!sp._id) return;
        const spKey = sp._id.toString();
        // Support both field shapes returned by different API versions
        const rtList = sp.requestor_types || sp.billing_rates || [];
        const getRate = (typeName) => {
          const entry = rtList.find(r => (r.name || r.requestor_type) === typeName);
          return entry?.rate || 0;
        };
        subprojectRatesMap[spKey] = {
          nrsRate: getRate('NRS-NO Records'),
          manualRate: getRate('Manual')
        };
      });

      // First pass: determine NRS and Manual billing rates per location
      // Initialize from subproject config first, then override with allocation billing_rate if non-zero
      const locationRates = {};
      filtered.forEach(a => {
        if (a.process_type !== 'Processing') return;
        const key = a.subproject_id?.toString() || a.subproject_name;
        if (!locationRates[key]) {
          // Seed from subproject billing_rates (from project config)
          const spRates = subprojectRatesMap[a.subproject_id?.toString()] || {};
          locationRates[key] = {
            nrsRate: spRates.nrsRate || 0,
            manualRate: spRates.manualRate || 0
          };
        }
        // Also pick up rates from allocations that already have correct billing_rate
        if (a.requestor_type === 'NRS-NO Records' && a.billing_rate > 0) {
          locationRates[key].nrsRate = a.billing_rate;
        }
        if (a.requestor_type === 'Manual' && a.billing_rate > 0) {
          locationRates[key].manualRate = a.billing_rate;
        }
        if ((a.requestor_type === 'Processed' || a.requestor_type === 'Processed through File Drop') && a.billing_rate > 0 && !locationRates[key].manualRate) {
          locationRates[key].manualRate = a.billing_rate;
        }
      });

      // Second pass: categorize all allocations into NRS-NO Records or Manual
      // 'Processed', 'Manual', 'Processed through File Drop' → Manual column (at Manual rate)
      // All other requestor_types (NRS-NO Records etc.) → NRS-NO Records column (at NRS rate)
      const locMap = new Map();
      filtered.forEach(a => {
        if (a.process_type !== 'Processing') return;
        const key = a.subproject_id?.toString() || a.subproject_name;
        if (!locMap.has(key)) {
          locMap.set(key, { location: a.subproject_name, byType: {}, totalCases: 0, totalBilling: 0 });
        }
        const entry = locMap.get(key);
        const rates = locationRates[key] || { nrsRate: 0, manualRate: 0 };

        const isManualType = a.requestor_type === 'Processed' || a.requestor_type === 'Manual' || a.requestor_type === 'Processed through File Drop';
        const typeKey = isManualType ? 'Manual' : 'NRS-NO Records';
        const rate = typeKey === 'Manual'
          ? (rates.manualRate || a.billing_rate || 0)
          : (rates.nrsRate || a.billing_rate || 0);
        const amount = rate;

        if (!entry.byType[typeKey]) entry.byType[typeKey] = { cases: 0, rate: 0, total: 0 };
        entry.byType[typeKey].cases += 1;
        entry.byType[typeKey].total += amount;
        if (rate > 0) entry.byType[typeKey].rate = rate;
        entry.totalCases += 1;
        entry.totalBilling += amount;
      });

      let summary = Array.from(locMap.values());
      if (searchTerm) summary = summary.filter(r => r.location?.toLowerCase().includes(searchTerm.toLowerCase()));
      setProcessingSummary(summary);

      const totals = { byType: {}, totalBilling: 0, grandTotal: 0 };
      fixedTypes.forEach(t => { totals.byType[t] = { cases: 0, total: 0 }; });
      summary.forEach(r => {
        fixedTypes.forEach(t => {
          if (r.byType[t]) {
            totals.byType[t].cases += r.byType[t].cases;
            totals.byType[t].total += r.byType[t].total;
          }
        });
        totals.totalBilling += r.totalBilling;
        totals.grandTotal += r.totalCases;
      });
      setProcessingTotals(totals);
    }

    if (processType === 'Logging' || activeView === 'logging') {
      const loggingAllocs = filtered.filter(a => a.process_type === 'Logging');
      const typeSet = new Set();
      loggingAllocs.forEach(a => { if (a.request_type) typeSet.add(a.request_type); });
      setLoggingTypes(Array.from(typeSet).sort());

      const locMap = new Map();
      loggingAllocs.forEach(a => {
        const key = a.subproject_id?.toString() || a.subproject_name;
        if (!locMap.has(key)) {
          locMap.set(key, { location: a.subproject_name, billingRate: a.billing_rate || 1.08, byType: {}, totalCases: 0, totalBilling: 0 });
        }
        const entry = locMap.get(key);
        const typeKey = a.request_type || 'Other';
        if (!entry.byType[typeKey]) entry.byType[typeKey] = { cases: 0, total: 0 };
        entry.byType[typeKey].cases += 1;
        entry.byType[typeKey].total += a.billing_amount || a.billing_rate || 1.08;
        entry.totalCases += 1;
        entry.totalBilling += a.billing_amount || a.billing_rate || 1.08;
        if (a.billing_rate > 0) entry.billingRate = a.billing_rate;
      });

      let summary = Array.from(locMap.values());
      if (searchTerm) summary = summary.filter(r => r.location?.toLowerCase().includes(searchTerm.toLowerCase()));
      setLoggingSummary(summary);

      const totals = { byType: {}, totalCases: 0, totalBilling: 0 };
      Array.from(typeSet).forEach(t => { totals.byType[t] = { cases: 0, total: 0 }; });
      summary.forEach(r => {
        Array.from(typeSet).forEach(t => {
          if (r.byType[t]) {
            totals.byType[t].cases += r.byType[t].cases;
            totals.byType[t].total += r.byType[t].total;
          }
        });
        totals.totalCases += r.totalCases;
        totals.totalBilling += r.totalBilling;
      });
      setLoggingTotals(totals);
    }
  }, [activeView, searchTerm, filters.geography_id, filters.process_type, geographies, subprojects]);

  useEffect(() => {
    if (allocations.length > 0) processIntoSummary(allocations);
  }, [searchTerm, filters.geography_id, processIntoSummary]);

  useEffect(() => {
    const t = setTimeout(() => { fetchAllocations(); fetchDetailed(1); }, 300);
    return () => clearTimeout(t);
  }, [filters.month, filters.year, filters.resource_email, filters.subproject_id, filters.process_type, activeView, fetchAllocations, fetchDetailed]);

  useEffect(() => {
    const t = setTimeout(() => fetchDetailed(1), 500);
    return () => clearTimeout(t);
  }, [detailedSearch, fetchDetailed]);

  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    setFilters(prev => ({ ...prev, [id]: value }));
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedProcessing = useMemo(() => {
    return [...processingSummary].sort((a, b) => {
      let aVal = sortConfig.key === 'location' ? a.location : (a[sortConfig.key] || a.byType[sortConfig.key]?.cases || 0);
      let bVal = sortConfig.key === 'location' ? b.location : (b[sortConfig.key] || b.byType[sortConfig.key]?.cases || 0);
      if (typeof aVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [processingSummary, sortConfig]);

  const sortedLogging = useMemo(() => {
    return [...loggingSummary].sort((a, b) => {
      let aVal = sortConfig.key === 'location' ? a.location : (a[sortConfig.key] || a.byType[sortConfig.key]?.cases || 0);
      let bVal = sortConfig.key === 'location' ? b.location : (b[sortConfig.key] || b.byType[sortConfig.key]?.cases || 0);
      if (typeof aVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [loggingSummary, sortConfig]);

  const exportCSV = () => {
    const data = activeView === 'processing' ? sortedProcessing : sortedLogging;
    const types = activeView === 'processing' ? allTypes : loggingTypes;
    if (data.length === 0) { toast.error('No data'); return; }

    let headers = ['Sr', 'Location'];
    types.forEach(t => headers.push(`${t} Cases`, `${t} Total`));
    headers.push('Total Cases', 'Total Billing');

    const rows = data.map((r, i) => {
      const row = [i + 1, r.location];
      types.forEach(t => { row.push(r.byType[t]?.cases || 0, (r.byType[t]?.total || 0).toFixed(2)); });
      row.push(r.totalCases, r.totalBilling.toFixed(2));
      return row;
    });

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mro-${activeView}-${filters.month}-${filters.year}.csv`;
    a.click();
    toast.success('Exported!');
  };

  const SortIcon = ({ col }) => (
    <span className="text-gray-400 ml-0.5 text-[10px]">
      {sortConfig.key === col ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '◆'}
    </span>
  );

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="bg-emerald-700 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">MRO Billing Dashboard</h1>
          <p className="text-xs text-emerald-200">{new Date(parseInt(filters.year), parseInt(filters.month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div><span className="text-emerald-200">Locations:</span> <span className="font-semibold">{activeView === 'processing' ? sortedProcessing.length : sortedLogging.length}</span></div>
          <div><span className="text-emerald-200">Cases:</span> <span className="font-semibold">{formatNumber(activeView === 'processing' ? processingTotals?.grandTotal : loggingTotals?.totalCases)}</span></div>
          <div><span className="text-emerald-200">Billing:</span> <span className="font-semibold">{formatCurrency(activeView === 'processing' ? processingTotals?.totalBilling : loggingTotals?.totalBilling)}</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center gap-1 mr-2">
            <button onClick={() => setActiveView('processing')}
              className={`px-3 py-1.5 rounded text-xs font-medium ${activeView === 'processing' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Processing
            </button>
            <button onClick={() => setActiveView('logging')}
              className={`px-3 py-1.5 rounded text-xs font-medium ${activeView === 'logging' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Logging
            </button>
          </div>

          <span className="text-gray-300">|</span>

          {/* Process Type Filter */}
          <select id="process_type" value={filters.process_type} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[100px]">
            <option value="">All Process</option>
            <option value="Processing">Processing</option>
            <option value="Logging">Logging</option>
          </select>

          {/* Geography */}
          <select id="geography_id" value={filters.geography_id} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded">
            <option value="">All Geo</option>
            {geographies.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>

          {/* Resource - FIXED to show all MRO resources */}
          <select id="resource_email" value={filters.resource_email} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[140px]">
            <option value="">All Resources ({mroResources.length})</option>
            {mroResources.map(r => (
              <option key={r._id} value={r.email}>{r.name}</option>
            ))}
          </select>

          {/* Location */}
          <select id="subproject_id" value={filters.subproject_id} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[120px]">
            <option value="">All Locations</option>
            {subprojects.map(sp => <option key={sp._id} value={sp.business_key || sp._id}>{sp.name}</option>)}
          </select>

          {/* Month/Year */}
          <select id="month" value={filters.month} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'short' })}</option>
            ))}
          </select>
          <select id="year" value={filters.year} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded">
            {[2027, 2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {/* Search */}
          <input type="text" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2 py-1.5 text-xs border rounded w-24" />

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { fetchAllocations(); fetchDetailed(1); }} disabled={isLoading}
              className="px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">↻</button>
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700 rounded">↓ Export</button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Summary Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">📊 Location Summary ({activeView})</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '38vh' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100">
                {activeView === 'processing' ? (
                  <>
                    <tr>
                      <th colSpan={2} className="border-b border-slate-200"></th>
                      {allTypes.map((t, i) => (
                        <th key={t} colSpan={3} className={`py-1.5 px-1 text-center text-[10px] font-bold uppercase ${getColumnColor(i).header} border-l border-b`}>{t}</th>
                      ))}
                      <th colSpan={2} className="py-1.5 px-2 text-center text-[10px] font-bold uppercase bg-green-100 border-l border-b">Totals</th>
                    </tr>
                    <tr>
                      <th className="py-2 px-2 text-left font-semibold w-8 border-b">Sr</th>
                      <th onClick={() => handleSort('location')} className="py-2 px-2 text-left font-semibold min-w-[180px] cursor-pointer hover:bg-slate-200 border-b">Location <SortIcon col="location" /></th>
                      {allTypes.map((t, i) => (
                        <React.Fragment key={t}>
                          <th className={`py-2 px-3 text-right font-semibold w-36 border-l border-b ${getColumnColor(i).bg}`}>Cases</th>
                          <th className={`py-2 px-3 text-right font-semibold w-36 border-b ${getColumnColor(i).bg}`}>Payout Rate</th>
                          <th className={`py-2 px-3 text-right font-semibold w-40 border-b ${getColumnColor(i).bg}`}>Total</th>
                        </React.Fragment>
                      ))}
                      <th className="py-2 px-3 text-right font-semibold w-40 border-l border-b bg-green-50">Billing</th>
                      <th className="py-2 px-3 text-right font-semibold w-36 border-b bg-yellow-50">Total</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th className="py-2 px-2 text-left font-semibold w-8 border-b">Sr</th>
                    <th onClick={() => handleSort('location')} className="py-2 px-2 text-left font-semibold min-w-[180px] cursor-pointer hover:bg-slate-200 border-b">Location <SortIcon col="location" /></th>
                    {loggingTypes.map((t, i) => (
                      <th key={t} className={`py-2 px-3 text-right font-semibold w-36 border-b ${getColumnColor(i).header}`}>{t}</th>
                    ))}
                    <th className="py-2 px-3 text-right font-semibold w-36 border-b">Billing Rate</th>
                    <th className="py-2 px-3 text-right font-semibold w-36 border-b bg-blue-50">Total</th>
                    <th className="py-2 px-3 text-right font-semibold w-40 border-b bg-green-50">Billing</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={20} className="py-8 text-center text-gray-500">Loading...</td></tr>
                ) : activeView === 'processing' ? (
                  sortedProcessing.length === 0 ? (
                    <tr><td colSpan={20} className="py-8 text-center text-gray-500">No data</td></tr>
                  ) : (
                    <>
                      {sortedProcessing.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800" title={r.location}>{r.location}</td>
                          {allTypes.map((t, i) => {
                            const d = r.byType[t];
                            const c = getColumnColor(i);
                            const has = d?.cases > 0;
                            return (
                              <React.Fragment key={t}>
                                <td className={`py-1.5 px-3 text-right border-l ${has ? `${c.bg} font-medium` : 'text-slate-300'}`}>{d?.cases || 0}</td>
                                <td className={`py-1.5 px-3 text-right ${has ? c.bg : ''} text-slate-500`}>{d?.rate > 0 ? `$${d.rate.toFixed(2)}` : '-'}</td>
                                <td className={`py-1.5 px-3 text-right ${has ? `${c.bg} ${c.text} font-medium` : 'text-slate-300'}`}>{has ? formatCurrency(d.total) : '$0.00'}</td>
                              </React.Fragment>
                            );
                          })}
                          <td className="py-1.5 px-3 text-right font-semibold text-green-700 border-l bg-green-50/50">{formatCurrency(r.totalBilling)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-800 bg-yellow-50/50">{r.totalCases}</td>
                        </tr>
                      ))}
                      {processingTotals && (
                        <tr className="bg-slate-800 text-white font-semibold sticky bottom-0">
                          <td className="py-2 px-2"></td>
                          <td className="py-2 px-2">Total</td>
                          {allTypes.map(t => (
                            <React.Fragment key={t}>
                              <td className="py-2 px-3 text-right border-l border-slate-600">{processingTotals.byType[t]?.cases || 0}</td>
                              <td className="py-2 px-3"></td>
                              <td className="py-2 px-3 text-right">{formatCurrency(processingTotals.byType[t]?.total || 0)}</td>
                            </React.Fragment>
                          ))}
                          <td className="py-2 px-3 text-right border-l border-slate-600 bg-green-600">{formatCurrency(processingTotals.totalBilling)}</td>
                          <td className="py-2 px-3 text-right bg-yellow-600">{processingTotals.grandTotal}</td>
                        </tr>
                      )}
                    </>
                  )
                ) : (
                  sortedLogging.length === 0 ? (
                    <tr><td colSpan={20} className="py-8 text-center text-gray-500">No data</td></tr>
                  ) : (
                    <>
                      {sortedLogging.map((r, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800" title={r.location}>{r.location}</td>
                          {loggingTypes.map((t, i) => {
                            const d = r.byType[t];
                            const c = getColumnColor(i);
                            const has = d?.cases > 0;
                            return <td key={t} className={`py-1.5 px-3 text-right ${has ? `${c.bg} ${c.text} font-medium` : 'text-slate-300'}`}>{d?.cases || 0}</td>;
                          })}
                          <td className="py-1.5 px-3 text-right text-slate-600">${(r.billingRate || 1.08).toFixed(2)}</td>
                          <td className="py-1.5 px-3 text-right font-medium text-blue-700 bg-blue-50/50">{r.totalCases}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-green-700 bg-green-50/50">{formatCurrency(r.totalBilling)}</td>
                        </tr>
                      ))}
                      {loggingTotals && (
                        <tr className="bg-slate-800 text-white font-semibold sticky bottom-0">
                          <td className="py-2 px-2"></td>
                          <td className="py-2 px-2">Total</td>
                          {loggingTypes.map(t => <td key={t} className="py-2 px-3 text-right">{loggingTotals.byType[t]?.cases || 0}</td>)}
                          <td className="py-2 px-3"></td>
                          <td className="py-2 px-3 text-right bg-blue-600">{loggingTotals.totalCases}</td>
                          <td className="py-2 px-3 text-right bg-green-600">{formatCurrency(loggingTotals.totalBilling)}</td>
                        </tr>
                      )}
                    </>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Entries */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDetailed(!showDetailed)} className="text-gray-500 hover:text-gray-700">{showDetailed ? '▼' : '▶'}</button>
              <span className="text-xs font-semibold text-gray-700">📋 Detailed Entries • {formatNumber(detailedTotal)} records</span>
            </div>
            <input type="text" placeholder="Search..." value={detailedSearch} onChange={(e) => setDetailedSearch(e.target.value)}
              className="px-2 py-1 text-xs border rounded w-36" />
          </div>

          {showDetailed && (
            <>
              <div className="overflow-auto" style={{ maxHeight: '32vh' }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className="py-2 px-2 text-left font-semibold border-b">Date</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Resource</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Location</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Req ID</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Type</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Requestor</th>
                      <th className="py-2 px-2 text-right font-semibold border-b">Rate</th>
                      <th className="py-2 px-2 text-right font-semibold border-b bg-green-50">Amount</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailedLoading ? (
                      <tr><td colSpan={9} className="py-6 text-center text-gray-500">Loading...</td></tr>
                    ) : detailedData.length === 0 ? (
                      <tr><td colSpan={9} className="py-6 text-center text-gray-500">No entries</td></tr>
                    ) : (
                      detailedData.map((a, i) => (
                        <tr key={a._id || i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-2 text-slate-600">{formatDate(a.allocation_date)}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800">{a.resource_name}</td>
                          <td className="py-1.5 px-2 text-slate-700 max-w-[100px] truncate" title={a.subproject_name}>{a.subproject_name}</td>
                          <td className="py-1.5 px-2 text-slate-600 font-mono text-[10px]">{a.request_id || '—'}</td>
                          <td className="py-1.5 px-2"><RequestTypeBadge type={a.request_type} /></td>
                          <td className="py-1.5 px-2"><RequestTypeBadge type={a.requestor_type} /></td>
                          <td className="py-1.5 px-2 text-right text-slate-600">{formatCurrency(a.billing_rate)}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-green-700 bg-green-50/50">{formatCurrency(a.billing_amount)}</td>
                          <td className="py-1.5 px-2 text-slate-500 max-w-[80px] truncate" title={a.remark}>{a.remark || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {detailedPages > 1 && (
                <div className="px-3 py-2 border-t bg-gray-50 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Page {detailedPage} of {detailedPages}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => fetchDetailed(1)} disabled={detailedPage <= 1} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">««</button>
                    <button onClick={() => fetchDetailed(detailedPage - 1)} disabled={detailedPage <= 1} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">‹</button>
                    <span className="px-2">{detailedPage}</span>
                    <button onClick={() => fetchDetailed(detailedPage + 1)} disabled={detailedPage >= detailedPages} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">›</button>
                    <button onClick={() => fetchDetailed(detailedPages)} disabled={detailedPage >= detailedPages} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MRODashboard;