// pages/dashboards/VerismaDashboard.jsx - VERISMA CLIENT DASHBOARD
// Clean UI, Fixed filters, Process type dropdown, Integrated detailed entries

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

const RequestTypeBadge = ({ type }) => {
  if (!type) return <span className="text-gray-400 text-xs">—</span>;
  const colors = {
    'New Request': 'bg-blue-100 text-blue-700',
    'Key': 'bg-purple-100 text-purple-700',
    'Duplicate': 'bg-orange-100 text-orange-700'
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>{type}</span>;
};

const VerismaDashboard = () => {
  // State
  const [geographies, setGeographies] = useState([]);
  const [allResources, setAllResources] = useState([]);
  const [verismaResources, setVerismaResources] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subprojects, setSubprojects] = useState([]);
  
  const [filters, setFilters] = useState({
    geography: '',
    resource_id: '',
    resource_email: '',
    project_id: '', // Process type filter
    subproject_id: '',
    request_type: '',
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString()
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [allocations, setAllocations] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [totals, setTotals] = useState(null);
  
  // Detailed entries
  const [showDetailed, setShowDetailed] = useState(true);
  const [detailedSearch, setDetailedSearch] = useState('');
  const [detailedPage, setDetailedPage] = useState(1);
  const detailedLimit = 25;
  
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'location', direction: 'asc' });

  const formatCurrency = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amt || 0);
  const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);
  const formatDate = (date) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) : '—';
  const getAuthToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');

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

  // Fetch ALL resources (handle pagination) and filter for Verisma - FIXED
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
            hasMore = false;
          }
          page++;
          
          // Safety limit
          if (page > 20) break;
        }
        
        setAllResources(allResourcesList);
        
        // Filter Verisma resources - check all possible assignment structures
        const verisma = allResourcesList.filter(r => {
          // Check assignments array
          if (r.assignments?.length > 0) {
            return r.assignments.some(a => 
              a.client_name?.toLowerCase() === 'verisma' ||
              a.client?.name?.toLowerCase() === 'verisma'
            );
          }
          // Check allocated_clients
          if (r.allocated_clients?.length > 0) {
            return r.allocated_clients.some(c => 
              c.client_name?.toLowerCase() === 'verisma' ||
              c.name?.toLowerCase() === 'verisma'
            );
          }
          // Check direct client_name
          return r.client_name?.toLowerCase() === 'verisma';
        });
        
        // If no Verisma resources found, show all (fallback)
        setVerismaResources(verisma.length > 0 ? verisma : allResourcesList);
      } catch (e) { 
        console.error('Resource fetch error:', e);
        setVerismaResources([]);
      }
    };
    fetchAllResources();
  }, []);

  // Fetch projects (Process Types) and subprojects for Verisma - FIXED API path
  useEffect(() => {
    const fetchProjectsAndSubprojects = async () => {
      try {
        const token = getAuthToken();
        // First get Verisma client
        const clientRes = await fetch(`${apiBaseUrl}/client?search=Verisma`);
        const clients = await clientRes.json();
        const verismaClient = (Array.isArray(clients) ? clients : clients.data || []).find(c => c.name.toLowerCase() === 'verisma');
        
        if (verismaClient) {
          // Get projects for this client - use correct endpoint
          const projRes = await fetch(`${apiBaseUrl}/project/client/${verismaClient._id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const projData = await projRes.json();
          const projectList = projData.projects || projData || [];
          setProjects(projectList);
          
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
      } catch (e) { console.error('Projects/Subprojects fetch error:', e); }
    };
    fetchProjectsAndSubprojects();
  }, []);

  // Get date range
  const getDateRange = useCallback(() => {
    const year = parseInt(filters.year);
    const month = parseInt(filters.month);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return {
      start_date: `${year}-${String(month).padStart(2, '0')}-01`,
      end_date: `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
    };
  }, [filters.month, filters.year]);

  // Fetch allocations
  const fetchAllocations = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const dateRange = getDateRange();
      
      const params = new URLSearchParams({
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        limit: '500'
      });

      if (filters.resource_email) params.append('resource_email', filters.resource_email);
      if (filters.subproject_id) params.append('subproject_id', filters.subproject_id);
      if (filters.request_type) params.append('request_type', filters.request_type);

      const res = await fetch(`${apiBaseUrl}/verisma-daily-allocations/admin/all?${params}`, {
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
      setSummaryData([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters, getDateRange]);

  // Process into summary
  const processIntoSummary = useCallback((allocs) => {
    if (!allocs || allocs.length === 0) {
      setSummaryData([]);
      setTotals(null);
      return;
    }

    // Apply filters
    let filtered = allocs;
    
    // Geography filter
    if (filters.geography) {
      const geo = geographies.find(g => g._id === filters.geography);
      if (geo) {
        filtered = filtered.filter(a => a.geography_name?.toLowerCase() === geo.name?.toLowerCase());
      }
    }
    
    // Process type (project) filter
    if (filters.project_id) {
      const proj = projects.find(p => p._id === filters.project_id);
      if (proj) {
        filtered = filtered.filter(a => 
          a.project_id === filters.project_id || 
          a.project_name?.toLowerCase() === proj.name?.toLowerCase()
        );
      }
    }

    // Group by location + project
    const locationMap = new Map();
    
    filtered.forEach(alloc => {
      const key = `${alloc.subproject_id || alloc.subproject_name}-${alloc.project_id || alloc.project_name}`;
      
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          location: alloc.subproject_name || 'Unknown',
          subproject_id: alloc.subproject_id,
          processType: alloc.project_name || 'Unknown',
          project_id: alloc.project_id,
          geography_name: alloc.geography_name || '',
          geographyType: alloc.geography_name?.toLowerCase().includes('us') ? 'onshore' : 'offshore',
          duplicateCases: 0, duplicateTotal: 0,
          keyCases: 0, keyTotal: 0,
          newRequestCases: 0, newRequestTotal: 0,
          totalCases: 0, totalBilling: 0
        });
      }
      
      const entry = locationMap.get(key);
      const count = parseInt(alloc.count) || 1;
      const amount = parseFloat(alloc.billing_amount) || 0;
      
      if (alloc.request_type === 'Duplicate') {
        entry.duplicateCases += count;
        entry.duplicateTotal += amount;
      } else if (alloc.request_type === 'Key') {
        entry.keyCases += count;
        entry.keyTotal += amount;
      } else if (alloc.request_type === 'New Request') {
        entry.newRequestCases += count;
        entry.newRequestTotal += amount;
      }
      
      entry.totalCases = entry.duplicateCases + entry.keyCases + entry.newRequestCases;
      entry.totalBilling = entry.duplicateTotal + entry.keyTotal + entry.newRequestTotal;
    });

    let summary = Array.from(locationMap.values());
    
    // Search filter
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      summary = summary.filter(r => r.location?.toLowerCase().includes(s) || r.processType?.toLowerCase().includes(s));
    }

    setSummaryData(summary);

    // Calculate totals
    const calculatedTotals = summary.reduce((acc, r) => ({
      duplicateCases: acc.duplicateCases + r.duplicateCases,
      duplicateTotal: acc.duplicateTotal + r.duplicateTotal,
      keyCases: acc.keyCases + r.keyCases,
      keyTotal: acc.keyTotal + r.keyTotal,
      newRequestCases: acc.newRequestCases + r.newRequestCases,
      newRequestTotal: acc.newRequestTotal + r.newRequestTotal,
      totalCases: acc.totalCases + r.totalCases,
      totalBilling: acc.totalBilling + r.totalBilling
    }), {
      duplicateCases: 0, duplicateTotal: 0,
      keyCases: 0, keyTotal: 0,
      newRequestCases: 0, newRequestTotal: 0,
      totalCases: 0, totalBilling: 0
    });

    setTotals(calculatedTotals);
  }, [searchTerm, filters.geography, filters.project_id, geographies, projects]);

  // Re-process when client-side filters change
  useEffect(() => {
    if (allocations.length > 0) processIntoSummary(allocations);
  }, [searchTerm, filters.geography, filters.project_id, processIntoSummary]);

  // Fetch when server-side filters change
  useEffect(() => {
    const t = setTimeout(() => fetchAllocations(), 300);
    return () => clearTimeout(t);
  }, [filters.month, filters.year, filters.resource_email, filters.subproject_id, filters.request_type, fetchAllocations]);

  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    if (id === 'resource_id') {
      const r = allResources.find(res => res._id === value);
      setFilters(prev => ({ ...prev, resource_id: value, resource_email: r?.email || '' }));
    } else {
      setFilters(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const sortedData = useMemo(() => {
    return [...summaryData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === 'string') return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortConfig.direction === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });
  }, [summaryData, sortConfig]);

  // Filtered detailed entries
  const filteredDetailed = useMemo(() => {
    if (!detailedSearch) return allocations;
    const s = detailedSearch.toLowerCase();
    return allocations.filter(a => 
      a.resource_name?.toLowerCase().includes(s) || 
      a.subproject_name?.toLowerCase().includes(s) ||
      a.request_type?.toLowerCase().includes(s)
    );
  }, [allocations, detailedSearch]);

  // Paginated detailed entries
  const paginatedDetailed = useMemo(() => {
    const start = (detailedPage - 1) * detailedLimit;
    return filteredDetailed.slice(start, start + detailedLimit);
  }, [filteredDetailed, detailedPage]);

  const detailedTotalPages = Math.ceil(filteredDetailed.length / detailedLimit);

  const exportCSV = () => {
    if (sortedData.length === 0) { toast.error('No data'); return; }
    const headers = ['Sr', 'Location', 'Process Type', 'Duplicate', 'Dup Total', 'Key', 'Key Total', 'New Request', 'NR Total', 'Total Cases', 'Total Billing', 'Geo'];
    const rows = sortedData.map((r, i) => [
      i + 1, r.location, r.processType,
      r.duplicateCases, r.duplicateTotal.toFixed(2),
      r.keyCases, r.keyTotal.toFixed(2),
      r.newRequestCases, r.newRequestTotal.toFixed(2),
      r.totalCases, r.totalBilling.toFixed(2),
      r.geographyType === 'onshore' ? 'US' : 'IND'
    ]);
    if (totals) {
      rows.push(['', 'TOTAL', '', totals.duplicateCases, totals.duplicateTotal.toFixed(2), totals.keyCases, totals.keyTotal.toFixed(2), totals.newRequestCases, totals.newRequestTotal.toFixed(2), totals.totalCases, totals.totalBilling.toFixed(2), '']);
    }
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `verisma-billing-${filters.month}-${filters.year}.csv`;
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
      <div className="bg-blue-700 text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Verisma Billing Dashboard</h1>
          <p className="text-xs text-blue-200">{new Date(parseInt(filters.year), parseInt(filters.month) - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div><span className="text-blue-200">Locations:</span> <span className="font-semibold">{sortedData.length}</span></div>
          <div><span className="text-blue-200">Cases:</span> <span className="font-semibold">{formatNumber(totals?.totalCases)}</span></div>
          <div><span className="text-blue-200">Billing:</span> <span className="font-semibold">{formatCurrency(totals?.totalBilling)}</span></div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Process Type (Project) Filter */}
          <select id="project_id" value={filters.project_id} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[120px]">
            <option value="">All Process Types</option>
            {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>

          {/* Geography */}
          <select id="geography" value={filters.geography} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded">
            <option value="">All Geo</option>
            {geographies.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>

          {/* Resource - FIXED to show all */}
          <select id="resource_id" value={filters.resource_id} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[150px]">
            <option value="">All Resources ({verismaResources.length})</option>
            {verismaResources.map(r => (
              <option key={r._id} value={r._id}>{r.name}</option>
            ))}
          </select>

          {/* Location */}
          <select id="subproject_id" value={filters.subproject_id} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded min-w-[120px]">
            <option value="">All Locations</option>
            {subprojects.map(sp => <option key={sp._id} value={sp._id}>{sp.name}</option>)}
          </select>

          {/* Request Type */}
          <select id="request_type" value={filters.request_type} onChange={handleFilterChange}
            className="px-2 py-1.5 text-xs border rounded">
            <option value="">All Types</option>
            <option value="New Request">New Request</option>
            <option value="Key">Key</option>
            <option value="Duplicate">Duplicate</option>
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
            <button onClick={fetchAllocations} disabled={isLoading}
              className="px-2.5 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">↻</button>
            <button onClick={exportCSV} className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 rounded">↓ Export</button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Summary Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">📊 Location Summary</span>
            <span className="text-xs text-gray-500">{sortedData.length} locations</span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '38vh' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <th colSpan={3} className="border-b border-slate-200"></th>
                  <th colSpan={2} className="py-1.5 px-1 text-center text-[10px] font-bold uppercase bg-orange-100 text-orange-700 border-l border-b">Duplicate</th>
                  <th colSpan={2} className="py-1.5 px-1 text-center text-[10px] font-bold uppercase bg-purple-100 text-purple-700 border-l border-b">Key</th>
                  <th colSpan={2} className="py-1.5 px-1 text-center text-[10px] font-bold uppercase bg-blue-100 text-blue-700 border-l border-b">New Request</th>
                  <th colSpan={2} className="py-1.5 px-1 text-center text-[10px] font-bold uppercase bg-green-100 text-green-700 border-l border-b">Totals</th>
                  <th className="border-b border-slate-200"></th>
                </tr>
                <tr>
                  <th className="py-2 px-2 text-left font-semibold w-8 border-b">Sr</th>
                  <th onClick={() => handleSort('location')} className="py-2 px-2 text-left font-semibold min-w-[140px] cursor-pointer hover:bg-slate-200 border-b">Location <SortIcon col="location" /></th>
                  <th onClick={() => handleSort('processType')} className="py-2 px-2 text-left font-semibold min-w-[100px] cursor-pointer hover:bg-slate-200 border-b">Process <SortIcon col="processType" /></th>
                  <th onClick={() => handleSort('duplicateCases')} className="py-2 px-1 text-right font-semibold w-12 cursor-pointer bg-orange-50 border-l border-b">Cases</th>
                  <th className="py-2 px-1 text-right font-semibold w-16 bg-orange-50 border-b">Total</th>
                  <th onClick={() => handleSort('keyCases')} className="py-2 px-1 text-right font-semibold w-12 cursor-pointer bg-purple-50 border-l border-b">Cases</th>
                  <th className="py-2 px-1 text-right font-semibold w-16 bg-purple-50 border-b">Total</th>
                  <th onClick={() => handleSort('newRequestCases')} className="py-2 px-1 text-right font-semibold w-12 cursor-pointer bg-blue-50 border-l border-b">Cases</th>
                  <th className="py-2 px-1 text-right font-semibold w-16 bg-blue-50 border-b">Total</th>
                  <th onClick={() => handleSort('totalCases')} className="py-2 px-1 text-right font-semibold w-14 cursor-pointer bg-green-50 border-l border-b">Cases</th>
                  <th onClick={() => handleSort('totalBilling')} className="py-2 px-1 text-right font-semibold w-18 cursor-pointer bg-green-50 border-b">Billing</th>
                  <th className="py-2 px-2 text-center font-semibold w-10 border-b">Geo</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={12} className="py-8 text-center text-gray-500">Loading...</td></tr>
                ) : sortedData.length === 0 ? (
                  <tr><td colSpan={12} className="py-8 text-center text-gray-500">No data found</td></tr>
                ) : (
                  <>
                    {sortedData.map((r, idx) => (
                      <tr key={`${r.subproject_id}-${r.project_id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-1.5 px-2 text-slate-500">{idx + 1}</td>
                        <td className="py-1.5 px-2 font-medium text-slate-800 truncate max-w-[160px]" title={r.location}>{r.location}</td>
                        <td className="py-1.5 px-2 text-slate-600 truncate max-w-[100px]" title={r.processType}>{r.processType}</td>
                        <td className={`py-1.5 px-1 text-right border-l ${r.duplicateCases > 0 ? 'bg-orange-50 font-medium' : 'text-slate-300'}`}>{r.duplicateCases}</td>
                        <td className={`py-1.5 px-1 text-right ${r.duplicateCases > 0 ? 'bg-orange-50 text-orange-700 font-medium' : 'text-slate-300'}`}>{r.duplicateCases > 0 ? formatCurrency(r.duplicateTotal) : '$0'}</td>
                        <td className={`py-1.5 px-1 text-right border-l ${r.keyCases > 0 ? 'bg-purple-50 font-medium' : 'text-slate-300'}`}>{r.keyCases}</td>
                        <td className={`py-1.5 px-1 text-right ${r.keyCases > 0 ? 'bg-purple-50 text-purple-700 font-medium' : 'text-slate-300'}`}>{r.keyCases > 0 ? formatCurrency(r.keyTotal) : '$0'}</td>
                        <td className={`py-1.5 px-1 text-right border-l ${r.newRequestCases > 0 ? 'bg-blue-50 font-medium' : 'text-slate-300'}`}>{r.newRequestCases}</td>
                        <td className={`py-1.5 px-1 text-right ${r.newRequestCases > 0 ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-300'}`}>{r.newRequestCases > 0 ? formatCurrency(r.newRequestTotal) : '$0'}</td>
                        <td className="py-1.5 px-1 text-right font-bold text-slate-800 border-l bg-green-50/50">{r.totalCases}</td>
                        <td className="py-1.5 px-1 text-right font-bold text-green-700 bg-green-50/50">{formatCurrency(r.totalBilling)}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.geographyType === 'onshore' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {r.geographyType === 'onshore' ? 'US' : 'IND'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {totals && (
                      <tr className="bg-slate-800 text-white font-semibold sticky bottom-0">
                        <td className="py-2 px-2"></td>
                        <td className="py-2 px-2" colSpan={2}>Grand Total</td>
                        <td className="py-2 px-1 text-right border-l border-slate-600">{totals.duplicateCases}</td>
                        <td className="py-2 px-1 text-right">{formatCurrency(totals.duplicateTotal)}</td>
                        <td className="py-2 px-1 text-right border-l border-slate-600">{totals.keyCases}</td>
                        <td className="py-2 px-1 text-right">{formatCurrency(totals.keyTotal)}</td>
                        <td className="py-2 px-1 text-right border-l border-slate-600">{totals.newRequestCases}</td>
                        <td className="py-2 px-1 text-right">{formatCurrency(totals.newRequestTotal)}</td>
                        <td className="py-2 px-1 text-right border-l border-slate-600 bg-green-600">{totals.totalCases}</td>
                        <td className="py-2 px-1 text-right bg-green-600">{formatCurrency(totals.totalBilling)}</td>
                        <td className="py-2 px-2"></td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Cards */}
        {totals && totals.totalCases > 0 && (
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-orange-500">
              <div className="text-[10px] text-gray-500 uppercase">Duplicate</div>
              <div className="text-lg font-bold text-slate-800">{formatNumber(totals.duplicateCases)}</div>
              <div className="text-xs font-semibold text-orange-600">{formatCurrency(totals.duplicateTotal)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-purple-500">
              <div className="text-[10px] text-gray-500 uppercase">Key</div>
              <div className="text-lg font-bold text-slate-800">{formatNumber(totals.keyCases)}</div>
              <div className="text-xs font-semibold text-purple-600">{formatCurrency(totals.keyTotal)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-blue-500">
              <div className="text-[10px] text-gray-500 uppercase">New Request</div>
              <div className="text-lg font-bold text-slate-800">{formatNumber(totals.newRequestCases)}</div>
              <div className="text-xs font-semibold text-blue-600">{formatCurrency(totals.newRequestTotal)}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
              <div className="text-[10px] text-gray-500 uppercase">Grand Total</div>
              <div className="text-lg font-bold text-slate-800">{formatNumber(totals.totalCases)}</div>
              <div className="text-xs font-semibold text-green-600">{formatCurrency(totals.totalBilling)}</div>
            </div>
          </div>
        )}

        {/* Detailed Entries */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowDetailed(!showDetailed)} className="text-gray-500 hover:text-gray-700">{showDetailed ? '▼' : '▶'}</button>
              <span className="text-xs font-semibold text-gray-700">📋 Detailed Entries • {formatNumber(filteredDetailed.length)} records</span>
            </div>
            <input type="text" placeholder="Search entries..." value={detailedSearch} onChange={(e) => { setDetailedSearch(e.target.value); setDetailedPage(1); }}
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
                      <th className="py-2 px-2 text-left font-semibold border-b">Type</th>
                      <th className="py-2 px-2 text-right font-semibold border-b">Count</th>
                      <th className="py-2 px-2 text-right font-semibold border-b">Rate</th>
                      <th className="py-2 px-2 text-right font-semibold border-b bg-green-50">Amount</th>
                      <th className="py-2 px-2 text-left font-semibold border-b">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDetailed.length === 0 ? (
                      <tr><td colSpan={8} className="py-6 text-center text-gray-500">No entries</td></tr>
                    ) : (
                      paginatedDetailed.map((a, i) => (
                        <tr key={a._id || i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-1.5 px-2 text-slate-600">{formatDate(a.allocation_date)}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800">{a.resource_name}</td>
                          <td className="py-1.5 px-2 text-slate-700 max-w-[120px] truncate" title={a.subproject_name}>{a.subproject_name}</td>
                          <td className="py-1.5 px-2"><RequestTypeBadge type={a.request_type} /></td>
                          <td className="py-1.5 px-2 text-right font-medium text-slate-800">{a.count || 1}</td>
                          <td className="py-1.5 px-2 text-right text-slate-600">{formatCurrency(a.billing_rate)}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-green-700 bg-green-50/50">{formatCurrency(a.billing_amount)}</td>
                          <td className="py-1.5 px-2 text-slate-500 max-w-[100px] truncate" title={a.remark}>{a.remark || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {detailedTotalPages > 1 && (
                <div className="px-3 py-2 border-t bg-gray-50 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Page {detailedPage} of {detailedTotalPages} ({formatNumber(filteredDetailed.length)} total)</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDetailedPage(1)} disabled={detailedPage <= 1} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">««</button>
                    <button onClick={() => setDetailedPage(p => p - 1)} disabled={detailedPage <= 1} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">‹</button>
                    <span className="px-2">{detailedPage}</span>
                    <button onClick={() => setDetailedPage(p => p + 1)} disabled={detailedPage >= detailedTotalPages} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">›</button>
                    <button onClick={() => setDetailedPage(detailedTotalPages)} disabled={detailedPage >= detailedTotalPages} className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-50">»»</button>
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

export default VerismaDashboard;