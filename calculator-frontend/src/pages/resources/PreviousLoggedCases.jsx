// src/pages/resources/PreviousLoggedCases.jsx
// View and edit previously logged cases
// Features: Summary view with Processing/Logging breakdown, Date-wise breakdown view
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Dropdown Options
const MRO_REQUEST_TYPES = ['', 'New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'];
const MRO_REQUESTOR_TYPES = ['', 'NRS-NO Records', 'Manual', 'Other Processing (Canceled/Released By Other)', 'Processed', 'Processed through File Drop'];
const VERISMA_REQUEST_TYPES = ['', 'New Request', 'Duplicate', 'Key'];
const VERISMA_REQUESTOR_TYPES = ['', 'Disability', 'Government', 'In Payment', 'Insurance', 'Legal', 'Other billable', 'Other', 'Non-Billable', 'Patient', 'Post payment', 'Provider', 'Service'];
const DATAVANT_REQUEST_TYPES = ['', 'New Request', 'Follow up', 'Duplicate'];
const DATAVANT_TASK_TYPES = ['', 'Processing', 'Review', 'QA', 'Other'];

const ALL_CLIENTS = ['MRO', 'Verisma', 'Datavant'];
const CLIENT_ENDPOINTS = {
  mro: 'mro-daily-allocation',
  verisma: 'verisma-daily-allocations',
  datavant: 'datavant-daily-allocations'
};

const PreviousLoggedCases = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [resourceInfo, setResourceInfo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);

  // View mode: 'summary' or 'datewise'
  const [viewMode, setViewMode] = useState('summary');

  // Dashboard state
  const [dashboardStats, setDashboardStats] = useState({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [dashFilters, setDashFilters] = useState({
    client: '',
    from_date: '',
    to_date: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    filter_mode: 'month'
  });

  // Date-wise breakdown data
  const [dateWiseData, setDateWiseData] = useState({ byDate: {}, totals: { mro: 0, verisma: 0, datavant: 0 } });
  const [loadingDateWise, setLoadingDateWise] = useState(false);

  // Filter state for cases table
  const [filters, setFilters] = useState({
    client: searchParams.get('client') || '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    process_type: '',
    location_id: '',
    request_id: '',
    request_type: ''
  });

  // Data state
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [changeReason, setChangeReason] = useState('');
  const [changeNotes, setChangeNotes] = useState('');

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Auth check on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    if (!token || userType !== 'resource') {
      navigate('/resource-login');
      return;
    }
    const storedInfo = localStorage.getItem('resourceInfo');
    if (storedInfo) {
      setResourceInfo(JSON.parse(storedInfo));
    }
    fetchAssignments();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/resource/me/locations`, getAuthHeaders());
      setAssignments(response.data || []);
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Unique clients from assignments
  const assignedClients = useMemo(() => {
    const clientMap = new Map();
    assignments.forEach(a => {
      if (a.client_id && !clientMap.has(a.client_id)) {
        clientMap.set(a.client_id, { id: a.client_id, name: a.client_name });
      }
    });
    return Array.from(clientMap.values());
  }, [assignments]);

  const getClientNameById = (id) => {
    const client = assignedClients.find(c => c.id === id);
    return client?.name?.toLowerCase() || '';
  };

  const getProcessTypesForClient = (clientId) => {
    if (!clientId) return [];
    const processSet = new Set();
    assignments.filter(a => a.client_id === clientId).forEach(a => {
      if (a.project_name) processSet.add(a.project_name);
    });
    return Array.from(processSet);
  };

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD STATS - with Processing/Logging breakdown
  // ═══════════════════════════════════════════════════════════

  const fetchDashboardStats = useCallback(async () => {
    setLoadingStats(true);
    const stats = {};

    const clientsToFetch = dashFilters.client
      ? [dashFilters.client.toLowerCase()]
      : ALL_CLIENTS.map(c => c.toLowerCase());

    for (const clientKey of clientsToFetch) {
      const endpoint = CLIENT_ENDPOINTS[clientKey];
      if (!endpoint) {
        stats[clientKey] = {
          client: clientKey.charAt(0).toUpperCase() + clientKey.slice(1),
          total_cases: 0,
          by_process_type: [],
          pending_delete_requests: 0
        };
        continue;
      }

      try {
        const params = {};
        if (dashFilters.filter_mode === 'date_range' && dashFilters.from_date) {
          params.from_date = dashFilters.from_date;
          if (dashFilters.to_date) params.to_date = dashFilters.to_date;
        } else {
          params.month = dashFilters.month;
          params.year = dashFilters.year;
        }

        const response = await axios.get(`${API_URL}/${endpoint}/my-stats`, {
          ...getAuthHeaders(),
          params
        });

        if (response.data.success) {
          stats[clientKey] = {
            ...response.data,
            by_process_type: response.data.by_process_type || []
          };
        } else {
          stats[clientKey] = {
            client: clientKey.charAt(0).toUpperCase() + clientKey.slice(1),
            total_cases: 0,
            by_process_type: [],
            pending_delete_requests: 0
          };
        }
      } catch (err) {
        stats[clientKey] = {
          client: clientKey.charAt(0).toUpperCase() + clientKey.slice(1),
          total_cases: 0,
          by_process_type: [],
          pending_delete_requests: 0
        };
      }
    }

    // Ensure ALL clients are present
    ALL_CLIENTS.forEach(c => {
      const key = c.toLowerCase();
      if (!stats[key]) {
        stats[key] = {
          client: c,
          total_cases: 0,
          by_process_type: [],
          pending_delete_requests: 0
        };
      }
    });

    setDashboardStats(stats);
    setLoadingStats(false);
  }, [dashFilters]);

  useEffect(() => {
    if (!loading) {
      fetchDashboardStats();
    }
  }, [loading, fetchDashboardStats]);

  // ═══════════════════════════════════════════════════════════
  // DATE-WISE BREAKDOWN
  // ═══════════════════════════════════════════════════════════

  const fetchDateWiseData = useCallback(async () => {
    setLoadingDateWise(true);

    try {
      let params = '';
      if (dashFilters.filter_mode === 'date_range' && dashFilters.from_date) {
        params = `from_date=${dashFilters.from_date}`;
        if (dashFilters.to_date) params += `&to_date=${dashFilters.to_date}`;
      } else {
        params = `month=${dashFilters.month}&year=${dashFilters.year}`;
      }
      params += '&limit=1000';

      // Fetch all clients in parallel
      const [mroRes, verismaRes, datavantRes] = await Promise.allSettled([
        axios.get(`${API_URL}/mro-daily-allocation/previous-cases?${params}`, getAuthHeaders()),
        axios.get(`${API_URL}/verisma-daily-allocations/previous-cases?${params}`, getAuthHeaders()),
        axios.get(`${API_URL}/datavant-daily-allocations/previous-cases?${params}`, getAuthHeaders())
      ]);

      const mroData = mroRes.status === 'fulfilled' ? mroRes.value.data.allocations || [] : [];
      const verismaData = verismaRes.status === 'fulfilled' ? verismaRes.value.data.allocations || [] : [];
      const datavantData = datavantRes.status === 'fulfilled' ? datavantRes.value.data.allocations || [] : [];

      // Aggregate by date (using local date, not UTC)
      const dateMap = {};

      const addToMap = (data, clientKey) => {
        data.forEach(item => {
          // Parse allocation_date and format as local date
          const d = new Date(item.allocation_date);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          
          const count = item.count || 1;
          if (!dateMap[dateStr]) {
            dateMap[dateStr] = { mro: 0, verisma: 0, datavant: 0 };
          }
          dateMap[dateStr][clientKey] += count;
        });
      };

      addToMap(mroData, 'mro');
      addToMap(verismaData, 'verisma');
      addToMap(datavantData, 'datavant');

      // Calculate totals
      const totals = { mro: 0, verisma: 0, datavant: 0 };
      Object.values(dateMap).forEach(d => {
        totals.mro += d.mro;
        totals.verisma += d.verisma;
        totals.datavant += d.datavant;
      });

      setDateWiseData({ byDate: dateMap, totals });
    } catch (error) {
      console.error('Error fetching date-wise data:', error);
      setDateWiseData({ byDate: {}, totals: { mro: 0, verisma: 0, datavant: 0 } });
    } finally {
      setLoadingDateWise(false);
    }
  }, [dashFilters]);

  // Fetch date-wise data when view mode changes
  useEffect(() => {
    if (viewMode === 'datewise') {
      fetchDateWiseData();
    }
  }, [viewMode, fetchDateWiseData]);

  // Generate all dates in range (EST timezone)
  const allDatesInRange = useMemo(() => {
    const dates = [];
    
    // Helper to format date as YYYY-MM-DD in local time (not UTC)
    const formatLocalDate = (year, month, day) => {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    };
    
    if (dashFilters.filter_mode === 'date_range' && dashFilters.from_date && dashFilters.to_date) {
      // Parse dates as local dates
      const [fromYear, fromMonth, fromDay] = dashFilters.from_date.split('-').map(Number);
      const [toYear, toMonth, toDay] = dashFilters.to_date.split('-').map(Number);
      
      const startDate = new Date(fromYear, fromMonth - 1, fromDay);
      const endDate = new Date(toYear, toMonth - 1, toDay);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(formatLocalDate(d.getFullYear(), d.getMonth() + 1, d.getDate()));
      }
    } else {
      // Generate dates for selected month (1st to last day)
      const year = dashFilters.year;
      const month = dashFilters.month;
      const daysInMonth = new Date(year, month, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        dates.push(formatLocalDate(year, month, day));
      }
    }
    return dates;
  }, [dashFilters]);

  // Grand total calculations
  const grandTotal = useMemo(() => {
    return Object.values(dashboardStats).reduce((sum, s) => {
      return sum + (s.total_cases || s.total_entries || 0);
    }, 0);
  }, [dashboardStats]);

  const totalPendingDeletes = useMemo(() => {
    return Object.values(dashboardStats).reduce((sum, s) => {
      return sum + (s.pending_delete_requests || 0);
    }, 0);
  }, [dashboardStats]);

  // ═══════════════════════════════════════════════════════════
  // CASES TABLE LOGIC
  // ═══════════════════════════════════════════════════════════

  const processTypes = useMemo(() => {
    return filters.client ? getProcessTypesForClient(filters.client) : [];
  }, [assignments, filters.client]);

  const locations = useMemo(() => {
    if (!filters.client) return [];
    let filtered = assignments.filter(a => a.client_id === filters.client);
    if (filters.process_type) {
      filtered = filtered.filter(a => a.project_name === filters.process_type);
    }
    const locs = [];
    filtered.forEach(a => {
      a.subprojects?.forEach(sp => {
        locs.push({ id: sp.subproject_id, name: sp.subproject_name });
      });
    });
    return locs;
  }, [assignments, filters.client, filters.process_type]);

  const currentClientName = useMemo(() => {
    return getClientNameById(filters.client);
  }, [assignedClients, filters.client]);

  const getRequestTypes = () => {
    if (currentClientName === 'mro') return MRO_REQUEST_TYPES;
    if (currentClientName === 'verisma') return VERISMA_REQUEST_TYPES;
    if (currentClientName === 'datavant') return DATAVANT_REQUEST_TYPES;
    return [];
  };

  const getRequestorTypes = () => {
    if (currentClientName === 'mro') return MRO_REQUESTOR_TYPES;
    if (currentClientName === 'verisma') return VERISMA_REQUESTOR_TYPES;
    return [];
  };

  const fetchCases = async (page = 1) => {
    if (!filters.client) return;
    setLoadingCases(true);
    try {
      const endpoint = CLIENT_ENDPOINTS[currentClientName];
      if (!endpoint) return;

      const params = {
        month: filters.month,
        year: filters.year,
        page,
        limit: 50
      };
      if (filters.process_type) params.process_type = filters.process_type;
      if (filters.location_id) params.subproject_id = filters.location_id;
      if (filters.request_id) params.request_id = filters.request_id;
      if (filters.request_type) params.request_type = filters.request_type;

      const response = await axios.get(`${API_URL}/${endpoint}/previous-cases`, {
        ...getAuthHeaders(),
        params
      });

      setCases(response.data.allocations || []);
      setPagination({
        page: response.data.page || 1,
        pages: response.data.pages || 1,
        total: response.data.total || 0
      });
    } catch (err) {
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    if (filters.client) {
      fetchCases(1);
    }
  }, [filters.client, filters.month, filters.year, filters.process_type, filters.location_id, filters.request_type]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => {
      const newFilters = { ...prev, [field]: value };
      if (field === 'client') {
        newFilters.process_type = '';
        newFilters.location_id = '';
      }
      if (field === 'process_type') {
        newFilters.location_id = '';
      }
      return newFilters;
    });
  };

  const handleSearch = () => fetchCases(1);

  const handleClearFilters = () => {
    setFilters({
      client: filters.client,
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      process_type: '',
      location_id: '',
      request_id: '',
      request_type: ''
    });
  };

  // Edit functions
  const startEdit = (c) => {
    setEditingId(c._id);
    setEditData({
      facility_name: c.facility_name || '',
      request_id: c.request_id || '',
      request_type: c.request_type || '',
      requestor_type: c.requestor_type || '',
      task_type: c.task_type || '',
      count: c.count || 1,
      remark: c.remark || ''
    });
    setChangeReason('');
    setChangeNotes('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
    setChangeReason('');
    setChangeNotes('');
  };

  const saveEdit = async () => {
    if (!changeReason.trim()) {
      toast.error('Please enter a change reason');
      return;
    }
    try {
      const endpoint = CLIENT_ENDPOINTS[currentClientName];
      await axios.put(
        `${API_URL}/${endpoint}/${editingId}`,
        { ...editData, change_reason: changeReason, change_notes: changeNotes },
        getAuthHeaders()
      );
      cancelEdit();
      fetchCases(pagination.page);
      toast.success('Entry updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update entry');
    }
  };

  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      toast.error('Please enter a delete reason');
      return;
    }
    try {
      const endpoint = CLIENT_ENDPOINTS[currentClientName];
      await axios.post(
        `${API_URL}/${endpoint}/${showDeleteModal}/request-delete`,
        { delete_reason: deleteReason },
        getAuthHeaders()
      );
      setShowDeleteModal(null);
      setDeleteReason('');
      fetchCases(pagination.page);
      fetchDashboardStats();
      toast.success('Delete request submitted for admin approval');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit delete request');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceInfo');
    navigate('/resource-login');
  };

  // Utility functions
  const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: '2-digit'
    });
  };

  const formatDateShort = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const clientBadge = (key) => {
    const map = {
      mro: 'bg-blue-100 text-blue-700',
      verisma: 'bg-emerald-100 text-emerald-700',
      datavant: 'bg-purple-100 text-purple-700'
    };
    return map[key] || 'bg-gray-100 text-gray-700';
  };

  const getFilterLabel = () => {
    if (dashFilters.filter_mode === 'date_range' && dashFilters.from_date) {
      const from = new Date(dashFilters.from_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const to = dashFilters.to_date
        ? new Date(dashFilters.to_date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        : 'Today';
      return `${from} — ${to}`;
    }
    return `${months.find(m => m.value === dashFilters.month)?.label} ${dashFilters.year}`;
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/resource-dashboard')}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-base font-semibold text-gray-800">Previous Logged Cases</h1>
              <p className="text-xs text-gray-500">Dashboard & past entries</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
              <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* ══════════════════════════════════════════════════════ */}
        {/* DASHBOARD SECTION                                     */}
        {/* ══════════════════════════════════════════════════════ */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {/* Header bar with filters */}
          <div className="px-3 py-2 bg-gray-800 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-white text-xs font-semibold whitespace-nowrap">Cases Summary</span>

              {/* View Mode Toggle */}
              <div className="flex bg-gray-700 rounded overflow-hidden">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`px-2 py-1 text-[10px] font-medium transition ${
                    viewMode === 'summary' ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setViewMode('datewise')}
                  className={`px-2 py-1 text-[10px] font-medium transition ${
                    viewMode === 'datewise' ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  📅 Date-wise
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Client filter */}
              <select
                value={dashFilters.client}
                onChange={(e) => setDashFilters(p => ({ ...p, client: e.target.value }))}
                className="px-1.5 py-1 text-[11px] bg-gray-700 text-white border border-gray-600 rounded focus:outline-none"
              >
                <option value="">All Clients</option>
                {ALL_CLIENTS.map(c => (
                  <option key={c} value={c.toLowerCase()}>{c}</option>
                ))}
              </select>

              {/* Filter mode toggle */}
              <div className="flex bg-gray-700 rounded border border-gray-600 overflow-hidden">
                <button
                  onClick={() => setDashFilters(p => ({ ...p, filter_mode: 'month' }))}
                  className={`px-2 py-1 text-[10px] font-medium transition ${
                    dashFilters.filter_mode === 'month' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Month
                </button>
                <button
                  onClick={() => setDashFilters(p => ({ ...p, filter_mode: 'date_range' }))}
                  className={`px-2 py-1 text-[10px] font-medium transition ${
                    dashFilters.filter_mode === 'date_range' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Date Range
                </button>
              </div>

              {/* Month/Year or Date Range inputs */}
              {dashFilters.filter_mode === 'month' ? (
                <>
                  <select
                    value={dashFilters.month}
                    onChange={(e) => setDashFilters(p => ({ ...p, month: parseInt(e.target.value) }))}
                    className="px-1.5 py-1 text-[11px] bg-gray-700 text-white border border-gray-600 rounded focus:outline-none"
                  >
                    {months.map(m => (
                      <option key={m.value} value={m.value}>{m.label.slice(0, 3)}</option>
                    ))}
                  </select>
                  <select
                    value={dashFilters.year}
                    onChange={(e) => setDashFilters(p => ({ ...p, year: parseInt(e.target.value) }))}
                    className="px-1.5 py-1 text-[11px] bg-gray-700 text-white border border-gray-600 rounded focus:outline-none"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400">From:</span>
                    <input
                      type="date"
                      value={dashFilters.from_date}
                      onChange={(e) => setDashFilters(p => ({ ...p, from_date: e.target.value }))}
                      className="px-1.5 py-0.5 text-[11px] bg-gray-700 text-white border border-gray-600 rounded focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400">To:</span>
                    <input
                      type="date"
                      value={dashFilters.to_date}
                      onChange={(e) => setDashFilters(p => ({ ...p, to_date: e.target.value }))}
                      className="px-1.5 py-0.5 text-[11px] bg-gray-700 text-white border border-gray-600 rounded focus:outline-none"
                    />
                  </div>
                </>
              )}

              {(loadingStats || loadingDateWise) && (
                <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full"></div>
              )}
            </div>
          </div>

          {/* Summary strip */}
          <div className="px-3 py-1.5 bg-gray-50 border-b flex items-center gap-4 text-[11px]">
            <span className="font-semibold text-gray-700">
              Grand Total: <span className="text-gray-900 text-xs font-bold">{grandTotal.toLocaleString()}</span> cases
            </span>
            {totalPendingDeletes > 0 && (
              <span className="text-red-600 font-medium flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                {totalPendingDeletes} pending delete{totalPendingDeletes > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-gray-400 ml-auto">{getFilterLabel()}</span>
          </div>

          {/* ══════════════════════════════════════════════════════ */}
          {/* SUMMARY VIEW                                          */}
          {/* ══════════════════════════════════════════════════════ */}
          {viewMode === 'summary' && (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="px-3 py-1.5 text-left font-semibold">Client</th>
                  <th className="px-3 py-1.5 text-center font-semibold">Total Cases</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Processing / Logging</th>
                  <th className="px-3 py-1.5 text-center font-semibold w-20">Del. Req.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ALL_CLIENTS.map(clientName => {
                  const clientKey = clientName.toLowerCase();
                  if (dashFilters.client && dashFilters.client !== clientKey) return null;

                  const stats = dashboardStats[clientKey];
                  const totalCases = stats?.total_cases || stats?.total_entries || 0;
                  const pendingDel = stats?.pending_delete_requests || 0;
                  const byProcessType = stats?.by_process_type || [];

                  return (
                    <tr key={clientKey} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${clientBadge(clientKey)}`}>
                          {clientName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-sm font-bold ${totalCases > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                          {totalCases.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {byProcessType.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {byProcessType.map((pt, i) => (
                              <span
                                key={i}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  pt._id?.toLowerCase().includes('processing')
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {pt._id}: {(pt.count || pt.entries || 0).toLocaleString()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-[10px]">No data</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {pendingDel > 0 ? (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            {pendingDel}
                          </span>
                        ) : (
                          <span className="text-gray-300">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr className="bg-gray-800 text-white">
                  <td className="px-3 py-2 text-[10px] font-semibold uppercase">Total</td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-sm font-bold">{grandTotal.toLocaleString()}</span>
                  </td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-center">
                    {totalPendingDeletes > 0 ? (
                      <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-semibold">
                        {totalPendingDeletes}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* DATE-WISE VIEW                                        */}
          {/* ══════════════════════════════════════════════════════ */}
          {viewMode === 'datewise' && (
            <>
              {loadingDateWise ? (
                <div className="px-3 py-8 text-center">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-[11px] text-gray-400 mt-2">Loading date-wise data...</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      {/* Totals Header Row */}
                      <tr className="bg-gray-800 text-white">
                        <th className="px-3 py-2 text-left font-bold border-r border-gray-700">Total Cases Logged</th>
                        <th className="px-3 py-2 text-center font-bold border-r border-gray-700">
                          {(dateWiseData.totals?.verisma || 0) + (dateWiseData.totals?.mro || 0) + (dateWiseData.totals?.datavant || 0)}
                        </th>
                        <th className="px-3 py-2 text-center font-bold border-r border-gray-700 text-emerald-400">
                          {dateWiseData.totals?.verisma || 0}
                        </th>
                        <th className="px-3 py-2 text-center font-bold border-r border-gray-700 text-blue-400">
                          {dateWiseData.totals?.mro || 0}
                        </th>
                        <th className="px-3 py-2 text-center font-bold text-purple-400">
                          {dateWiseData.totals?.datavant || 0}
                        </th>
                      </tr>
                      {/* Column Headers */}
                      <tr className="bg-gray-100 text-gray-700">
                        <th className="px-3 py-1.5 text-left font-semibold border-r">Date</th>
                        <th className="px-3 py-1.5 text-center font-semibold border-r">Grand Total</th>
                        <th className="px-3 py-1.5 text-center font-semibold border-r">
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Verisma</span>
                        </th>
                        <th className="px-3 py-1.5 text-center font-semibold border-r">
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">MRO</span>
                        </th>
                        <th className="px-3 py-1.5 text-center font-semibold">
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Datavant</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {allDatesInRange.map((dateStr, idx) => {
                        const dayData = dateWiseData.byDate?.[dateStr] || { mro: 0, verisma: 0, datavant: 0 };
                        const dayTotal = dayData.verisma + dayData.mro + dayData.datavant;
                        const hasData = dayTotal > 0;

                        return (
                          <tr
                            key={dateStr}
                            className={`${hasData ? (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50') : 'bg-gray-50/50'} hover:bg-blue-50/50 transition`}
                          >
                            <td className="px-3 py-1.5 font-medium text-gray-700 border-r whitespace-nowrap">
                              {formatDateShort(dateStr)}
                            </td>
                            <td className={`px-3 py-1.5 text-center font-bold border-r ${dayTotal > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                              {dayTotal || 0}
                            </td>
                            <td className={`px-3 py-1.5 text-center border-r ${dayData.verisma > 0 ? 'text-emerald-700 font-medium' : 'text-gray-300'}`}>
                              {dayData.verisma || ''}
                            </td>
                            <td className={`px-3 py-1.5 text-center border-r ${dayData.mro > 0 ? 'text-blue-700 font-medium' : 'text-gray-300'}`}>
                              {dayData.mro || ''}
                            </td>
                            <td className={`px-3 py-1.5 text-center ${dayData.datavant > 0 ? 'text-purple-700 font-medium' : 'text-gray-300'}`}>
                              {dayData.datavant || ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Footer Totals */}
                    <tfoot>
                      <tr className="bg-gray-800 text-white font-bold">
                        <td className="px-3 py-2 border-r border-gray-700">TOTAL</td>
                        <td className="px-3 py-2 text-center border-r border-gray-700">
                          {(dateWiseData.totals?.verisma || 0) + (dateWiseData.totals?.mro || 0) + (dateWiseData.totals?.datavant || 0)}
                        </td>
                        <td className="px-3 py-2 text-center border-r border-gray-700 text-emerald-400">
                          {dateWiseData.totals?.verisma || 0}
                        </td>
                        <td className="px-3 py-2 text-center border-r border-gray-700 text-blue-400">
                          {dateWiseData.totals?.mro || 0}
                        </td>
                        <td className="px-3 py-2 text-center text-purple-400">
                          {dateWiseData.totals?.datavant || 0}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════ */}
        {/* FILTERS SECTION                               */}
        {/* ══════════════════════════════════════════════ */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={filters.client}
                onChange={(e) => handleFilterChange('client', e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Select Client --</option>
                {assignedClients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
              <select
                value={filters.month}
                onChange={(e) => handleFilterChange('month', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select
                value={filters.year}
                onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label>
              <select
                value={filters.process_type}
                onChange={(e) => handleFilterChange('process_type', e.target.value)}
                disabled={!filters.client}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">All Processes</option>
                {processTypes.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <select
                value={filters.location_id}
                onChange={(e) => handleFilterChange('location_id', e.target.value)}
                disabled={!filters.client}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">All Locations</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request ID</label>
              <input
                type="text"
                value={filters.request_id}
                onChange={(e) => handleFilterChange('request_id', e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Search ID..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request Type</label>
              <select
                value={filters.request_type}
                onChange={(e) => handleFilterChange('request_type', e.target.value)}
                disabled={!filters.client}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              >
                <option value="">All Types</option>
                {getRequestTypes().filter(t => t).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSearch}
              disabled={!filters.client}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Search
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Results Info */}
        {filters.client && (
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              Showing <strong>{cases.length}</strong> of <strong>{pagination.total}</strong> entries for{' '}
              {months.find(m => m.value === filters.month)?.label} {filters.year}
            </span>
            <span className="text-orange-600">Only entries logged before today</span>
          </div>
        )}

        {/* ══════════════════════════════════════════════ */}
        {/* CASES TABLE                                   */}
        {/* ══════════════════════════════════════════════ */}
        {filters.client && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-2 bg-gray-700 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold">Previous Logged Cases</h3>
              <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{pagination.total} total</span>
            </div>

            {loadingCases ? (
              <div className="p-8 text-center text-gray-500">Loading cases...</div>
            ) : cases.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No cases found for the selected filters</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold border-r">SR#</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Alloc. Date</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Logged Date</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Process</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                      {currentClientName === 'mro' && (
                        <th className="px-2 py-2 text-left font-semibold border-r">Facility</th>
                      )}
                      <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                      {(currentClientName === 'mro' || currentClientName === 'verisma') && (
                        <th className="px-2 py-2 text-left font-semibold border-r">Requestor Type</th>
                      )}
                      {currentClientName === 'datavant' && (
                        <th className="px-2 py-2 text-left font-semibold border-r">Task Type</th>
                      )}
                      {(currentClientName === 'verisma' || currentClientName === 'datavant') && (
                        <th className="px-2 py-2 text-center font-semibold border-r">Count</th>
                      )}
                      <th className="px-2 py-2 text-center font-semibold border-r">Late</th>
                      <th className="px-2 py-2 text-center font-semibold border-r">Edits</th>
                      <th className="px-2 py-2 text-center font-semibold w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cases.map((caseItem, idx) => {
                      const isEditing = editingId === caseItem._id;
                      const isLocked = caseItem.is_locked;

                      return (
                        <React.Fragment key={caseItem._id}>
                          <tr
                            className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''} ${isLocked ? 'opacity-60' : ''}`}
                          >
                            <td className="px-2 py-1.5 font-medium border-r">{caseItem.sr_no}</td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.allocation_date)}</td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.logged_date)}</td>
                            <td className="px-2 py-1.5 border-r">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  caseItem.process_type === 'Processing'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {caseItem.process_type || caseItem.project_name}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 border-r font-medium">{caseItem.subproject_name}</td>
                            {currentClientName === 'mro' && (
                              <td className="px-1 py-1 border-r">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editData.facility_name || ''}
                                    onChange={(e) => setEditData(p => ({ ...p, facility_name: e.target.value }))}
                                    className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                  />
                                ) : (
                                  caseItem.facility_name || '-'
                                )}
                              </td>
                            )}
                            <td className="px-1 py-1 border-r">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editData.request_id || ''}
                                  onChange={(e) => setEditData(p => ({ ...p, request_id: e.target.value }))}
                                  className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                />
                              ) : (
                                caseItem.request_id || '-'
                              )}
                            </td>
                            <td className="px-1 py-1 border-r">
                              {isEditing ? (
                                <select
                                  value={editData.request_type || ''}
                                  onChange={(e) => setEditData(p => ({ ...p, request_type: e.target.value }))}
                                  className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                >
                                  {getRequestTypes().map(type => (
                                    <option key={type} value={type}>{type || '--'}</option>
                                  ))}
                                </select>
                              ) : (
                                caseItem.request_type
                              )}
                            </td>
                            {(currentClientName === 'mro' || currentClientName === 'verisma') && (
                              <td className="px-1 py-1 border-r">
                                {currentClientName === 'mro' && caseItem.process_type !== 'Processing' ? (
                                  <span className="text-gray-400">N/A</span>
                                ) : isEditing ? (
                                  <select
                                    value={editData.requestor_type || ''}
                                    onChange={(e) => setEditData(p => ({ ...p, requestor_type: e.target.value }))}
                                    className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                  >
                                    {getRequestorTypes().map(type => (
                                      <option key={type} value={type}>{type || '--'}</option>
                                    ))}
                                  </select>
                                ) : (
                                  caseItem.requestor_type || '-'
                                )}
                              </td>
                            )}
                            {currentClientName === 'datavant' && (
                              <td className="px-1 py-1 border-r">
                                {isEditing ? (
                                  <select
                                    value={editData.task_type || ''}
                                    onChange={(e) => setEditData(p => ({ ...p, task_type: e.target.value }))}
                                    className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                  >
                                    {DATAVANT_TASK_TYPES.map(type => (
                                      <option key={type} value={type}>{type || '--'}</option>
                                    ))}
                                  </select>
                                ) : (
                                  caseItem.task_type || '-'
                                )}
                              </td>
                            )}
                            {(currentClientName === 'verisma' || currentClientName === 'datavant') && (
                              <td className="px-1 py-1 text-center border-r">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="1"
                                    value={editData.count || 1}
                                    onChange={(e) => setEditData(p => ({ ...p, count: parseInt(e.target.value) || 1 }))}
                                    className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded text-center"
                                  />
                                ) : (
                                  <span className="font-medium">{caseItem.count || 1}</span>
                                )}
                              </td>
                            )}
                            <td className="px-2 py-1.5 text-center border-r">
                              {caseItem.is_late_log ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">
                                  +{caseItem.days_late}d
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center border-r">
                              {caseItem.edit_count > 0 ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                                  {caseItem.edit_count}x
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {isLocked ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-500">
                                  Locked
                                </span>
                              ) : isEditing ? (
                                <div className="flex gap-1 justify-center">
                                  <button
                                    onClick={saveEdit}
                                    className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded hover:bg-green-600"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    className="px-1.5 py-0.5 text-[10px] bg-gray-400 text-white rounded hover:bg-gray-500"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1 justify-center">
                                  <button
                                    onClick={() => startEdit(caseItem)}
                                    className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => setShowDeleteModal(caseItem._id)}
                                    disabled={caseItem.has_pending_delete_request}
                                    className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300"
                                  >
                                    {caseItem.has_pending_delete_request ? '⏳' : 'Del'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Edit row for change reason */}
                          {isEditing && (
                            <tr className="bg-yellow-50">
                              <td colSpan={15} className="px-4 py-2">
                                <div className="flex gap-4 items-end">
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-yellow-800 mb-1">
                                      Change Reason <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={changeReason}
                                      onChange={(e) => setChangeReason(e.target.value)}
                                      className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded"
                                      placeholder="Why are you making this change?"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-yellow-800 mb-1">
                                      Change Notes (Optional)
                                    </label>
                                    <input
                                      type="text"
                                      value={changeNotes}
                                      onChange={(e) => setChangeNotes(e.target.value)}
                                      className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded"
                                      placeholder="Additional details"
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <span className="text-xs text-gray-600">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchCases(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => fetchCases(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state when no client selected */}
        {!filters.client && (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <div className="text-gray-400 text-4xl mb-3">📋</div>
            <h3 className="text-sm font-medium text-gray-700">Select a Client to View Cases</h3>
            <p className="text-xs text-gray-500 mt-1">Choose a client from the filters above</p>
          </div>
        )}
      </main>

      {/* Delete Request Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-red-500 text-lg">🗑️</span>
              <h3 className="text-sm font-semibold text-gray-800">Request Deletion</h3>
            </div>
            <p className="text-xs text-gray-600 mb-1">
              Your delete request will be sent to an admin for approval.
            </p>
            <p className="text-xs text-blue-600 mb-3">Admin will be notified via email.</p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-red-400"
              rows={3}
              placeholder="Enter delete reason (required)"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  setShowDeleteModal(null);
                  setDeleteReason('');
                }}
                className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={submitDeleteRequest}
                disabled={!deleteReason.trim()}
                className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviousLoggedCases;