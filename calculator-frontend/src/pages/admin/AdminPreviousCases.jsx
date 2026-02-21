// src/pages/admin/AdminPreviousCases.jsx
// Admin view of all previous cases with color-coded rows for status
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// Dropdown Options for each client
const CLIENT_OPTIONS = {
  MRO: {
    request_types: ['New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'],
    requestor_types: ['NRS-NO Records', 'Manual', 'Other Processing (Canceled/Released By Other)', 'Processed', 'Processed through File Drop']
  },
  Verisma: {
    request_types: ['New Request', 'Duplicate', 'Key'],
    requestor_types: ['Disability', 'Government', 'In Payment', 'Insurance', 'Legal', 'Other billable', 'Other', 'Non-Billable', 'Patient', 'Post payment', 'Provider', 'Service']
  },
  Datavant: {
    request_types: ['New Request', 'Follow up', 'Duplicate'],
    task_types: ['Processing', 'Review', 'QA', 'Other']
  }
};

const AdminPreviousCases = () => {
  const navigate = useNavigate();
  const [adminInfo, setAdminInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  
  // Resources list
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    client: 'MRO',
    resource_email: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    process_type: '',
    subproject_key: '',
    request_type: '',
    show_deleted: false,
    show_only_edited: false,
    show_only_late: false,
    show_only_delete_requested: false
  });
  
  // Data
  const [cases, setCases] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [subprojects, setSubprojects] = useState([]);
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    edited: 0,
    late: 0,
    delete_requested: 0,
    deleted: 0
  });
  
  // Edit history modal
  const [showHistoryModal, setShowHistoryModal] = useState(null);
  const [editHistory, setEditHistory] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token || userType !== 'admin') {
      navigate('/login');
      return;
    }
    
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) {
      setAdminInfo(JSON.parse(storedInfo));
    }
    
    setLoading(false);
    fetchResources();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Fetch all resources
  const fetchResources = async () => {
    setLoadingResources(true);
    try {
      const response = await axios.get(`${API_URL}/resource`, getAuthHeaders());
      setResources(response.data.resources || response.data || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoadingResources(false);
    }
  };

  // Fetch subprojects for selected client
  const fetchSubprojects = async (clientName) => {
    try {
      const response = await axios.get(`${API_URL}/project/subproject`, {
        ...getAuthHeaders(),
        params: { client_name: clientName }
      });
      setSubprojects(response.data.subprojects || response.data || []);
    } catch (error) {
      console.error('Error fetching subprojects:', error);
      setSubprojects([]);
    }
  };

  // Fetch cases
  const fetchCases = async (page = 1) => {
    if (!filters.client) return;
    
    setLoadingCases(true);
    try {
      const clientLower = filters.client.toLowerCase();
      let endpoint = '';
      
      if (clientLower === 'mro') endpoint = `${API_URL}/mro-daily-allocations/admin/all`;
      else if (clientLower === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/admin/all`;
      else if (clientLower === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/admin/all`;
      
      if (!endpoint) return;
      
      const params = {
        month: filters.month,
        year: filters.year,
        page,
        limit: 100,
        include_deleted: filters.show_deleted ? 'true' : ''
      };
      
      if (filters.resource_email) params.resource_email = filters.resource_email;
      if (filters.subproject_key) params.subproject_key = filters.subproject_key;
      if (filters.request_type) params.request_type = filters.request_type;
      if (filters.process_type) params.process_type = filters.process_type;
      
      const response = await axios.get(endpoint, { ...getAuthHeaders(), params });
      
      let allCases = response.data.allocations || [];
      
      // Apply additional filters
      if (filters.show_only_edited) {
        allCases = allCases.filter(c => c.edit_count > 0);
      }
      if (filters.show_only_late) {
        allCases = allCases.filter(c => c.is_late_log);
      }
      if (filters.show_only_delete_requested) {
        allCases = allCases.filter(c => c.has_pending_delete_request || c.is_deleted);
      }
      
      setCases(allCases);
      setPagination({
        page: response.data.page || 1,
        pages: response.data.pages || 1,
        total: response.data.total || 0
      });
      
      // Calculate stats
      const totalCases = response.data.allocations || [];
      setStats({
        total: totalCases.length,
        edited: totalCases.filter(c => c.edit_count > 0).length,
        late: totalCases.filter(c => c.is_late_log).length,
        delete_requested: totalCases.filter(c => c.has_pending_delete_request).length,
        deleted: totalCases.filter(c => c.is_deleted).length
      });
      
    } catch (error) {
      console.error('Error fetching cases:', error);
      setCases([]);
    } finally {
      setLoadingCases(false);
    }
  };

  // Fetch edit history
  const fetchEditHistory = async (allocationId) => {
    try {
      const clientLower = filters.client.toLowerCase();
      let endpoint = '';
      
      if (clientLower === 'mro') endpoint = `${API_URL}/mro-daily-allocations/admin/${allocationId}/history`;
      else if (clientLower === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/admin/${allocationId}/history`;
      else if (clientLower === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/admin/${allocationId}/history`;
      
      const response = await axios.get(endpoint, getAuthHeaders());
      setEditHistory(response.data.history || []);
      setShowHistoryModal(allocationId);
    } catch (error) {
      console.error('Error fetching edit history:', error);
      alert('Failed to load edit history');
    }
  };

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters(prev => {
      const newFilters = { ...prev, [field]: value };
      
      if (field === 'client') {
        newFilters.subproject_key = '';
        newFilters.process_type = '';
        fetchSubprojects(value);
      }
      
      return newFilters;
    });
  };

  // Fetch when filters change
  useEffect(() => {
    if (filters.client) {
      fetchCases(1);
      fetchSubprojects(filters.client);
    }
  }, [filters.client, filters.month, filters.year, filters.resource_email, filters.subproject_key, filters.request_type, filters.process_type, filters.show_deleted, filters.show_only_edited, filters.show_only_late, filters.show_only_delete_requested]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('adminInfo');
    navigate('/admin-login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // Get row color based on status
  const getRowClass = (caseItem) => {
    if (caseItem.is_deleted) return 'bg-red-100 border-l-4 border-red-500';
    if (caseItem.has_pending_delete_request) return 'bg-orange-100 border-l-4 border-orange-500';
    if (caseItem.is_late_log) return 'bg-yellow-100 border-l-4 border-yellow-500';
    if (caseItem.edit_count > 0) return 'bg-blue-100 border-l-4 border-blue-500';
    return '';
  };

  // Generate month/year options
  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Get unique processes from subprojects
  const processes = useMemo(() => {
    const processSet = new Set();
    subprojects.forEach(sp => {
      if (sp.project_name) processSet.add(sp.project_name);
    });
    return Array.from(processSet);
  }, [subprojects]);

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
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/admin-dashboard')} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Admin - Previous Cases Review</h1>
                <p className="text-xs text-gray-500">View all resource entries with edit/delete/late log tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">{adminInfo?.email}</span>
              <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-4 space-y-4">
        {/* Color Legend */}
        <div className="bg-white rounded-lg shadow-sm border p-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">🎨 Color Legend</h3>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border-l-4 border-red-500 rounded"></div>
              <span>Deleted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 border-l-4 border-orange-500 rounded"></div>
              <span>Delete Requested (Pending)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-100 border-l-4 border-yellow-500 rounded"></div>
              <span>Late Log (Not Same Day)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border-l-4 border-blue-500 rounded"></div>
              <span>Edited</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
              <span>Normal</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 Filters</h2>
          
          {/* Row 1: Main Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-3">
            {/* Client */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
              <select value={filters.client} onChange={(e) => handleFilterChange('client', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="MRO">MRO</option>
                <option value="Verisma">Verisma</option>
                <option value="Datavant">Datavant</option>
              </select>
            </div>
            
            {/* Resource */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Resource</label>
              <select value={filters.resource_email} onChange={(e) => handleFilterChange('resource_email', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="">All Resources</option>
                {resources.map(r => (
                  <option key={r._id} value={r.email}>{r.name} ({r.email})</option>
                ))}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Process</label>
              <select value={filters.process_type} onChange={(e) => handleFilterChange('process_type', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="">All</option>
                {processes.map(p => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            
            {/* Location */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
              <select value={filters.subproject_key} onChange={(e) => handleFilterChange('subproject_key', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="">All Locations</option>
                {subprojects.map(sp => (<option key={sp.business_key || sp._id} value={sp.business_key}>{sp.name}</option>))}
              </select>
            </div>
            
            {/* Request Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request Type</label>
              <select value={filters.request_type} onChange={(e) => handleFilterChange('request_type', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500">
                <option value="">All Types</option>
                {CLIENT_OPTIONS[filters.client]?.request_types.map(t => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>
            
            {/* Refresh Button */}
            <div className="flex items-end">
              <button onClick={() => fetchCases(1)} className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                Refresh
              </button>
            </div>
          </div>
          
          {/* Row 2: Status Filters */}
          <div className="flex flex-wrap gap-4 pt-3 border-t">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={filters.show_deleted} onChange={(e) => handleFilterChange('show_deleted', e.target.checked)} className="rounded text-red-500 focus:ring-red-500" />
              <span className="text-red-600 font-medium">Include Deleted</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={filters.show_only_edited} onChange={(e) => handleFilterChange('show_only_edited', e.target.checked)} className="rounded text-blue-500 focus:ring-blue-500" />
              <span className="text-blue-600 font-medium">Only Edited</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={filters.show_only_late} onChange={(e) => handleFilterChange('show_only_late', e.target.checked)} className="rounded text-yellow-500 focus:ring-yellow-500" />
              <span className="text-yellow-600 font-medium">Only Late Logs</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={filters.show_only_delete_requested} onChange={(e) => handleFilterChange('show_only_delete_requested', e.target.checked)} className="rounded text-orange-500 focus:ring-orange-500" />
              <span className="text-orange-600 font-medium">Only Delete Requested</span>
            </label>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-white rounded-lg shadow-sm border p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-500">Total Entries</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700">{stats.edited}</div>
            <div className="text-xs text-blue-600">Edited</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow-sm border border-yellow-200 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-700">{stats.late}</div>
            <div className="text-xs text-yellow-600">Late Logs</div>
          </div>
          <div className="bg-orange-50 rounded-lg shadow-sm border border-orange-200 p-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{stats.delete_requested}</div>
            <div className="text-xs text-orange-600">Delete Pending</div>
          </div>
          <div className="bg-red-50 rounded-lg shadow-sm border border-red-200 p-3 text-center">
            <div className="text-2xl font-bold text-red-700">{stats.deleted}</div>
            <div className="text-xs text-red-600">Deleted</div>
          </div>
        </div>

        {/* Cases Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2 bg-gray-800 text-white flex justify-between items-center">
            <h3 className="text-sm font-semibold">📋 All Cases - {filters.client}</h3>
            <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">{cases.length} showing / {pagination.total} total</span>
          </div>

          {loadingCases ? (
            <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div></div>
          ) : cases.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No cases found for the selected filters</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100 text-gray-700 sticky top-0">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold border-r">SR#</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">Resource</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">Alloc Date</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">System Captured Date</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">Process</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                    {filters.client === 'MRO' && <th className="px-2 py-2 text-left font-semibold border-r">Facility</th>}
                    <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                    <th className="px-2 py-2 text-left font-semibold border-r">Req Type</th>
                    {filters.client !== 'Datavant' && <th className="px-2 py-2 text-left font-semibold border-r">Requestor</th>}
                    {filters.client === 'Datavant' && <th className="px-2 py-2 text-left font-semibold border-r">Task Type</th>}
                    {filters.client !== 'MRO' && <th className="px-2 py-2 text-center font-semibold border-r">Count</th>}
                    <th className="px-2 py-2 text-center font-semibold border-r">Late</th>
                    <th className="px-2 py-2 text-center font-semibold border-r">Edits</th>
                    <th className="px-2 py-2 text-center font-semibold border-r">Status</th>
                    <th className="px-2 py-2 text-center font-semibold w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases.map((caseItem, idx) => {
                    const rowClass = getRowClass(caseItem);
                    
                    return (
                      <tr key={caseItem._id} className={`${rowClass} hover:bg-opacity-80 transition`}>
                        <td className="px-2 py-1.5 font-medium border-r">{caseItem.sr_no}</td>
                        <td className="px-2 py-1.5 border-r">
                          <div className="font-medium">{caseItem.resource_name}</div>
                          <div className="text-[10px] text-gray-500">{caseItem.resource_email}</div>
                        </td>
                        <td className="px-2 py-1.5 border-r">{formatDate(caseItem.allocation_date)}</td>
                        <td className="px-2 py-1.5 border-r">{formatDate(caseItem.system_captured_date || caseItem.logged_date)}</td>
                        <td className="px-2 py-1.5 border-r">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            caseItem.process_type === 'Processing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>{caseItem.process_type || caseItem.project_name}</span>
                        </td>
                        <td className="px-2 py-1.5 border-r font-medium">{caseItem.subproject_name}</td>
                        {filters.client === 'MRO' && <td className="px-2 py-1.5 border-r">{caseItem.facility_name || '-'}</td>}
                        <td className="px-2 py-1.5 border-r">{caseItem.request_id || '-'}</td>
                        <td className="px-2 py-1.5 border-r">{caseItem.request_type || '-'}</td>
                        {filters.client !== 'Datavant' && <td className="px-2 py-1.5 border-r">{caseItem.requestor_type || '-'}</td>}
                        {filters.client === 'Datavant' && <td className="px-2 py-1.5 border-r">{caseItem.task_type || '-'}</td>}
                        {filters.client !== 'MRO' && <td className="px-2 py-1.5 text-center border-r font-medium">{caseItem.count || 1}</td>}
                        
                        {/* Late Log */}
                        <td className="px-2 py-1.5 text-center border-r">
                          {caseItem.is_late_log ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-800">
                              +{caseItem.days_late}d
                            </span>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        
                        {/* Edit Count */}
                        <td className="px-2 py-1.5 text-center border-r">
                          {caseItem.edit_count > 0 ? (
                            <button 
                              onClick={() => fetchEditHistory(caseItem._id)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-200 text-blue-800 hover:bg-blue-300 cursor-pointer"
                            >
                              {caseItem.edit_count}x
                            </button>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        
                        {/* Status */}
                        <td className="px-2 py-1.5 text-center border-r">
                          {caseItem.is_deleted ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-800">Deleted</span>
                          ) : caseItem.has_pending_delete_request ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-200 text-orange-800">Del Pending</span>
                          ) : caseItem.is_locked ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600">Locked</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Active</span>
                          )}
                        </td>
                        
                        {/* Actions */}
                        <td className="px-2 py-1.5 text-center">
                          {caseItem.edit_count > 0 && (
                            <button
                              onClick={() => fetchEditHistory(caseItem._id)}
                              className="px-1.5 py-0.5 text-[10px] bg-gray-500 text-white rounded hover:bg-gray-600"
                            >
                              History
                            </button>
                          )}
                        </td>
                      </tr>
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
                <button onClick={() => fetchCases(pagination.page - 1)} disabled={pagination.page <= 1} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50">Previous</button>
                <button onClick={() => fetchCases(pagination.page + 1)} disabled={pagination.page >= pagination.pages} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[80vh] overflow-hidden">
            <div className="px-4 py-3 bg-blue-600 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold">📝 Edit History</h3>
              <button onClick={() => setShowHistoryModal(null)} className="text-white hover:text-gray-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {editHistory.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">No edit history found</p>
              ) : (
                <div className="space-y-4">
                  {editHistory.map((edit, idx) => (
                    <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-xs font-medium text-gray-700">{edit.edited_by_name}</span>
                          <span className="text-[10px] text-gray-500 ml-2">({edit.editor_type})</span>
                        </div>
                        <span className="text-[10px] text-gray-500">{formatDateTime(edit.edited_at)}</span>
                      </div>
                      <div className="mb-2">
                        <span className="text-xs text-gray-600">Reason: </span>
                        <span className="text-xs font-medium text-gray-800">{edit.change_reason}</span>
                      </div>
                      {edit.change_notes && (
                        <div className="mb-2">
                          <span className="text-xs text-gray-600">Notes: </span>
                          <span className="text-xs text-gray-700">{edit.change_notes}</span>
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t">
                        <span className="text-[10px] font-medium text-gray-600">Fields Changed:</span>
                        <div className="mt-1 space-y-1">
                          {edit.fields_changed?.map((field, fIdx) => (
                            <div key={fIdx} className="text-[10px] flex gap-2">
                              <span className="font-medium text-gray-700 w-24">{field.field}:</span>
                              <span className="text-red-600 line-through">{field.old_value || '(empty)'}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-green-600">{field.new_value || '(empty)'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t flex justify-end">
              <button onClick={() => setShowHistoryModal(null)} className="px-4 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPreviousCases;