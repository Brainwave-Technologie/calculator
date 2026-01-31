// pages/dashboards/VerismaDashboard.jsx - VERISMA CLIENT DASHBOARD
// Updated to fetch from resource-logged daily allocations

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

// =============================================
// HELPER COMPONENTS
// =============================================

const Loader = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center py-10">
    <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-3 text-sm text-gray-500">{message}</p>
  </div>
);

// Async Searchable Select Component
const AsyncSelect = ({ 
  value, 
  onChange, 
  fetchOptions, 
  placeholder = "Search...",
  disabled = false,
  labelKey = "name",
  valueKey = "_id"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || disabled) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchOptions(search);
        setOptions(results || []);
      } catch (error) {
        console.error('Error fetching options:', error);
        setOptions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, isOpen, fetchOptions, disabled]);

  useEffect(() => {
    if (!value) {
      setSelectedLabel('');
      return;
    }
    const found = options.find(opt => opt[valueKey] === value);
    if (found) setSelectedLabel(found[labelKey]);
  }, [value, options, labelKey, valueKey]);

  const handleSelect = (option) => {
    onChange(option[valueKey]);
    setSelectedLabel(option[labelKey]);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSelectedLabel('');
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 border rounded-lg flex items-center justify-between cursor-pointer min-h-[42px] ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'
        }`}
        title={selectedLabel}
      >
        <span className={`flex-1 truncate ${selectedLabel ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedLabel || placeholder}
        </span>
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {value && !disabled && (
            <button onClick={handleClear} className="text-gray-400 hover:text-red-500 p-1">✕</button>
          )}
          <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b sticky top-0 bg-white">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-center text-gray-500">Loading...</div>
            ) : options.length === 0 ? (
              <div className="p-3 text-center text-gray-500">
                {search ? 'No results found' : 'Start typing to search'}
              </div>
            ) : (
              options.map((option) => (
                <div
                  key={option[valueKey]}
                  onClick={() => handleSelect(option)}
                  className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                    option[valueKey] === value ? 'bg-blue-100 text-blue-700' : ''
                  }`}
                  title={option[labelKey]}
                >
                  <div className="truncate">{option[labelKey]}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================
// VERISMA DASHBOARD COMPONENT
// =============================================

const VerismaDashboard = () => {
  // State declarations
  const [geographiesData, setGeographiesData] = useState([]);
  const [resources, setResources] = useState([]);
  const [filters, setFilters] = useState({
    geography: '',
    resource_id: '',
    subproject_id: '',
    request_type: '',
    month: 'all',
    year: new Date().getFullYear().toString(),
    startDate: '',
    endDate: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [allocations, setAllocations] = useState([]);
  const [summaryData, setSummaryData] = useState([]);
  const [totals, setTotals] = useState(null);
  const [grandTotals, setGrandTotals] = useState(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'location', direction: 'asc' });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 100
  });

  // Helpers
  const formatCurrency = (amount) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount || 0);

  const formatNumber = (num) => 
    new Intl.NumberFormat('en-US').format(num || 0);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get auth token
  const getAuthToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  };

  // Fetch geographies on mount
  useEffect(() => {
    const fetchGeographies = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/geography`);
        const data = await response.json();
        setGeographiesData(Array.isArray(data) ? data : data.geographies || []);
      } catch (error) {
        console.error("Error fetching geographies:", error);
      }
    };
    fetchGeographies();
  }, []);

  // Fetch resources for filter dropdown
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(`${apiBaseUrl}/resource`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        // Filter to only Verisma-assigned resources
        const verismaResources = (data.resources || data || []).filter(r => 
          r.assignments?.some(a => a.client_name?.toLowerCase() === 'verisma')
        );
        setResources(verismaResources);
      } catch (error) {
        console.error('Error fetching resources:', error);
      }
    };
    fetchResources();
  }, []);

  // Build date range from filters
  const getDateRange = useCallback(() => {
    if (filters.startDate && filters.endDate) {
      return {
        start_date: filters.startDate,
        end_date: filters.endDate
      };
    }
    
    const year = parseInt(filters.year);
    if (filters.month !== 'all') {
      const month = parseInt(filters.month);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      return {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      };
    }
    
    return {
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`
    };
  }, [filters.startDate, filters.endDate, filters.month, filters.year]);

  // Fetch all allocations from the new admin endpoint
  const fetchAllocations = useCallback(async (page = 1) => {
    setIsLoading(true);
    
    try {
      const token = getAuthToken();
      const dateRange = getDateRange();
      
      const params = new URLSearchParams({
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        page: page.toString(),
        limit: '100'
      });

      if (filters.resource_id) params.append('resource_id', filters.resource_id);
      if (filters.subproject_id) params.append('subproject_id', filters.subproject_id);
      if (filters.request_type) params.append('request_type', filters.request_type);

      const response = await fetch(`${apiBaseUrl}/verisma-daily-allocations/admin/all?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch allocations');
      }

      const data = await response.json();
      setAllocations(data.allocations || []);
      setPagination(data.pagination || {
        currentPage: 1,
        totalPages: 1,
        totalItems: 0,
        itemsPerPage: 100
      });

      // Process allocations into summary format
      processAllocationsIntoSummary(data.allocations || []);

    } catch (error) {
      console.error("Error loading allocations:", error);
      toast.error(error.message || 'Failed to load allocation data');
      setAllocations([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters, getDateRange]);

  // Process raw allocations into location-based summary
  const processAllocationsIntoSummary = useCallback((allocs) => {
    // Group by location + project
    const locationMap = new Map();
    
    allocs.forEach(alloc => {
      const key = `${alloc.subproject_id}-${alloc.project_id}`;
      
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          location: alloc.subproject_name,
          subproject_id: alloc.subproject_id,
          processType: alloc.project_name,
          project_id: alloc.project_id,
          geography_name: alloc.geography_name,
          geographyType: alloc.geography_name?.toLowerCase().includes('us') ? 'onshore' : 'offshore',
          duplicateHours: 0,
          duplicateTotal: 0,
          keyHours: 0,
          keyTotal: 0,
          newRequestHours: 0,
          newRequestTotal: 0,
          totalCasesHours: 0,
          totalBilling: 0
        });
      }
      
      const entry = locationMap.get(key);
      const count = alloc.count || 1;
      const amount = alloc.billing_amount || 0;
      
      if (alloc.request_type === 'Duplicate') {
        entry.duplicateHours += count;
        entry.duplicateTotal += amount;
      } else if (alloc.request_type === 'Key') {
        entry.keyHours += count;
        entry.keyTotal += amount;
      } else if (alloc.request_type === 'New Request') {
        entry.newRequestHours += count;
        entry.newRequestTotal += amount;
      }
      
      entry.totalCasesHours = entry.duplicateHours + entry.keyHours + entry.newRequestHours;
      entry.totalBilling = entry.duplicateTotal + entry.keyTotal + entry.newRequestTotal;
    });

    let summaryArray = Array.from(locationMap.values());
    
    // Apply search filter
    if (searchTerm) {
      summaryArray = summaryArray.filter(row => 
        row.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.processType?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply geography filter
    if (filters.geography) {
      const geo = geographiesData.find(g => g._id === filters.geography);
      if (geo) {
        summaryArray = summaryArray.filter(row => 
          row.geography_name?.toLowerCase() === geo.name?.toLowerCase()
        );
      }
    }

    setSummaryData(summaryArray);

    // Calculate totals for current page
    const pageTotals = summaryArray.reduce((acc, row) => ({
      duplicateHours: acc.duplicateHours + row.duplicateHours,
      duplicateTotal: acc.duplicateTotal + row.duplicateTotal,
      keyHours: acc.keyHours + row.keyHours,
      keyTotal: acc.keyTotal + row.keyTotal,
      newRequestHours: acc.newRequestHours + row.newRequestHours,
      newRequestTotal: acc.newRequestTotal + row.newRequestTotal,
      totalCasesHours: acc.totalCasesHours + row.totalCasesHours,
      totalBilling: acc.totalBilling + row.totalBilling
    }), {
      duplicateHours: 0, duplicateTotal: 0,
      keyHours: 0, keyTotal: 0,
      newRequestHours: 0, newRequestTotal: 0,
      totalCasesHours: 0, totalBilling: 0
    });

    setTotals(pageTotals);
    setGrandTotals(pageTotals); // In this view, grand totals = page totals since we're processing all fetched data
  }, [searchTerm, filters.geography, geographiesData]);

  // Fetch data when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAllocations(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, searchTerm, fetchAllocations]);

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    setFilters(prev => ({ ...prev, [id]: value }));
  };

  // Sorting
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const sortedData = [...summaryData].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    
    if (typeof aVal === 'string') {
      return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Export to CSV
  const exportToCSV = async () => {
    const loadingToast = toast.loading('Preparing export...');
    
    try {
      if (summaryData.length === 0) {
        toast.dismiss(loadingToast);
        toast.error('No data to export');
        return;
      }

      const headers = [
        'Sr No', 'Locations', 'Process Type', 
        'Duplicate', 'Total (Duplicate)', 
        'Key', 'Total (Key)', 
        'New Request', 'Total (New Request)',
        'Total Cases/Hours', 'Total Billing', 'Geography'
      ];

      const rows = sortedData.map((row, idx) => [
        idx + 1,
        row.location || '',
        row.processType || '',
        row.duplicateHours || 0,
        (row.duplicateTotal || 0).toFixed(2),
        row.keyHours || 0,
        (row.keyTotal || 0).toFixed(2),
        row.newRequestHours || 0,
        (row.newRequestTotal || 0).toFixed(2),
        row.totalCasesHours || 0,
        (row.totalBilling || 0).toFixed(2),
        row.geographyType === 'onshore' ? 'US' : 'IND'
      ]);

      if (totals) {
        rows.push([
          '', 'TOTALS', '',
          totals.duplicateHours || 0,
          (totals.duplicateTotal || 0).toFixed(2),
          totals.keyHours || 0,
          (totals.keyTotal || 0).toFixed(2),
          totals.newRequestHours || 0,
          (totals.newRequestTotal || 0).toFixed(2),
          totals.totalCasesHours || 0,
          (totals.totalBilling || 0).toFixed(2),
          ''
        ]);
      }

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSV).join(','),
        ...rows.map(row => row.map(escapeCSV).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const dateRange = filters.startDate && filters.endDate 
        ? `${filters.startDate}-to-${filters.endDate}`
        : `${filters.year}-${filters.month !== 'all' ? filters.month : 'all'}`;
      
      a.download = `verisma-billing-${dateRange}-${sortedData.length}-records.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss(loadingToast);
      toast.success(`Successfully exported ${sortedData.length} records!`);

    } catch (error) {
      console.error('Export error:', error);
      toast.dismiss(loadingToast);
      toast.error(error.message || 'Failed to export data.');
    }
  };

  // Column definitions
  const columns = [
    { key: 'srNo', header: 'Sr No', sortable: false, className: 'w-16' },
    { key: 'location', header: 'Locations', sortable: true, className: 'min-w-[180px]' },
    { key: 'processType', header: 'Process Type', sortable: true, className: 'min-w-[150px]' },
    { key: 'duplicateHours', header: 'Duplicate', sortable: true, className: 'w-24 text-right', isNumber: true },
    { key: 'duplicateTotal', header: 'Total', sortable: true, className: 'w-28 text-right', isCurrency: true },
    { key: 'keyHours', header: 'Key', sortable: true, className: 'w-24 text-right', isNumber: true },
    { key: 'keyTotal', header: 'Total', sortable: true, className: 'w-28 text-right', isCurrency: true },
    { key: 'newRequestHours', header: 'New Request', sortable: true, className: 'w-28 text-right', isNumber: true },
    { key: 'newRequestTotal', header: 'Total', sortable: true, className: 'w-32 text-right', isCurrency: true },
    { key: 'totalCasesHours', header: 'Total Cases/Hours', sortable: true, className: 'w-36 text-right', isNumber: true },
    { key: 'totalBilling', header: 'Total Billing', sortable: true, className: 'w-36 text-right', isCurrency: true },
    { key: 'geography', header: 'Geography', sortable: true, className: 'w-24 text-center' }
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Header Info Banner */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-blue-900">
              Verisma Resource Daily Allocations
            </div>
            <div className="text-sm text-blue-700">
              Viewing data logged by resources via daily allocation entry
            </div>
          </div>
          <div className="text-xs text-blue-600">
            Total Records: {formatNumber(pagination.totalItems || allocations.length)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-md p-4">
        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          {/* Geography Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geography</label>
            <select
              id="geography"
              value={filters.geography}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="">All Geographies</option>
              {geographiesData.map(g => (
                <option key={g._id} value={g._id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Resource Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resource</label>
            <select
              id="resource_id"
              value={filters.resource_id}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="">All Resources</option>
              {resources.map(r => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Request Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
            <select
              id="request_type"
              value={filters.request_type}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="">All Types</option>
              <option value="New Request">New Request</option>
              <option value="Key">Key</option>
              <option value="Duplicate">Duplicate</option>
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select
              id="month"
              value={filters.month}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="all">All Months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('default', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select
              id="year"
              value={filters.year}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="2027">2027</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          {/* Start Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              id="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            />
          </div>

          {/* End Date Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              id="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            />
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search locations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none min-h-[42px]"
            />
          </div>
        </div>

        {/* Date Range Display */}
        {(filters.startDate || filters.endDate) && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-green-800">
              <span className="font-semibold">📅 Filtered Date Range:</span>
              <span>{filters.startDate || 'Beginning'} to {filters.endDate || 'End'}</span>
              <button
                onClick={() => setFilters(prev => ({ ...prev, startDate: '', endDate: '' }))}
                className="ml-auto text-red-600 hover:text-red-800 font-medium"
              >
                Clear Dates
              </button>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{sortedData.length}</span> records
          </div>
          <button
            onClick={exportToCSV}
            disabled={sortedData.length === 0 || isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <span className="font-semibold text-sm">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th colSpan={3} className="py-2 px-3 text-left text-xs font-bold text-gray-600 uppercase"></th>
                <th colSpan={2} className="py-2 px-3 text-center text-xs font-bold text-orange-600 uppercase bg-orange-50 border-l">
                  Duplicate
                </th>
                <th colSpan={2} className="py-2 px-3 text-center text-xs font-bold text-purple-600 uppercase bg-purple-50 border-l">
                  Key
                </th>
                <th colSpan={2} className="py-2 px-3 text-center text-xs font-bold text-blue-600 uppercase bg-blue-50 border-l">
                  New Request
                </th>
                <th colSpan={2} className="py-2 px-3 text-center text-xs font-bold text-green-600 uppercase bg-green-50 border-l">
                  Totals
                </th>
                <th className="py-2 px-3 text-center text-xs font-bold text-gray-600 uppercase border-l"></th>
              </tr>
              <tr className="bg-gray-50 border-b">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => col.sortable && handleSort(col.key)}
                    className={`py-3 px-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider ${col.className || ''} ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-gray-400 ml-1">
                          {sortConfig.key === col.key 
                            ? (sortConfig.direction === 'asc' ? '↑' : '↓') 
                            : '↕'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length}>
                    <Loader message="Loading allocation data..." />
                  </td>
                </tr>
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="py-10 text-center">
                    <div className="text-gray-500">
                      <div className="text-4xl mb-2">📊</div>
                      <p className="font-medium">No data found</p>
                      <p className="text-sm">Resources haven't logged any allocations for this period</p>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {sortedData.map((row, idx) => (
                    <tr 
                      key={`${row.subproject_id}-${row.project_id}-${idx}`} 
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-3 text-sm text-gray-600">{idx + 1}</td>
                      <td className="py-3 px-3 text-sm font-medium text-gray-900">{row.location}</td>
                      <td className="py-3 px-3 text-sm text-gray-700">{row.processType}</td>
                      
                      <td className="py-3 px-3 text-sm text-right bg-orange-50/30 font-medium">
                        {formatNumber(row.duplicateHours)}
                      </td>
                      <td className="py-3 px-3 text-sm text-right bg-orange-50/30 text-orange-700 font-semibold">
                        {formatCurrency(row.duplicateTotal || 0)}
                      </td>
                      
                      <td className="py-3 px-3 text-sm text-right bg-purple-50/30 font-medium">
                        {formatNumber(row.keyHours)}
                      </td>
                      <td className="py-3 px-3 text-sm text-right bg-purple-50/30 text-purple-700 font-semibold">
                        {formatCurrency(row.keyTotal || 0)}
                      </td>
                      
                      <td className="py-3 px-3 text-sm text-right bg-blue-50/30 font-medium">
                        {formatNumber(row.newRequestHours)}
                      </td>
                      <td className="py-3 px-3 text-sm text-right bg-blue-50/30 text-blue-700 font-semibold">
                        {formatCurrency(row.newRequestTotal || 0)}
                      </td>
                      
                      <td className="py-3 px-3 text-sm text-right bg-green-50/30 font-bold text-gray-900">
                        {formatNumber(row.totalCasesHours)}
                      </td>
                      <td className="py-3 px-3 text-sm text-right bg-green-50/30 font-bold text-green-700">
                        {formatCurrency(row.totalBilling || 0)}
                      </td>
                      
                      <td className="py-3 px-3 text-sm text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          row.geographyType === 'onshore' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {row.geographyType === 'onshore' ? 'US' : 'IND'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  
                  {totals && (
                    <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                      <td className="py-4 px-3"></td>
                      <td className="py-4 px-3 text-sm text-gray-900 uppercase">Grand Total</td>
                      <td className="py-4 px-3"></td>
                      
                      <td className="py-4 px-3 text-sm text-right bg-orange-100">
                        {formatNumber(totals.duplicateHours)}
                      </td>
                      <td className="py-4 px-3 text-sm text-right bg-orange-100 text-orange-800">
                        {formatCurrency(totals.duplicateTotal || 0)}
                      </td>
                      
                      <td className="py-4 px-3 text-sm text-right bg-purple-100">
                        {formatNumber(totals.keyHours)}
                      </td>
                      <td className="py-4 px-3 text-sm text-right bg-purple-100 text-purple-800">
                        {formatCurrency(totals.keyTotal || 0)}
                      </td>
                      
                      <td className="py-4 px-3 text-sm text-right bg-blue-100">
                        {formatNumber(totals.newRequestHours)}
                      </td>
                      <td className="py-4 px-3 text-sm text-right bg-blue-100 text-blue-800">
                        {formatCurrency(totals.newRequestTotal || 0)}
                      </td>
                      
                      <td className="py-4 px-3 text-sm text-right bg-green-100 text-gray-900">
                        {formatNumber(totals.totalCasesHours)}
                      </td>
                      <td className="py-4 px-3 text-sm text-right bg-green-100 text-green-800">
                        {formatCurrency(totals.totalBilling || 0)}
                      </td>
                      
                      <td className="py-4 px-3"></td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Cards */}
      {grandTotals && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-orange-500">
            <div className="text-sm text-gray-500 uppercase tracking-wider">Duplicate</div>
            <div className="text-sm font-bold text-gray-900 mt-1">
              {formatNumber(grandTotals.duplicateHours)} cases
            </div>
            <div className="text-sm font-semibold text-orange-600">
              {formatCurrency(grandTotals.duplicateTotal)}
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-purple-500">
            <div className="text-sm text-gray-500 uppercase tracking-wider">Key</div>
            <div className="text-sm font-bold text-gray-900 mt-1">
              {formatNumber(grandTotals.keyHours)} cases
            </div>
            <div className="text-sm font-semibold text-purple-600">
              {formatCurrency(grandTotals.keyTotal)}
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500 uppercase tracking-wider">New Request</div>
            <div className="text-sm font-bold text-gray-900 mt-1">
              {formatNumber(grandTotals.newRequestHours)} cases
            </div>
            <div className="text-sm font-semibold text-blue-600">
              {formatCurrency(grandTotals.newRequestTotal)}
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-green-500">
            <div className="text-sm text-gray-500 uppercase tracking-wider">Grand Total</div>
            <div className="text-sm font-bold text-gray-900 mt-1">
              {formatNumber(grandTotals.totalCasesHours)} cases
            </div>
            <div className="text-sm font-semibold text-green-600">
              {formatCurrency(grandTotals.totalBilling)}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Entries Section */}
      {allocations.length > 0 && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-4 bg-gray-50 border-b">
            <h3 className="text-lg font-semibold text-gray-800">Detailed Allocation Entries</h3>
            <p className="text-sm text-gray-500">Individual entries logged by resources</p>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="py-2 px-3 text-left">Date</th>
                  <th className="py-2 px-3 text-left">Resource</th>
                  <th className="py-2 px-3 text-left">Location</th>
                  <th className="py-2 px-3 text-left">Request Type</th>
                  <th className="py-2 px-3 text-right">Count</th>
                  <th className="py-2 px-3 text-right">Rate</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3 text-left">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allocations.slice(0, 100).map((entry, idx) => (
                  <tr key={entry._id || idx} className="hover:bg-gray-50">
                    <td className="py-2 px-3">{formatDate(entry.allocation_date)}</td>
                    <td className="py-2 px-3">{entry.resource_name}</td>
                    <td className="py-2 px-3">{entry.subproject_name}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.request_type === 'New Request' ? 'bg-blue-100 text-blue-700' :
                        entry.request_type === 'Key' ? 'bg-purple-100 text-purple-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {entry.request_type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium">{entry.count || 1}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{formatCurrency(entry.billing_rate)}</td>
                    <td className="py-2 px-3 text-right text-green-600 font-medium">{formatCurrency(entry.billing_amount)}</td>
                    <td className="py-2 px-3 text-gray-500 truncate max-w-[200px]" title={entry.remark}>{entry.remark || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allocations.length > 100 && (
              <div className="text-center py-3 text-gray-500 text-sm bg-gray-50">
                Showing 100 of {allocations.length} entries
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default VerismaDashboard;