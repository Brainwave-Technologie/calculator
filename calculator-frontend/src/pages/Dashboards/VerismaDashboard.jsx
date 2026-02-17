// pages/dashboards/VerismaDashboard.jsx - VERISMA CLIENT DASHBOARD
// Updated to fetch from resource-logged daily allocations
// FIXED: PST timezone, resource dropdown, month-wise billing filters

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
// PST TIMEZONE HELPER
// =============================================
const getPSTDate = () => {
  const now = new Date();
  // PST is UTC-8 (or PDT UTC-7 during daylight saving)
  // Using -8 for standard PST
  const pstOffset = -8 * 60; // PST offset in minutes
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (pstOffset * 60000));
};

const formatDateForAPI = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// =============================================
// VERISMA DASHBOARD COMPONENT
// =============================================

const VerismaDashboard = () => {
  // State declarations
  const [geographiesData, setGeographiesData] = useState([]);
  const [resources, setResources] = useState([]);
  const [allResources, setAllResources] = useState([]); // Store all resources for filtering
  const [filters, setFilters] = useState({
    geography: '',
    resource_id: '',
    resource_email: '', // Added for proper filtering
    subproject_id: '',
    request_type: '',
    month: (new Date().getMonth() + 1).toString(), // Default to current month
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

  // Fetch resources for filter dropdown - FIXED
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const token = getAuthToken();
        const response = await fetch(`${apiBaseUrl}/resource`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch resources');
        }
        
        const data = await response.json();
        const resourceList = data.resources || data || [];
        
        // Store all resources
        setAllResources(resourceList);
        
        // Filter to only Verisma-assigned resources
        // Check both assignments array and direct client assignments
        const verismaResources = resourceList.filter(r => {
          // Check assignments array
          if (r.assignments && Array.isArray(r.assignments)) {
            return r.assignments.some(a => 
              a.client_name?.toLowerCase() === 'verisma' ||
              a.client?.name?.toLowerCase() === 'verisma'
            );
          }
          // Check direct client_name field
          if (r.client_name?.toLowerCase() === 'verisma') {
            return true;
          }
          // Check allocated_clients array
          if (r.allocated_clients && Array.isArray(r.allocated_clients)) {
            return r.allocated_clients.some(c => 
              c.client_name?.toLowerCase() === 'verisma' ||
              c.name?.toLowerCase() === 'verisma'
            );
          }
          return false;
        });
        
        // If no Verisma-specific resources found, show all resources
        // This handles cases where assignment filtering doesn't work
        if (verismaResources.length === 0) {
          console.log('No Verisma-specific resources found, showing all resources');
          setResources(resourceList);
        } else {
          setResources(verismaResources);
        }
        
      } catch (error) {
        console.error('Error fetching resources:', error);
        toast.error('Failed to load resources');
      }
    };
    fetchResources();
  }, []);

  // Build date range from filters - FIXED for month-wise billing
  const getDateRange = useCallback(() => {
    // Priority 1: Use explicit date range if provided
    if (filters.startDate && filters.endDate) {
      return {
        start_date: filters.startDate,
        end_date: filters.endDate
      };
    }
    
    // Priority 2: Use month/year filters
    const year = parseInt(filters.year);
    
    if (filters.month && filters.month !== 'all') {
      const month = parseInt(filters.month);
      // Create date in local timezone to avoid off-by-one errors
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month
      
      return {
        start_date: `${year}-${String(month).padStart(2, '0')}-01`,
        end_date: `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
      };
    }
    
    // Priority 3: Full year
    return {
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`
    };
  }, [filters.startDate, filters.endDate, filters.month, filters.year]);

  // Fetch all allocations from the new admin endpoint - FIXED
  const fetchAllocations = useCallback(async (page = 1) => {
    setIsLoading(true);
    
    try {
      const token = getAuthToken();
      const dateRange = getDateRange();
      
      console.log('Fetching with date range:', dateRange);
      console.log('Filters:', filters);
      
      const params = new URLSearchParams({
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        page: page.toString(),
        limit: '500' // Increased limit for better data aggregation
      });

      // FIXED: Use resource_email instead of resource_id for filtering
      if (filters.resource_email) {
        params.append('resource_email', filters.resource_email);
      } else if (filters.resource_id) {
        // Find the resource email from the selected resource_id
        const selectedResource = allResources.find(r => r._id === filters.resource_id);
        if (selectedResource?.email) {
          params.append('resource_email', selectedResource.email);
        }
      }
      
      if (filters.subproject_id) params.append('subproject_id', filters.subproject_id);
      if (filters.request_type) params.append('request_type', filters.request_type);

      console.log('API params:', params.toString());

      const response = await fetch(`${apiBaseUrl}/verisma-daily-allocations/admin/all?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to fetch allocations');
      }

      const data = await response.json();
      console.log('API Response:', data);
      
      setAllocations(data.allocations || []);
      setPagination({
        currentPage: data.page || 1,
        totalPages: data.pages || 1,
        totalItems: data.total || 0,
        itemsPerPage: 500
      });

      // Process allocations into summary format
      processAllocationsIntoSummary(data.allocations || []);

    } catch (error) {
      console.error("Error loading allocations:", error);
      toast.error(error.message || 'Failed to load allocation data');
      setAllocations([]);
      setSummaryData([]);
      setTotals(null);
      setGrandTotals(null);
    } finally {
      setIsLoading(false);
    }
  }, [filters, getDateRange, allResources]);

  // Process raw allocations into location-based summary - FIXED
  const processAllocationsIntoSummary = useCallback((allocs) => {
    if (!allocs || allocs.length === 0) {
      setSummaryData([]);
      setTotals(null);
      setGrandTotals(null);
      return;
    }

    // Group by location + project
    const locationMap = new Map();
    
    allocs.forEach(alloc => {
      const key = `${alloc.subproject_id || alloc.subproject_name}-${alloc.project_id || alloc.project_name}`;
      
      if (!locationMap.has(key)) {
        locationMap.set(key, {
          location: alloc.subproject_name || 'Unknown Location',
          subproject_id: alloc.subproject_id,
          processType: alloc.project_name || alloc.process || 'Unknown Process',
          project_id: alloc.project_id,
          geography_name: alloc.geography_name || '',
          geographyType: alloc.geography_type || 
            (alloc.geography_name?.toLowerCase().includes('us') ? 'onshore' : 'offshore'),
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
      const count = parseInt(alloc.count) || 1;
      const amount = parseFloat(alloc.billing_amount) || 0;
      
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
      const searchLower = searchTerm.toLowerCase();
      summaryArray = summaryArray.filter(row => 
        row.location?.toLowerCase().includes(searchLower) ||
        row.processType?.toLowerCase().includes(searchLower)
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

    // Calculate totals
    const calculatedTotals = summaryArray.reduce((acc, row) => ({
      duplicateHours: acc.duplicateHours + (row.duplicateHours || 0),
      duplicateTotal: acc.duplicateTotal + (row.duplicateTotal || 0),
      keyHours: acc.keyHours + (row.keyHours || 0),
      keyTotal: acc.keyTotal + (row.keyTotal || 0),
      newRequestHours: acc.newRequestHours + (row.newRequestHours || 0),
      newRequestTotal: acc.newRequestTotal + (row.newRequestTotal || 0),
      totalCasesHours: acc.totalCasesHours + (row.totalCasesHours || 0),
      totalBilling: acc.totalBilling + (row.totalBilling || 0)
    }), {
      duplicateHours: 0, duplicateTotal: 0,
      keyHours: 0, keyTotal: 0,
      newRequestHours: 0, newRequestTotal: 0,
      totalCasesHours: 0, totalBilling: 0
    });

    setTotals(calculatedTotals);
    setGrandTotals(calculatedTotals);
  }, [searchTerm, filters.geography, geographiesData]);

  // Fetch data when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAllocations(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.month, filters.year, filters.resource_id, filters.resource_email, 
      filters.geography, filters.request_type, filters.startDate, filters.endDate]);

  // Re-process when search term changes (no need to refetch)
  useEffect(() => {
    if (allocations.length > 0) {
      processAllocationsIntoSummary(allocations);
    }
  }, [searchTerm, processAllocationsIntoSummary, allocations]);

  // Handle filter changes - FIXED
  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    
    // Special handling for resource_id to also set resource_email
    if (id === 'resource_id') {
      const selectedResource = allResources.find(r => r._id === value);
      setFilters(prev => ({ 
        ...prev, 
        resource_id: value,
        resource_email: selectedResource?.email || ''
      }));
    } else {
      setFilters(prev => ({ ...prev, [id]: value }));
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      geography: '',
      resource_id: '',
      resource_email: '',
      subproject_id: '',
      request_type: '',
      month: (new Date().getMonth() + 1).toString(),
      year: new Date().getFullYear().toString(),
      startDate: '',
      endDate: ''
    });
    setSearchTerm('');
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
    
    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;
    
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
        : `${filters.year}-${filters.month !== 'all' ? filters.month.padStart(2, '0') : 'all'}`;
      
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

  // Get current month name for display
  const getMonthName = (monthNum) => {
    if (monthNum === 'all') return 'All Months';
    const date = new Date(2000, parseInt(monthNum) - 1, 1);
    return date.toLocaleString('default', { month: 'long' });
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
              <span className="ml-2 text-xs text-blue-500">(Timezone: PST)</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-600">
              Total Records: {formatNumber(pagination.totalItems || allocations.length)}
            </div>
            <div className="text-xs text-blue-500">
              Period: {getMonthName(filters.month)} {filters.year}
            </div>
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

          {/* Resource Filter - FIXED */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Resource {resources.length > 0 && <span className="text-xs text-gray-400">({resources.length})</span>}
            </label>
            <select
              id="resource_id"
              value={filters.resource_id}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[42px]"
            >
              <option value="">All Resources</option>
              {resources.map(r => (
                <option key={r._id} value={r._id}>
                  {r.name} {r.email ? `(${r.email})` : ''}
                </option>
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

          {/* Month Filter - FIXED */}
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
                <option key={i + 1} value={(i + 1).toString()}>
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

        {/* Active Filters Display */}
        {(filters.startDate || filters.endDate || filters.resource_id || filters.geography || filters.request_type) && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-yellow-800">Active Filters:</span>
                {filters.resource_id && (
                  <span className="px-2 py-1 bg-yellow-100 rounded text-yellow-800">
                    Resource: {resources.find(r => r._id === filters.resource_id)?.name || 'Selected'}
                  </span>
                )}
                {filters.geography && (
                  <span className="px-2 py-1 bg-yellow-100 rounded text-yellow-800">
                    Geography: {geographiesData.find(g => g._id === filters.geography)?.name || 'Selected'}
                  </span>
                )}
                {filters.request_type && (
                  <span className="px-2 py-1 bg-yellow-100 rounded text-yellow-800">
                    Type: {filters.request_type}
                  </span>
                )}
                {(filters.startDate || filters.endDate) && (
                  <span className="px-2 py-1 bg-yellow-100 rounded text-yellow-800">
                    📅 {filters.startDate || 'Start'} to {filters.endDate || 'End'}
                  </span>
                )}
              </div>
              <button
                onClick={clearFilters}
                className="text-red-600 hover:text-red-800 font-medium text-sm"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{sortedData.length}</span> location summaries 
            from <span className="font-semibold">{allocations.length}</span> entries
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fetchAllocations(1)}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <span className="font-semibold text-sm">{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
            <button
              onClick={exportToCSV}
              disabled={sortedData.length === 0 || isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <span className="font-semibold text-sm">Export CSV</span>
            </button>
          </div>
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
                      <p className="text-sm">
                        {allocations.length === 0 
                          ? `No allocations logged for ${getMonthName(filters.month)} ${filters.year}`
                          : 'Try adjusting your search or filters'}
                      </p>
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
      {grandTotals && grandTotals.totalCasesHours > 0 && (
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