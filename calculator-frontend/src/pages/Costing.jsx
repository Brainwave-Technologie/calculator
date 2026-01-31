import { useState, useEffect, useCallback, useRef } from 'react';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/api';

const PageHeader = ({ heading, subHeading }) => (
  <div className="p-6 bg-white border-b border-gray-200">
    <h1 className="text-3xl font-extrabold text-gray-900">{heading}</h1>
    <p className="text-sm text-gray-500 mt-1">{subHeading}</p>
  </div>
);

const Loader = ({ message = "Loading..." }) => (
  <div className="flex flex-col items-center py-6">
    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
    <p className="mt-3 text-sm text-gray-500 animate-pulse">{message}</p>
  </div>
);

// Request Type Badge Component
const RequestTypeBadge = ({ type }) => {
  if (!type) return <span className="text-gray-400 text-xs">—</span>;
  
  const colors = {
    'New Request': 'bg-blue-100 text-blue-700',
    'Key': 'bg-purple-100 text-purple-700',
    'Duplicate': 'bg-orange-100 text-orange-700'
  };
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 text-gray-700'}`}>
      {type}
    </span>
  );
};

// ============================================
// ASYNC SEARCHABLE DROPDOWN COMPONENT
// ============================================
const AsyncSearchDropdown = ({ 
  value, 
  onChange, 
  placeholder = "Search...",
  disabled = false,
  fetchUrl,
  labelKey = "name",
  valueKey = "_id",
  minSearchLength = 0,
  debounceMs = 300
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef(null);
  const searchTimeout = useRef(null);
  const listRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch options with search and pagination
  const fetchOptions = useCallback(async (search = '', pageNum = 1, append = false) => {
    if (!fetchUrl) return;
    
    setIsLoading(true);
    try {
      const separator = fetchUrl.includes('?') ? '&' : '?';
      const url = `${fetchUrl}${separator}search=${encodeURIComponent(search)}&page=${pageNum}&limit=20`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch');
      
      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.data || data.subprojects || []);
      const total = data.total || items.length;
      
      if (append) {
        setOptions(prev => [...prev, ...items]);
      } else {
        setOptions(items);
      }
      
      setHasMore(pageNum * 20 < total);
      setPage(pageNum);
    } catch (error) {
      console.error('Fetch error:', error);
      setOptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchUrl]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(() => {
      if (searchTerm.length >= minSearchLength || searchTerm === '') {
        fetchOptions(searchTerm, 1, false);
      }
    }, debounceMs);

    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchTerm, isOpen, fetchOptions, minSearchLength, debounceMs]);

  // Load more on scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current || isLoading || !hasMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      fetchOptions(searchTerm, page + 1, true);
    }
  }, [isLoading, hasMore, page, searchTerm, fetchOptions]);

  // Fetch selected item's label if value is set but label is empty
  useEffect(() => {
    if (value && !selectedLabel) {
      // Try to find in current options first
      const found = options.find(opt => opt[valueKey] === value);
      if (found) {
        setSelectedLabel(found[labelKey]);
      }
    }
  }, [value, options, valueKey, labelKey, selectedLabel]);

  const handleSelect = (option) => {
    onChange(option[valueKey]);
    setSelectedLabel(option[labelKey]);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSelectedLabel('');
    setSearchTerm('');
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Selected Value / Trigger */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-4 py-3 border rounded-xl flex items-center justify-between cursor-pointer ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-blue-400'
        } ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {selectedLabel || placeholder}
        </span>
        <div className="flex items-center space-x-2">
          {value && !disabled && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-red-500 p-1"
            >
              ✕
            </button>
          )}
          <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-72 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b sticky top-0 bg-white">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to search..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
              autoFocus
            />
          </div>

          {/* Options List */}
          <div 
            ref={listRef}
            onScroll={handleScroll}
            className="max-h-56 overflow-y-auto"
          >
            {/* All Option */}
            <div
              onClick={() => handleSelect({ [valueKey]: '', [labelKey]: 'All' })}
              className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b"
            >
              All (No Filter)
            </div>

            {isLoading && options.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading...
              </div>
            ) : options.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchTerm ? 'No results found' : 'Type to search'}
              </div>
            ) : (
              <>
                {options.map((option) => (
                  <div
                    key={option[valueKey]}
                    onClick={() => handleSelect(option)}
                    className={`px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm ${
                      option[valueKey] === value ? 'bg-blue-100 font-medium' : ''
                    }`}
                  >
                    {option[labelKey]}
                  </div>
                ))}
                {isLoading && options.length > 0 && (
                  <div className="p-2 text-center text-gray-400 text-xs">
                    Loading more...
                  </div>
                )}
                {!hasMore && options.length > 0 && (
                  <div className="p-2 text-center text-gray-400 text-xs">
                    End of list
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Costing = () => {
  // --- State Management ---
  const [projectsData, setProjectsData] = useState([]);
  const [filters, setFilters] = useState({
    project: '',
    subProject: '',
    requestType: '',
    month: (new Date().getMonth() + 1).toString(),
    year: new Date().getFullYear().toString()
  });
  
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showNonBillable, setShowNonBillable] = useState(true);
  const [sortConfig, setSortConfig] = useState({ key: 'resource', direction: 'ascending' });
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  
  // --- Invoice & UI States ---
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [invoiceInfo, setInvoiceInfo] = useState(null);

  // Pagination & Infinite Scroll
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 50;
  
  // Totals
  const [totals, setTotals] = useState({ revenue: 0, cost: 0, profit: 0 });
  
  // Refs
  const scrollContainerRef = useRef(null);
  const loadingRef = useRef(false);
  const pendingUpdates = useRef(new Map());
  const saveTimeouts = useRef(new Map());

  // Request Types Options
  const REQUEST_TYPES = ['New Request', 'Key', 'Duplicate'];

  // --- Helpers ---
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  const formatCurrency = (amount) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount || 0);

  // --- Effects ---

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch projects on mount (projects are usually < 100, so load all)
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/project`);
        const projects = await response.json();
        setProjectsData(Array.isArray(projects) ? projects : projects.data || []);
      } catch (error) {
        console.error("Error fetching projects:", error);
        showToast(`Error: ${error.message}`, 'error');
      }
    };
    fetchProjects();
  }, []);

  // Fetch totals
  const fetchTotals = useCallback(async () => {
    const { project, subProject, requestType, month, year } = filters;
    
    try {
      const params = new URLSearchParams({
        month,
        year,
        show_non_billable: showNonBillable.toString()
      });
      
      if (project) params.append('project_id', project);
      if (subProject) params.append('subproject_id', subProject);
      if (requestType) params.append('request_type', requestType);

      const response = await fetch(`${apiBaseUrl}/billing/totals?${params}`);
      if (!response.ok) throw new Error('Failed to fetch totals');
      
      const data = await response.json();
      setTotals({
        revenue: data.revenue || 0,
        cost: data.cost || 0,
        profit: data.profit || 0
      });
    } catch (error) {
      console.error("Error fetching totals:", error);
    }
  }, [filters, showNonBillable]);

  // Fetch billing data
  const fetchBillingData = useCallback(async (page = 1, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    
    const { project, subProject, requestType, month, year } = filters;

    setIsLoading(true);
    
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        month,
        year,
        sort_by: sortConfig.key,
        sort_order: sortConfig.direction,
        show_non_billable: showNonBillable.toString()
      });

      if (project) params.append('project_id', project);
      if (subProject) params.append('subproject_id', subProject);
      if (requestType) params.append('request_type', requestType);
      if (debouncedSearch) params.append('search', debouncedSearch);

      const response = await fetch(`${apiBaseUrl}/billing/paginated?${params}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch billing data');
      }
      
      if (append) {
        setResources(prev => [...prev, ...data.records]);
      } else {
        setResources(data.records);
      }
      
      setTotalRecords(data.total);
      setTotalPages(data.totalPages);
      setCurrentPage(page);
      setHasMore(data.hasMore);
      
    } catch (error) {
      console.error("Error loading billing data:", error);
      showToast(error.message, 'error');
      setResources([]);
    } finally {
      setIsLoading(false);
      loadingRef.current = false;
    }
  }, [filters, debouncedSearch, sortConfig, showNonBillable]);

  // Refetch when filters change
  useEffect(() => {
    setResources([]);
    setCurrentPage(1);
    fetchBillingData(1, false);
    fetchTotals();
  }, [filters, debouncedSearch, sortConfig, showNonBillable]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight - scrollTop <= clientHeight * 1.2) {
      fetchBillingData(currentPage + 1, true);
    }
  }, [currentPage, hasMore, isLoading, fetchBillingData]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Get rate for productivity level from availableRates
  const getRateForLevel = (availableRates, level) => {
    if (!availableRates || availableRates.length === 0) return 0;
    const normalizedLevel = (level || 'medium').toLowerCase();
    const found = availableRates.find(r => r.level === normalizedLevel);
    return found ? found.base_rate : 0;
  };

  // Handle resource changes with optimistic update
  const handleResourceChange = useCallback((uniqueId, field, value) => {
    const resource = resources.find(r => r.uniqueId === uniqueId);
    if (!resource) return;

    // Calculate new rate if productivity changed
    let newRate = resource.rate;
    let newCosting = resource.costing;
    let newTotalBill = resource.totalBill;

    if (field === 'productivity') {
      newRate = getRateForLevel(resource.availableRates, value);
      newCosting = (resource.hours || 0) * newRate;
      newTotalBill = (resource.hours || 0) * (resource.flatrate || 0);
    } else if (field === 'hours') {
      const hours = Number(value) || 0;
      newCosting = hours * resource.rate;
      newTotalBill = hours * (resource.flatrate || 0);
    }

    // Optimistic UI update
    setResources(prev => prev.map(r => {
      if (r.uniqueId === uniqueId) {
        const updates = { [field]: value };
        if (field === 'productivity') {
          updates.rate = newRate;
          updates.costing = newCosting;
        } else if (field === 'hours') {
          updates.costing = newCosting;
          updates.totalBill = newTotalBill;
        }
        return { ...r, ...updates };
      }
      return r;
    }));

    // Queue the update
    const existing = pendingUpdates.current.get(uniqueId) || {};
    const updateData = { ...existing, [field]: value };
    if (field === 'productivity') {
      updateData.rate = newRate;
    }
    pendingUpdates.current.set(uniqueId, updateData);

    // Debounce save
    if (saveTimeouts.current.has(uniqueId)) {
      clearTimeout(saveTimeouts.current.get(uniqueId));
    }

    const timeout = setTimeout(async () => {
      const updates = pendingUpdates.current.get(uniqueId);
      if (!updates) return;

      try {
        const currentResource = resources.find(r => r.uniqueId === uniqueId);
        if (!currentResource) return;

        const mergedResource = { ...currentResource, ...updates };

        const payload = {
          billingId: currentResource.billingId,
          isMonthlyRecord: currentResource.isMonthlyRecord,
          projectId: currentResource.projectId,
          subprojectId: currentResource.subprojectId,
          _id: currentResource._id,
          requestType: currentResource.requestType,
          hours: Number(mergedResource.hours) || 0,
          productivity_level: mergedResource.productivity || 'Medium',
          rate: mergedResource.rate || currentResource.rate,
          flatrate: currentResource.flatrate,
          description: currentResource.description,
          isBillable: mergedResource.isBillable !== undefined ? mergedResource.isBillable : currentResource.isBillable,
          month: parseInt(filters.month),
          year: parseInt(filters.year)
        };

        const response = await fetch(`${apiBaseUrl}/billing/bulk-update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: [payload] })
        });

        if (!response.ok) throw new Error('Update failed');
        
        const data = await response.json();
        if (data.results && data.results[0]) {
          setResources(prev => prev.map(r => 
            r.uniqueId === uniqueId 
              ? { 
                  ...r, 
                  billingId: data.results[0]._id, 
                  isMonthlyRecord: true,
                  rate: data.results[0].rate || r.rate,
                  costing: data.results[0].costing || r.costing
                }
              : r
          ));
        }
        pendingUpdates.current.delete(uniqueId);
        fetchTotals();
      } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save changes', 'error');
      }
    }, 1000);

    saveTimeouts.current.set(uniqueId, timeout);
  }, [resources, filters, fetchTotals]);

  // Toggle billable status
  const handleToggleBillable = useCallback((uniqueId) => {
    const resource = resources.find(r => r.uniqueId === uniqueId);
    if (!resource) return;
    handleResourceChange(uniqueId, 'isBillable', !resource.isBillable);
  }, [resources, handleResourceChange]);

  const handleFilterChange = (e) => {
    const { id, value } = e.target;
    setFilters(prev => ({ 
      ...prev, 
      [id]: value, 
      ...(id === 'project' ? { subProject: '', requestType: '' } : {}),
      ...(id === 'subProject' ? { requestType: '' } : {})
    }));
  };

  // Handle subproject change from async dropdown
  const handleSubprojectChange = (value) => {
    setFilters(prev => ({ ...prev, subProject: value }));
  };

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending'
    }));
  };

  // --- INVOICE GENERATION LOGIC ---

  const handleGenerateClick = () => {
    if (totals.revenue <= 0) {
      showToast("No revenue to invoice. Please add billable hours.", "error");
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmInvoice = async () => {
    setIsGeneratingInvoice(true);
    try {
      const response = await fetch(`${apiBaseUrl}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: filters.project,
          subproject_id: filters.subProject,
          request_type: filters.requestType,
          month: filters.month,
          year: filters.year
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Invoice generation failed');

      setInvoiceInfo({
        id: data.invoice_number,
        date: new Date().toLocaleDateString(),
        revenue: data.total_amount || totals.revenue, 
        cost: totals.cost,
        profit: (data.total_amount || totals.revenue) - totals.cost
      });

      setIsSidebarOpen(true);
      showToast('Invoice generated successfully! Saved to Database.');
      fetchBillingData();

    } catch (error) {
      console.error("Invoice error:", error);
      showToast(error.message, 'error');
    } finally {
      setIsGeneratingInvoice(false);
      setIsConfirmModalOpen(false);
    }
  };

  const columnMap = [
    { header: 'Project', key: 'projectName' },
    { header: 'Sub-Project', key: 'subProjectName' },
    { header: 'Request Type', key: 'requestType' },
    { header: 'Resource', key: 'resource' },
    { header: 'Role', key: 'role' },
    { header: 'Hours', key: 'hours' },
    { header: 'Productivity', key: 'productivity' },
    { header: 'Cost Rate ($)', key: 'rate' },
    { header: 'Costing ($)', key: 'costing' },
    { header: 'Flat Rate ($)', key: 'flatrate' },
    { header: 'Total Bill ($)', key: 'totalbill' },
    { header: 'Billable', key: 'isBillable' }
  ];

  const sortableKeys = ['projectName', 'subProjectName', 'requestType', 'resource', 'hours', 'rate', 'costing', 'flatrate', 'totalbill'];

  // Build subproject fetch URL based on selected project
  const subprojectFetchUrl = filters.project 
    ? `${apiBaseUrl}/project/${filters.project}/subproject`
    : null;

  return (
    <div className="bg-gray-50 min-h-screen relative overflow-hidden">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-4 right-4 ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white px-6 py-3 rounded-xl shadow-lg z-50 flex items-center space-x-2`}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${isSidebarOpen ? 'mr-96' : ''}`}>
        <PageHeader heading="Costing Dashboard" subHeading="Track billing by Project, Sub-Project, Request Type & Resource" />

        <div className="p-4 space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project</label>
                <select 
                  id="project" 
                  value={filters.project} 
                  onChange={handleFilterChange} 
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Projects</option>
                  {projectsData.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Async Searchable Subproject Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sub-Project</label>
                <AsyncSearchDropdown
                  value={filters.subProject}
                  onChange={handleSubprojectChange}
                  placeholder={!filters.project ? "Select project first" : "Search sub-projects..."}
                  disabled={!filters.project}
                  fetchUrl={subprojectFetchUrl}
                  labelKey="name"
                  valueKey="_id"
                  minSearchLength={0}
                  debounceMs={300}
                />
              </div>

              {/* Request Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Request Type</label>
                <select 
                  id="requestType" 
                  value={filters.requestType} 
                  onChange={handleFilterChange} 
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">All Request Types</option>
                  {REQUEST_TYPES.map(rt => (
                    <option key={rt} value={rt}>{rt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                <select 
                  id="month" 
                  value={filters.month} 
                  onChange={handleFilterChange} 
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-600"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleString('default', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                <select 
                  id="year" 
                  value={filters.year} 
                  onChange={handleFilterChange} 
                  className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-600"
                >
                  <option>2026</option>
                  <option>2025</option>
                  <option>2024</option>
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{resources.length}</span> of{' '}
                <span className="font-medium">{totalRecords}</span> records 
                {totalPages > 1 && ` (Page ${currentPage}/${totalPages})`}
              </div>
              <div className="flex space-x-3">
                <input 
                  type="text" 
                  placeholder="Search resources..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-600 w-48" 
                />
                <button 
                  onClick={() => setShowNonBillable(!showNonBillable)} 
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center space-x-2"
                >
                  <span>{showNonBillable ? '👁️' : '👁️‍🗨️'}</span>
                  <span>{showNonBillable ? 'Hide' : 'Show'} Non-Billable</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-lg flex flex-col" style={{ height: '60vh' }}>
            <div ref={scrollContainerRef} className="overflow-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-white border-b z-10">
                  <tr>
                    {columnMap.map(({ header, key }) => {
                      const isSortable = sortableKeys.includes(key);
                      return (
                        <th 
                          key={key} 
                          onClick={() => isSortable && requestSort(key)} 
                          className={`text-left py-4 px-3 font-semibold text-gray-700 text-sm ${isSortable ? 'cursor-pointer hover:text-blue-600' : ''}`}
                        >
                          {header}
                          {isSortable && (
                            <span className="ml-1 text-xs">
                              {sortConfig.key === key ? (sortConfig.direction === 'ascending' ? '↑' : '↓') : '↕'}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {resources.map(res => (
                    <tr 
                      key={res.uniqueId} 
                      className={`border-b transition-colors ${
                        res.isBillable ? 'hover:bg-green-50' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <td className="py-3 px-3 text-sm">{res.projectName}</td>
                      <td className="py-3 px-3 text-sm">{res.subProjectName}</td>
                      {/* Request Type Column */}
                      <td className="py-3 px-3">
                        <RequestTypeBadge type={res.requestType} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <img 
                            src={res.avatar_url || 'https://via.placeholder.com/32'} 
                            alt={res.name} 
                            className="w-8 h-8 rounded-full" 
                          />
                          <span className="font-medium text-sm">{res.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">{res.role}</td>
                      <td className="py-3 px-3">
                        <input 
                          type="number" 
                          min={0} 
                          value={res.hours} 
                          onChange={(e) => handleResourceChange(res.uniqueId, 'hours', e.target.value)} 
                          disabled={!res.isEditable} 
                          className="w-20 px-2 py-1 border rounded text-sm disabled:bg-gray-200 focus:ring-2 focus:ring-blue-500" 
                        />
                      </td>
                      <td className="py-3 px-3">
                        <select 
                          value={res.productivity} 
                          onChange={(e) => handleResourceChange(res.uniqueId, 'productivity', e.target.value)} 
                          disabled={!res.isEditable} 
                          className="px-2 py-1 border rounded text-sm disabled:bg-gray-200 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Best">Best</option>
                        </select>
                      </td>
                      <td className="py-3 px-3 font-semibold text-red-600 text-sm">
                        {formatCurrency(res.rate)}
                      </td>
                      <td className="py-3 px-3 font-bold text-red-700 text-sm">
                        {formatCurrency(res.costing)}
                      </td>
                      <td className="py-3 px-3 font-semibold text-blue-600 text-sm">
                        {formatCurrency(res.flatrate)}
                      </td>
                      <td className="py-3 px-3 font-bold text-blue-700 text-sm">
                        {formatCurrency(res.totalBill)}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleToggleBillable(res.uniqueId)}
                          disabled={!res.isEditable}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer disabled:cursor-not-allowed ${
                            res.isBillable 
                              ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                          title={res.isEditable ? 'Click to toggle billable status' : 'Not editable'}
                        >
                          {res.isBillable ? '✅ Billable' : '🚫 Non-Billable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {isLoading && (
                    <tr>
                      <td colSpan={columnMap.length} className="py-4">
                        <Loader message="Loading more records..." />
                      </td>
                    </tr>
                  )}
                  
                  {!isLoading && resources.length === 0 && (
                    <tr>
                      <td colSpan={columnMap.length} className="text-center py-10">
                        <div className="text-gray-500">
                          <div className="text-4xl mb-3">📁</div>
                          <h3 className="text-lg font-semibold">No Records Found</h3>
                          <p className="text-sm mt-1">Try adjusting your filters or search term</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer with Totals */}
            <div className="border-t p-4 bg-gray-50">
              <div className="flex justify-between items-center">
                <div className="flex space-x-8">
                  <div className="text-center">
                    <div className="flex items-center space-x-1 mb-1">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <div className="text-xs text-blue-600 font-medium">Revenue</div>
                    </div>
                    <div className="text-xl font-bold text-blue-700">{formatCurrency(totals.revenue)}</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 mb-1">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="text-xs text-red-600 font-medium">Cost</div>
                    </div>
                    <div className="text-xl font-bold text-red-700">{formatCurrency(totals.cost)}</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center space-x-1 mb-1">
                      <div className={`w-3 h-3 ${totals.profit >= 0 ? 'bg-green-500' : 'bg-orange-500'} rounded-full`}></div>
                      <div className={`text-xs ${totals.profit >= 0 ? 'text-green-600' : 'text-orange-600'} font-medium`}>
                        Profit/Loss
                      </div>
                    </div>
                    <div className={`text-xl font-bold ${totals.profit >= 0 ? 'text-green-700' : 'text-orange-700'}`}>
                      {formatCurrency(totals.profit)}
                    </div>
                  </div>
                </div>
                <button 
                  className="bg-green-500 text-white px-6 py-3 rounded-xl hover:bg-green-600 shadow-lg transition-all flex items-center space-x-2"
                  onClick={handleGenerateClick}
                >
                  <span>📄</span>
                  <span>Generate Invoice</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Sidebar */}
      <div className={`fixed right-0 top-0 h-full w-96 bg-white shadow-2xl transform ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 z-40`}>
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-xl font-bold text-gray-800">Invoice Summary</h3>
          <button onClick={() => setIsSidebarOpen(false)} className="text-gray-500 hover:text-red-500 text-xl">
            ✕
          </button>
        </div>
        
        {invoiceInfo ? (
          <div className="p-6 space-y-6">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <div className="text-sm text-blue-600 font-semibold uppercase tracking-wider">Invoice Generated</div>
              <div className="text-2xl font-bold text-blue-900 mt-1">{invoiceInfo.id}</div>
              <div className="text-sm text-blue-700 mt-1">{invoiceInfo.date}</div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Total Billable Revenue</span>
                <span className="font-bold text-gray-900">{formatCurrency(invoiceInfo.revenue)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-gray-600">Internal Cost</span>
                <span className="font-bold text-red-600">{formatCurrency(invoiceInfo.cost)}</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-green-50 px-3 rounded-lg">
                <span className="text-green-800 font-bold">Net Profit</span>
                <span className="font-bold text-green-700">{formatCurrency(invoiceInfo.profit)}</span>
              </div>
            </div>

            <div className="pt-4 text-center">
              <p className="text-sm text-gray-500 italic">
                Invoice successfully saved to database.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500">
            <p>No invoice generated yet.</p>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Confirm Invoice Generation</h2>
            {isGeneratingInvoice ? (
              <Loader message="Processing invoice..." />
            ) : (
              <>
                <p className="text-gray-600 mb-6">
                  Generate invoice for{' '}
                  <span className="font-bold text-blue-600">
                    {new Date(0, filters.month - 1).toLocaleString('default', { month: 'long' })} {filters.year}
                  </span>
                  {filters.requestType && (
                    <span className="block mt-1">
                      Request Type: <span className="font-bold">{filters.requestType}</span>
                    </span>
                  )}
                  <br/>This will create a permanent record in the database.
                </p>
                <div className="flex justify-center gap-4">
                  <button 
                    onClick={() => setIsConfirmModalOpen(false)} 
                    className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmInvoice} 
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-md"
                  >
                    Confirm & Generate
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Costing;