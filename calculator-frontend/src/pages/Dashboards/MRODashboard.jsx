// pages/dashboards/MRODashboard.jsx - MRO CLIENT DASHBOARD
// Updated to fetch from resource-logged daily allocations
// Processing: NRS-NO Records ($2.25) + Manual ($3.00) by Location
// Logging: Flat rate $1.08 per case

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

// =============================================
// MRO PRICING CONSTANTS
// =============================================
const MRO_PRICING = {
  PROCESSING: {
    'NRS-NO Records': 2.25,
    'Manual': 3.00
  },
  LOGGING: 1.08
};

// =============================================
// HELPER COMPONENTS
// =============================================
const Loader = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center py-10">
    <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-3 text-sm text-gray-500">{message}</p>
  </div>
);

// =============================================
// MAIN MRO DASHBOARD COMPONENT
// =============================================
const MRODashboard = () => {
  // State
  const [activeView, setActiveView] = useState('processing');
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    geography_id: '',
    month: 'all',
    year: new Date().getFullYear().toString(),
    startDate: '',
    endDate: '',
    resource_id: '',
    subproject_id: ''
  });
  const [geographies, setGeographies] = useState([]);
  const [resources, setResources] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [allocations, setAllocations] = useState([]);
  const [processingSummary, setProcessingSummary] = useState([]);
  const [loggingSummary, setLoggingSummary] = useState([]);
  const [processingTotals, setProcessingTotals] = useState(null);
  const [loggingTotals, setLoggingTotals] = useState(null);
  
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
        setGeographies(Array.isArray(data) ? data : data.geographies || []);
      } catch (error) {
        console.error('Error fetching geographies:', error);
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
        // Filter to only MRO-assigned resources
        const mroResources = (data.resources || data || []).filter(r => 
          r.assignments?.some(a => a.client_name?.toLowerCase() === 'mro')
        );
        setResources(mroResources);
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
    
    // Build from month/year
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
    
    // Full year
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
      if (activeView === 'processing') {
        params.append('process_type', 'Processing');
      } else {
        params.append('process_type', 'Logging');
      }

      const response = await fetch(`${apiBaseUrl}/mro-daily-allocations/admin/all?${params}`, {
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
  }, [filters, activeView, getDateRange]);

  // Process raw allocations into location-based summary
  const processAllocationsIntoSummary = useCallback((allocs) => {
    if (activeView === 'processing') {
      // Group by location for processing
      const locationMap = new Map();
      
      allocs.forEach(alloc => {
        const key = alloc.subproject_name || alloc.subproject_id;
        if (!locationMap.has(key)) {
          locationMap.set(key, {
            location: alloc.subproject_name,
            subproject_id: alloc.subproject_id,
            geography_name: alloc.geography_name,
            nrsNoRecords: 0,
            nrsNoTotal: 0,
            manual: 0,
            manualTotal: 0,
            totalBilling: 0,
            grandTotal: 0
          });
        }
        
        const entry = locationMap.get(key);
        
        if (alloc.requestor_type === 'NRS-NO Records') {
          entry.nrsNoRecords += 1;
          entry.nrsNoTotal += alloc.billing_amount || MRO_PRICING.PROCESSING['NRS-NO Records'];
        } else if (alloc.requestor_type === 'Manual') {
          entry.manual += 1;
          entry.manualTotal += alloc.billing_amount || MRO_PRICING.PROCESSING['Manual'];
        }
        
        entry.grandTotal = entry.nrsNoRecords + entry.manual;
        entry.totalBilling = entry.nrsNoTotal + entry.manualTotal;
      });

      const summaryData = Array.from(locationMap.values());
      
      // Apply search filter
      const filtered = searchTerm 
        ? summaryData.filter(row => 
            row.location?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : summaryData;

      // Apply geography filter
      const geoFiltered = filters.geography_id
        ? filtered.filter(row => {
            const geo = geographies.find(g => g._id === filters.geography_id);
            return geo && row.geography_name?.toLowerCase() === geo.name?.toLowerCase();
          })
        : filtered;

      setProcessingSummary(geoFiltered);

      // Calculate totals
      const totals = geoFiltered.reduce((acc, row) => ({
        nrsNoRecords: acc.nrsNoRecords + row.nrsNoRecords,
        nrsNoTotal: acc.nrsNoTotal + row.nrsNoTotal,
        manual: acc.manual + row.manual,
        manualTotal: acc.manualTotal + row.manualTotal,
        totalBilling: acc.totalBilling + row.totalBilling,
        grandTotal: acc.grandTotal + row.grandTotal
      }), { nrsNoRecords: 0, nrsNoTotal: 0, manual: 0, manualTotal: 0, totalBilling: 0, grandTotal: 0 });

      setProcessingTotals(totals);

    } else {
      // Logging summary - simpler, just count cases
      const totalCases = allocs.length;
      const totalBilling = allocs.reduce((sum, a) => sum + (a.billing_amount || MRO_PRICING.LOGGING), 0);

      setLoggingSummary(allocs);
      setLoggingTotals({
        totalCases,
        totalBilling
      });
    }
  }, [activeView, searchTerm, filters.geography_id, geographies]);

  // Fetch data when filters/view change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAllocations(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, searchTerm, activeView, fetchAllocations]);

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

  const sortedProcessingData = [...processingSummary].sort((a, b) => {
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
      let headers, rows;

      if (activeView === 'processing') {
        if (processingSummary.length === 0) {
          toast.dismiss(loadingToast);
          toast.error('No data to export');
          return;
        }

        headers = ['Sr No', 'Location', 'NRS-NO Records', 'Price per case', 'Total', 'Manual', 'Price per case', 'Total', 'Total Billing', 'Grand Total'];
        rows = sortedProcessingData.map((row, idx) => [
          idx + 1, row.location || '', row.nrsNoRecords || 0, '$2.25', (row.nrsNoTotal || 0).toFixed(2),
          row.manual || 0, '$3.00', (row.manualTotal || 0).toFixed(2), (row.totalBilling || 0).toFixed(2), row.grandTotal || 0
        ]);

        if (processingTotals) {
          rows.push(['', 'GRAND TOTAL', processingTotals.nrsNoRecords || 0, '', (processingTotals.nrsNoTotal || 0).toFixed(2),
            processingTotals.manual || 0, '', (processingTotals.manualTotal || 0).toFixed(2),
            (processingTotals.totalBilling || 0).toFixed(2), processingTotals.grandTotal || 0
          ]);
        }
      } else {
        headers = ['Details', 'Cases', 'Pricing', 'Grand Total'];
        rows = [['MRO Logging', loggingTotals?.totalCases || 0, '$1.08', (loggingTotals?.totalBilling || 0).toFixed(2)]];
      }

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [headers.map(escapeCSV).join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const dateRange = filters.startDate && filters.endDate 
        ? `${filters.startDate}-to-${filters.endDate}`
        : `${filters.year}-${filters.month !== 'all' ? filters.month : 'all'}`;
      
      a.download = `mro-${activeView}-${dateRange}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.dismiss(loadingToast);
      toast.success('Successfully exported!');

    } catch (error) {
      console.error('Export error:', error);
      toast.dismiss(loadingToast);
      toast.error(error.message || 'Failed to export data.');
    }
  };

  // Processing Columns Definition
  const processingColumns = [
    { key: 'srNo', header: 'Sr No', sortable: false, className: 'w-16' },
    { key: 'location', header: 'Location', sortable: true, className: 'min-w-[200px]' },
    { key: 'nrsNoRecords', header: 'NRS-NO Records', sortable: true, className: 'w-32 text-right' },
    { key: 'nrsNoPrice', header: 'Price per case', sortable: false, className: 'w-28 text-right' },
    { key: 'nrsNoTotal', header: 'Total', sortable: true, className: 'w-32 text-right' },
    { key: 'manual', header: 'Manual', sortable: true, className: 'w-24 text-right' },
    { key: 'manualPrice', header: 'Price per case', sortable: false, className: 'w-28 text-right' },
    { key: 'manualTotal', header: 'Total', sortable: true, className: 'w-32 text-right' },
    { key: 'totalBilling', header: 'Total Billing', sortable: true, className: 'w-36 text-right' },
    { key: 'grandTotal', header: 'Grand Total', sortable: true, className: 'w-28 text-right' }
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Header Info Banner */}
      <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-green-900">MRO Resource Daily Allocations</div>
            <div className="text-sm text-green-700">
              Viewing data logged by resources via daily allocation entry
            </div>
          </div>
          <div className="text-xs text-green-600">
            Total Records: {formatNumber(pagination.totalItems || allocations.length)}
          </div>
        </div>
      </div>

      {/* Controls Panel */}
      <div className="bg-white rounded-xl shadow-md p-4">
        <div className="flex items-center justify-between mb-4">
          {/* View Toggle */}
          <div className="flex items-center space-x-3">
            <label className="text-sm font-medium text-gray-700">View:</label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveView('processing')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeView === 'processing' ? 'bg-teal-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>📊</span>
                <span>Processing Dashboard</span>
              </button>
              <button
                onClick={() => setActiveView('logging')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
                  activeView === 'logging' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>📝</span>
                <span>Logging Dashboard</span>
              </button>
            </div>
          </div>
        </div>

       

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Geography</label>
            <select id="geography_id" value={filters.geography_id} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]">
              <option value="">All Geographies</option>
              {geographies.map(g => (
                <option key={g._id} value={g._id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resource</label>
            <select id="resource_id" value={filters.resource_id} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]">
              <option value="">All Resources</option>
              {resources.map(r => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select id="month" value={filters.month} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]">
              <option value="all">All Months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
            <select id="year" value={filters.year} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]">
              <option value="2027">2027</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2024">2024</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" id="startDate" value={filters.startDate} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input type="date" id="endDate" value={filters.endDate} onChange={handleFilterChange} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 min-h-[42px]" />
          </div>

          {activeView === 'processing' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Location</label>
              <input type="text" placeholder="Search locations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:outline-none min-h-[42px]" />
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            {activeView === 'processing' ? (
              <>Showing <span className="font-semibold">{sortedProcessingData.length}</span> locations</>
            ) : (
              <span className="font-semibold">Logging Summary</span>
            )}
          </div>
          <button onClick={exportToCSV} disabled={isLoading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2">
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* PROCESSING VIEW */}
      {activeView === 'processing' && (
        <>
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th colSpan={2} className="py-2 px-3"></th>
                    <th colSpan={3} className="py-2 px-3 text-center text-xs font-bold text-teal-600 uppercase bg-teal-50 border-l">NRS-NO Records</th>
                    <th colSpan={3} className="py-2 px-3 text-center text-xs font-bold text-blue-600 uppercase bg-blue-50 border-l">Manual</th>
                    <th colSpan={2} className="py-2 px-3 text-center text-xs font-bold text-green-600 uppercase bg-green-50 border-l">Totals</th>
                  </tr>
                  <tr className="bg-gray-50 border-b">
                    {processingColumns.map((col) => (
                      <th key={col.key} onClick={() => col.sortable && handleSort(col.key)} className={`py-3 px-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider ${col.className || ''} ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span>{col.header}</span>
                          {col.sortable && <span className="text-gray-400 ml-1">{sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr><td colSpan={processingColumns.length}><Loader message="Loading processing data..." /></td></tr>
                  ) : sortedProcessingData.length === 0 ? (
                    <tr>
                      <td colSpan={processingColumns.length} className="py-10 text-center">
                        <div className="text-gray-500">
                          <div className="text-4xl mb-2">📊</div>
                          <p className="font-medium">No processing data found</p>
                          <p className="text-sm">Resources haven't logged any processing allocations for this period</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {sortedProcessingData.map((row, idx) => (
                        <tr key={`${row.location}-${idx}`} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-3 text-sm text-gray-600">{idx + 1}</td>
                          <td className="py-3 px-3 text-sm font-medium text-gray-900">{row.location}</td>
                          <td className="py-3 px-3 text-sm text-right bg-teal-50/30 font-medium">{formatNumber(row.nrsNoRecords)}</td>
                          <td className="py-3 px-3 text-sm text-right bg-teal-50/30 text-gray-500">$2.25</td>
                          <td className="py-3 px-3 text-sm text-right bg-teal-50/30 text-teal-700 font-semibold">{formatCurrency(row.nrsNoTotal || 0)}</td>
                          <td className="py-3 px-3 text-sm text-right bg-blue-50/30 font-medium">{formatNumber(row.manual)}</td>
                          <td className="py-3 px-3 text-sm text-right bg-blue-50/30 text-gray-500">$3.00</td>
                          <td className="py-3 px-3 text-sm text-right bg-blue-50/30 text-blue-700 font-semibold">{formatCurrency(row.manualTotal || 0)}</td>
                          <td className="py-3 px-3 text-sm text-right bg-green-50/30 font-bold text-green-700">{formatCurrency(row.totalBilling || 0)}</td>
                          <td className="py-3 px-3 text-sm text-right bg-yellow-50/30 font-bold text-gray-900">{formatNumber(row.grandTotal)}</td>
                        </tr>
                      ))}
                      {processingTotals && (
                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                          <td className="py-4 px-3"></td>
                          <td className="py-4 px-3 text-sm text-gray-900 uppercase">Grand Total</td>
                          <td className="py-4 px-3 text-sm text-right bg-teal-100">{formatNumber(processingTotals.nrsNoRecords)}</td>
                          <td className="py-4 px-3 text-sm text-right bg-teal-100"></td>
                          <td className="py-4 px-3 text-sm text-right bg-teal-100 text-teal-800">{formatCurrency(processingTotals.nrsNoTotal || 0)}</td>
                          <td className="py-4 px-3 text-sm text-right bg-blue-100">{formatNumber(processingTotals.manual)}</td>
                          <td className="py-4 px-3 text-sm text-right bg-blue-100"></td>
                          <td className="py-4 px-3 text-sm text-right bg-blue-100 text-blue-800">{formatCurrency(processingTotals.manualTotal || 0)}</td>
                          <td className="py-4 px-3 text-sm text-right bg-green-100 text-green-800">{formatCurrency(processingTotals.totalBilling || 0)}</td>
                          <td className="py-4 px-3 text-sm text-right bg-yellow-100 text-gray-900">{formatNumber(processingTotals.grandTotal)}</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Processing Summary Cards */}
          {processingTotals && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-teal-500">
                <div className="text-sm text-gray-500 uppercase tracking-wider">NRS-NO Records</div>
                <div className="text-sm font-bold text-gray-900 mt-1">{formatNumber(processingTotals.nrsNoRecords)} cases</div>
                <div className="text-sm font-semibold text-teal-600">{formatCurrency(processingTotals.nrsNoTotal)}</div>
                <div className="text-xs text-gray-400 mt-1">@ $2.25/case</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-blue-500">
                <div className="text-sm text-gray-500 uppercase tracking-wider">Manual</div>
                <div className="text-sm font-bold text-gray-900 mt-1">{formatNumber(processingTotals.manual)} cases</div>
                <div className="text-sm font-semibold text-blue-600">{formatCurrency(processingTotals.manualTotal)}</div>
                <div className="text-xs text-gray-400 mt-1">@ $3.00/case</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-green-500">
                <div className="text-sm text-gray-500 uppercase tracking-wider">Total Billing</div>
                <div className="text-sm font-bold text-green-700 mt-1">{formatCurrency(processingTotals.totalBilling)}</div>
                <div className="text-sm text-gray-500">Processing Revenue</div>
              </div>
              <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-yellow-500">
                <div className="text-sm text-gray-500 uppercase tracking-wider">Grand Total Cases</div>
                <div className="text-sm font-bold text-gray-900 mt-1">{formatNumber(processingTotals.grandTotal)}</div>
                <div className="text-sm text-gray-500">NRS-NO + Manual</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* LOGGING VIEW */}
      {activeView === 'logging' && (
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-emerald-50 to-green-50 border-b">
            <h3 className="text-xl font-bold text-emerald-800">MRO Logging Summary</h3>
            {/* <p className="text-sm text-emerald-600 mt-1">All logging entries at flat rate of $1.08 per case</p> */}
          </div>
          
          {isLoading ? (
            <Loader message="Loading logging data..." />
          ) : loggingTotals ? (
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full max-w-2xl">
                  <thead>
                    <tr className="bg-emerald-50">
                      <th className="py-3 px-4 text-left text-sm font-semibold text-emerald-800">Details</th>
                      <th className="py-3 px-4 text-right text-sm font-semibold text-blue-800 bg-blue-50">Cases</th>
                      <th className="py-3 px-4 text-right text-sm font-semibold text-purple-800 bg-purple-50">Pricing</th>
                      <th className="py-3 px-4 text-right text-sm font-semibold text-green-800 bg-green-50">Grand Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-4 px-4 text-sm font-medium text-gray-900 bg-emerald-50/50">MRO Logging</td>
                      <td className="py-4 px-4 text-right text-lg font-bold text-blue-700 bg-blue-50/50">{formatNumber(loggingTotals.totalCases)}</td>
                      <td className="py-4 px-4 text-right text-lg font-bold text-purple-700 bg-purple-50/50">$1.08</td>
                      <td className="py-4 px-4 text-right text-lg font-bold text-green-700 bg-green-50/50">{formatCurrency(loggingTotals.totalBilling)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Logging Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <div className="text-sm text-blue-600 uppercase tracking-wider font-medium">Total Cases</div>
                  <div className="text-md font-bold text-blue-800 mt-2">{formatNumber(loggingTotals.totalCases)}</div>
                  <div className="text-blue-600 text-sm mt-1">logging entries</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                  <div className="text-sm text-purple-600 uppercase tracking-wider font-medium">Rate per Case</div>
                  <div className="text-md font-bold text-purple-800 mt-2">$1.08</div>
                  <div className="text-purple-600 text-sm mt-1">flat rate</div>
                </div>
                <div className="bg-gradient-to-br  from-green-50 to-green-100 rounded-xl flex flex-col justify-center pl-6  border border-green-200">
                  <div className="text-sm text-green-600 uppercase tracking-wider font-medium">Total Billing</div>
                  <div className="text-md font-bold text-green-800 mt-2">{formatCurrency(loggingTotals.totalBilling)}</div>
                  <div className="text-green-600 text-sm mt-1">logging revenue</div>
                </div>
              </div>

              {/* Detailed Logging Table */}
              {loggingSummary.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">Detailed Logging Entries</h4>
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-100">
                        <tr>
                          <th className="py-2 px-3 text-left">Date</th>
                          <th className="py-2 px-3 text-left">Resource</th>
                          <th className="py-2 px-3 text-left">Location</th>
                          <th className="py-2 px-3 text-left">Request ID</th>
                          <th className="py-2 px-3 text-left">Request Type</th>
                          <th className="py-2 px-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {loggingSummary.slice(0, 50).map((entry, idx) => (
                          <tr key={entry._id || idx} className="hover:bg-gray-50">
                            <td className="py-2 px-3">{formatDate(entry.allocation_date)}</td>
                            <td className="py-2 px-3">{entry.resource_name}</td>
                            <td className="py-2 px-3">{entry.subproject_name}</td>
                            <td className="py-2 px-3">{entry.request_id || '-'}</td>
                            <td className="py-2 px-3">{entry.request_type}</td>
                            <td className="py-2 px-3 text-right text-green-600 font-medium">{formatCurrency(entry.billing_amount || MRO_PRICING.LOGGING)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {loggingSummary.length > 50 && (
                      <div className="text-center py-3 text-gray-500 text-sm">
                        Showing 50 of {loggingSummary.length} entries
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="text-gray-400">
                <div className="text-6xl mb-4">📝</div>
                <p className="text-lg font-medium">No logging data found</p>
                <p className="text-sm mt-2">Resources haven't logged any entries for this period</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MRODashboard;