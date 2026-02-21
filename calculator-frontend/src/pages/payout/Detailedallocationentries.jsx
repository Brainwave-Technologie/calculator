import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL  ;

// ============================================
// REUSABLE COMPONENTS
// ============================================

const PageHeader = ({ heading, subHeading, color = 'blue' }) => {
  const colors = {
    blue: 'from-blue-600 to-blue-800',
    green: 'from-green-600 to-green-800',
    purple: 'from-purple-600 to-purple-800'
  };
  
  return (
    <div className={`p-6 bg-gradient-to-r ${colors[color]} text-white`}>
      <h1 className="text-3xl font-extrabold">{heading}</h1>
      <p className="text-sm opacity-90 mt-1">{subHeading}</p>
    </div>
  );
};

const Loader = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center py-6">
    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-3 text-sm text-gray-500">{message}</p>
  </div>
);

// Request Type Badge
const RequestTypeBadge = ({ type }) => {
  if (!type) return <span className="text-gray-400">—</span>;
  
  const colors = {
    'New Request': 'bg-green-100 text-green-700 border-green-300',
    'Key': 'bg-yellow-100 text-yellow-700 border-yellow-300',
    'Duplicate': 'bg-orange-100 text-orange-700 border-orange-300',
    'Follow up': 'bg-blue-100 text-blue-700 border-blue-300'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${colors[type] || 'bg-gray-100 text-gray-700 border-gray-300'}`}>
      {type}
    </span>
  );
};

// Process Type Badge (for MRO)
const ProcessTypeBadge = ({ type }) => {
  if (!type) return <span className="text-gray-400">—</span>;
  
  const colors = {
    'Processing': 'bg-blue-100 text-blue-700',
    'Logging': 'bg-green-100 text-green-700',
    'MRO Payer Project': 'bg-purple-100 text-purple-700'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
      {type}
    </span>
  );
};

// ============================================
// DETAILED ALLOCATION ENTRIES COMPONENT
// ============================================

const DetailedAllocationEntries = ({ clientName = 'Verisma', clientColor = 'blue' }) => {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(false);
  const [allocations, setAllocations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState({
    resource_email: '',
    request_type: '',
    process_type: ''
  });

  const scrollRef = useRef(null);
  const limit = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch allocations
  const fetchAllocations = useCallback(async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const endpoint = clientName.toLowerCase();
      const params = new URLSearchParams({
        month: month.toString(),
        year: year.toString(),
        page: pageNum.toString(),
        limit: limit.toString()
      });

      if (filters.resource_email) params.append('resource_email', filters.resource_email);
      if (filters.request_type) params.append('request_type', filters.request_type);
      if (filters.process_type) params.append('process_type', filters.process_type);

      const response = await fetch(`${apiBaseUrl}/payroll/${endpoint}/detailed?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setAllocations(data.allocations || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setPages(data.pages || 1);

    } catch (error) {
      console.error('Fetch error:', error);
      setAllocations([]);
    } finally {
      setIsLoading(false);
    }
  }, [clientName, month, year, filters]);

  useEffect(() => {
    fetchAllocations(1);
  }, [fetchAllocations]);

  // Format date
  const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2 
    }).format(amount || 0);
  };

  // Theme
  const themeColors = {
    blue: { border: 'border-blue-500', bg: 'bg-blue-500' },
    green: { border: 'border-green-500', bg: 'bg-green-500' },
    purple: { border: 'border-purple-500', bg: 'bg-purple-500' }
  };
  const theme = themeColors[clientColor] || themeColors.blue;

  // Request types based on client
  const requestTypes = clientName === 'Verisma' 
    ? ['New Request', 'Key', 'Duplicate']
    : ['New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'];

  const processTypes = ['Processing', 'Logging', 'MRO Payer Project'];

  return (
    <div className="bg-gray-50 min-h-screen">
      <PageHeader 
        heading={`${clientName} Detailed Allocation Entries`}
        subHeading="Individual entries logged by resources"
        color={clientColor}
      />

      <div className="p-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`bg-white rounded-xl p-4 shadow border-l-4 ${theme.border}`}>
            <div className="text-sm text-gray-500">Total Entries</div>
            <div className="text-2xl font-bold text-gray-800">{total.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow border-l-4 border-green-500">
            <div className="text-sm text-gray-500">Total Billing</div>
            <div className="text-2xl font-bold text-green-700">
              {formatCurrency(allocations.reduce((sum, a) => sum + (a.billing_amount || 0), 0))}
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow border-l-4 border-orange-500">
            <div className="text-sm text-gray-500">Page</div>
            <div className="text-2xl font-bold text-gray-800">{page} / {pages}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select 
                value={year} 
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request Type</label>
              <select 
                value={filters.request_type}
                onChange={(e) => setFilters(prev => ({ ...prev, request_type: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">All Request Types</option>
                {requestTypes.map(rt => (
                  <option key={rt} value={rt}>{rt}</option>
                ))}
              </select>
            </div>
            {clientName === 'MRO' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label>
                <select 
                  value={filters.process_type}
                  onChange={(e) => setFilters(prev => ({ ...prev, process_type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">All Process Types</option>
                  {processTypes.map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Search</label>
              <input 
                type="text"
                placeholder="Search resource..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
            <table className="w-full">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Resource</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Location</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Request Type</th>
                  {clientName === 'MRO' && (
                    <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Process Type</th>
                  )}
                  <th className="py-3 px-4 text-center text-xs font-semibold text-gray-600">Count</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600">Rate</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600">Remark</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={clientName === 'MRO' ? 9 : 8} className="py-10">
                      <Loader message="Loading entries..." />
                    </td>
                  </tr>
                ) : allocations.length === 0 ? (
                  <tr>
                    <td colSpan={clientName === 'MRO' ? 9 : 8} className="py-10 text-center text-gray-500">
                      <div className="text-4xl mb-2">📋</div>
                      <p>No entries found</p>
                    </td>
                  </tr>
                ) : (
                  allocations.map((alloc, idx) => (
                    <tr key={alloc._id || idx} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-4 text-sm text-gray-700">
                        {formatDate(alloc.allocation_date)}
                      </td>
                      <td className="py-2 px-4 text-sm font-medium text-gray-800">
                        {alloc.resource_name}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-700">
                        {alloc.subproject_name}
                      </td>
                      <td className="py-2 px-4">
                        <RequestTypeBadge type={alloc.request_type} />
                      </td>
                      {clientName === 'MRO' && (
                        <td className="py-2 px-4">
                          <ProcessTypeBadge type={alloc.process_type} />
                        </td>
                      )}
                      <td className="py-2 px-4 text-sm text-center font-medium text-gray-800">
                        {alloc.count || 1}
                      </td>
                      <td className="py-2 px-4 text-sm text-right text-gray-600">
                        {formatCurrency(alloc.billing_rate)}
                      </td>
                      <td className="py-2 px-4 text-sm text-right font-semibold text-green-700">
                        {formatCurrency(alloc.billing_amount)}
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-500 max-w-[150px] truncate" title={alloc.remark}>
                        {alloc.remark || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="p-4 border-t flex justify-between items-center">
              <span className="text-sm text-gray-500">
                Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => fetchAllocations(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm">{page} / {pages}</span>
                <button
                  onClick={() => fetchAllocations(page + 1)}
                  disabled={page >= pages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// CLIENT-SPECIFIC EXPORTS
// ============================================

export const VerismaDetailedEntries = () => (
  <DetailedAllocationEntries clientName="Verisma" clientColor="blue" />
);

export const MRODetailedEntries = () => (
  <DetailedAllocationEntries clientName="MRO" clientColor="green" />
);

export const DatavantDetailedEntries = () => (
  <DetailedAllocationEntries clientName="Datavant" clientColor="purple" />
);

export default DetailedAllocationEntries;