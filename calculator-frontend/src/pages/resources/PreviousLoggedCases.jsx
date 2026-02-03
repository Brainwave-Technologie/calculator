// src/pages/resources/PreviousLoggedCases.jsx
// View and edit previously logged cases (till yesterday - not today)
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// MRO Dropdown Options
const MRO_REQUEST_TYPES = ['', 'New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'];
const MRO_REQUESTOR_TYPES = ['', 'NRS-NO Records', 'Manual', 'Other Processing (Canceled/Released By Other)', 'Processed', 'Processed through File Drop'];

// Verisma Dropdown Options
const VERISMA_REQUEST_TYPES = ['', 'New Request', 'Duplicate', 'Key'];
const VERISMA_REQUESTOR_TYPES = ['', 'Disability', 'Government', 'In Payment', 'Insurance', 'Legal', 'Other billable', 'Other', 'Non-Billable', 'Patient', 'Post payment', 'Provider', 'Service'];

// Datavant Dropdown Options
const DATAVANT_REQUEST_TYPES = ['', 'New Request', 'Follow up', 'Duplicate'];
const DATAVANT_TASK_TYPES = ['', 'Processing', 'Review', 'QA', 'Other'];

const PreviousLoggedCases = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [resourceInfo, setResourceInfo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  
  // Filter state
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
      console.error('Error fetching assignments:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Get unique clients from assignments
  const clients = useMemo(() => {
    const clientMap = new Map();
    assignments.forEach(a => {
      if (a.client_id && !clientMap.has(a.client_id)) {
        clientMap.set(a.client_id, { id: a.client_id, name: a.client_name });
      }
    });
    return Array.from(clientMap.values());
  }, [assignments]);

  // Get process types for selected client
  const processTypes = useMemo(() => {
    if (!filters.client) return [];
    const processSet = new Set();
    assignments
      .filter(a => a.client_id === filters.client)
      .forEach(a => {
        if (a.project_name) processSet.add(a.project_name);
      });
    return Array.from(processSet);
  }, [assignments, filters.client]);

  // Get locations for selected client and process
  const locations = useMemo(() => {
    if (!filters.client) return [];
    let filtered = assignments.filter(a => a.client_id === filters.client);
    if (filters.process_type) {
      filtered = filtered.filter(a => a.project_name === filters.process_type);
    }
    
    const locs = [];
    filtered.forEach(a => {
      a.subprojects?.forEach(sp => {
        locs.push({
          id: sp.subproject_id,
          name: sp.subproject_name,
          project_name: a.project_name
        });
      });
    });
    return locs;
  }, [assignments, filters.client, filters.process_type]);

  // Get current client name
  const currentClientName = useMemo(() => {
    return clients.find(c => c.id === filters.client)?.name?.toLowerCase() || '';
  }, [clients, filters.client]);

  // Get dropdown options based on client
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

  // Fetch previous cases
  const fetchCases = async (page = 1) => {
    if (!filters.client) return;
    
    setLoadingCases(true);
    try {
      let endpoint = '';
      if (currentClientName === 'mro') endpoint = `${API_URL}/mro-daily-allocations/previous-cases`;
      else if (currentClientName === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/previous-cases`;
      else if (currentClientName === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/previous-cases`;
      
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
      
      const response = await axios.get(endpoint, { ...getAuthHeaders(), params });
      
      setCases(response.data.allocations || []);
      setPagination({
        page: response.data.page || 1,
        pages: response.data.pages || 1,
        total: response.data.total || 0
      });
    } catch (error) {
      console.error('Error fetching cases:', error);
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  // Fetch when filters change
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

  const handleSearch = () => {
    fetchCases(1);
  };

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

  // Edit handlers
  const startEdit = (caseItem) => {
    setEditingId(caseItem._id);
    setEditData({
      facility_name: caseItem.facility_name || '',
      request_id: caseItem.request_id || '',
      request_type: caseItem.request_type || '',
      requestor_type: caseItem.requestor_type || '',
      processing_time: caseItem.processing_time || '',
      task_type: caseItem.task_type || '',
      count: caseItem.count || 1,
      remark: caseItem.remark || ''
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
      alert('Please enter a change reason');
      return;
    }
    
    try {
      let endpoint = '';
      if (currentClientName === 'mro') endpoint = `${API_URL}/mro-daily-allocations/${editingId}`;
      else if (currentClientName === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/${editingId}`;
      else if (currentClientName === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/${editingId}`;
      
      await axios.put(endpoint, {
        ...editData,
        change_reason: changeReason,
        change_notes: changeNotes
      }, getAuthHeaders());
      
      cancelEdit();
      fetchCases(pagination.page);
      alert('Entry updated successfully');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update entry');
    }
  };

  // Delete request handler
  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      alert('Please enter a delete reason');
      return;
    }
    
    try {
      let endpoint = '';
      if (currentClientName === 'mro') endpoint = `${API_URL}/mro-daily-allocations/${showDeleteModal}/request-delete`;
      else if (currentClientName === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/${showDeleteModal}/request-delete`;
      else if (currentClientName === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/${showDeleteModal}/request-delete`;
      
      await axios.post(endpoint, { delete_reason: deleteReason }, getAuthHeaders());
      
      setShowDeleteModal(null);
      setDeleteReason('');
      fetchCases(pagination.page);
      alert('Delete request submitted for admin approval');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit delete request');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceInfo');
    navigate('/resource-login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  // Generate month options
  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/resource-dashboard')} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Previous Logged Cases</h1>
                <p className="text-xs text-gray-500">View and edit your past entries (till yesterday)</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
                <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
              </div>
              <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Filters Section */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 Filters</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Client */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client <span className="text-red-500">*</span></label>
              <select value={filters.client} onChange={(e) => handleFilterChange('client', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="">-- Select Client --</option>
                {clients.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            
            {/* Month */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
              <select value={filters.month} onChange={(e) => handleFilterChange('month', parseInt(e.target.value))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {months.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
              </select>
            </div>
            
            {/* Year */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select value={filters.year} onChange={(e) => handleFilterChange('year', parseInt(e.target.value))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                {years.map(y => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
            
            {/* Process Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label>
              <select value={filters.process_type} onChange={(e) => handleFilterChange('process_type', e.target.value)} disabled={!filters.client} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="">All Processes</option>
                {processTypes.map(p => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            
            {/* Location */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <select value={filters.location_id} onChange={(e) => handleFilterChange('location_id', e.target.value)} disabled={!filters.client} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="">All Locations</option>
                {locations.map(l => (<option key={l.id} value={l.id}>{l.name}</option>))}
              </select>
            </div>
            
            {/* Request ID */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request ID</label>
              <input type="text" value={filters.request_id} onChange={(e) => handleFilterChange('request_id', e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" placeholder="Search ID..." />
            </div>
            
            {/* Request Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request Type</label>
              <select value={filters.request_type} onChange={(e) => handleFilterChange('request_type', e.target.value)} disabled={!filters.client} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="">All Types</option>
                {getRequestTypes().filter(t => t).map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mt-3 flex gap-2">
            <button onClick={handleSearch} disabled={!filters.client} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">Search</button>
            <button onClick={handleClearFilters} className="px-4 py-1.5 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Clear Filters</button>
          </div>
        </div>

        {/* Results Info */}
        {filters.client && (
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Showing <strong>{cases.length}</strong> of <strong>{pagination.total}</strong> entries for {months.find(m => m.value === filters.month)?.label} {filters.year}</span>
            <span className="text-orange-600">⚠️ Only showing entries logged before today</span>
          </div>
        )}

        {/* Cases Table */}
        {filters.client && (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-2 bg-gray-700 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold">📋 Previous Logged Cases</h3>
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
                      {currentClientName === 'mro' && <th className="px-2 py-2 text-left font-semibold border-r">Facility</th>}
                      <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                      <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                      {(currentClientName === 'mro' || currentClientName === 'verisma') && <th className="px-2 py-2 text-left font-semibold border-r">Requestor Type</th>}
                      {currentClientName === 'datavant' && <th className="px-2 py-2 text-left font-semibold border-r">Task Type</th>}
                      {(currentClientName === 'verisma' || currentClientName === 'datavant') && <th className="px-2 py-2 text-center font-semibold border-r">Count</th>}
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
                          <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''} ${isLocked ? 'opacity-60' : ''}`}>
                            <td className="px-2 py-1.5 font-medium border-r">{caseItem.sr_no}</td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.allocation_date)}</td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.logged_date)}</td>
                            <td className="px-2 py-1.5 border-r"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${caseItem.process_type === 'Processing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{caseItem.process_type || caseItem.project_name}</span></td>
                            <td className="px-2 py-1.5 border-r font-medium">{caseItem.subproject_name}</td>
                            
                            {/* MRO: Facility */}
                            {currentClientName === 'mro' && (
                              <td className="px-1 py-1 border-r">{isEditing ? <input type="text" value={editData.facility_name || ''} onChange={(e) => setEditData(prev => ({ ...prev, facility_name: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" /> : (caseItem.facility_name || '-')}</td>
                            )}
                            
                            {/* Request ID */}
                            <td className="px-1 py-1 border-r">{isEditing ? <input type="text" value={editData.request_id || ''} onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" /> : (caseItem.request_id || '-')}</td>
                            
                            {/* Request Type */}
                            <td className="px-1 py-1 border-r">{isEditing ? <select value={editData.request_type || ''} onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">{getRequestTypes().map(type => (<option key={type} value={type}>{type || '--'}</option>))}</select> : caseItem.request_type}</td>
                            
                            {/* Requestor Type (MRO/Verisma) */}
                            {(currentClientName === 'mro' || currentClientName === 'verisma') && (
                              <td className="px-1 py-1 border-r">{currentClientName === 'mro' && caseItem.process_type !== 'Processing' ? <span className="text-gray-400">N/A</span> : isEditing ? <select value={editData.requestor_type || ''} onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">{getRequestorTypes().map(type => (<option key={type} value={type}>{type || '--'}</option>))}</select> : (caseItem.requestor_type || '-')}</td>
                            )}
                            
                            {/* Task Type (Datavant) */}
                            {currentClientName === 'datavant' && (
                              <td className="px-1 py-1 border-r">{isEditing ? <select value={editData.task_type || ''} onChange={(e) => setEditData(prev => ({ ...prev, task_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">{DATAVANT_TASK_TYPES.map(type => (<option key={type} value={type}>{type || '--'}</option>))}</select> : (caseItem.task_type || '-')}</td>
                            )}
                            
                            {/* Count (Verisma/Datavant) */}
                            {(currentClientName === 'verisma' || currentClientName === 'datavant') && (
                              <td className="px-1 py-1 text-center border-r">{isEditing ? <input type="number" min="1" value={editData.count || 1} onChange={(e) => setEditData(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded text-center" /> : <span className="font-medium">{caseItem.count || 1}</span>}</td>
                            )}
                            
                            {/* Late Log */}
                            <td className="px-2 py-1.5 text-center border-r">{caseItem.is_late_log ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">+{caseItem.days_late}d</span> : <span className="text-gray-400">-</span>}</td>
                            
                            {/* Edit Count */}
                            <td className="px-2 py-1.5 text-center border-r">{caseItem.edit_count > 0 ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">{caseItem.edit_count}x</span> : <span className="text-gray-400">-</span>}</td>
                            
                            {/* Actions */}
                            <td className="px-2 py-1.5 text-center">
                              {isLocked ? <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-500">Locked</span> : isEditing ? (
                                <div className="flex gap-1 justify-center">
                                  <button onClick={saveEdit} className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded hover:bg-green-600">Save</button>
                                  <button onClick={cancelEdit} className="px-1.5 py-0.5 text-[10px] bg-gray-400 text-white rounded hover:bg-gray-500">Cancel</button>
                                </div>
                              ) : (
                                <div className="flex gap-1 justify-center">
                                  <button onClick={() => startEdit(caseItem)} className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                                  <button onClick={() => setShowDeleteModal(caseItem._id)} disabled={caseItem.has_pending_delete_request} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300">{caseItem.has_pending_delete_request ? '...' : 'Del'}</button>
                                </div>
                              )}
                            </td>
                          </tr>
                          
                          {/* Change Reason Row */}
                          {isEditing && (
                            <tr className="bg-yellow-50">
                              <td colSpan={15} className="px-4 py-2">
                                <div className="flex gap-4 items-end">
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-yellow-800 mb-1">Change Reason <span className="text-red-500">*</span></label>
                                    <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded" placeholder="Why are you making this change?" />
                                  </div>
                                  <div className="flex-1">
                                    <label className="block text-xs font-medium text-yellow-800 mb-1">Change Notes (Optional)</label>
                                    <input type="text" value={changeNotes} onChange={(e) => setChangeNotes(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded" placeholder="Additional details" />
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
                <span className="text-xs text-gray-600">Page {pagination.page} of {pagination.pages}</span>
                <div className="flex gap-2">
                  <button onClick={() => fetchCases(pagination.page - 1)} disabled={pagination.page <= 1} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                  <button onClick={() => fetchCases(pagination.page + 1)} disabled={pagination.page >= pagination.pages} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Client Selected */}
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
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Request Deletion</h3>
            <p className="text-xs text-gray-600 mb-3">Your delete request will be sent to an admin for approval.</p>
            <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="w-full px-3 py-2 text-xs border border-gray-300 rounded" rows={3} placeholder="Enter delete reason (required)" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowDeleteModal(null); setDeleteReason(''); }} className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Cancel</button>
              <button onClick={submitDeleteRequest} disabled={!deleteReason.trim()} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300">Submit Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviousLoggedCases;