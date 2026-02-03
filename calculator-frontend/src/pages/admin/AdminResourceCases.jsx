// src/pages/admin/AdminResourceCases.jsx
// Admin view showing all resources with their logged cases summary and detailed view
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const AdminResourceCases = () => {
  const navigate = useNavigate();
  const [adminInfo, setAdminInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // View mode: 'list' or 'detail'
  const [viewMode, setViewMode] = useState('list');
  const [selectedResource, setSelectedResource] = useState(null);
  
  // Resources list with stats
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  
  // Detailed cases for selected resource
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [casePagination, setCasePagination] = useState({ page: 1, pages: 1, total: 0 });
  
  // Hierarchy data for filters
  const [geographies, setGeographies] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subprojects, setSubprojects] = useState([]);
  
  // List view filters
  const [listFilters, setListFilters] = useState({
    geography_id: '',
    client_id: '',
    search: ''
  });
  
  // Detail view filters
  const [detailFilters, setDetailFilters] = useState({
    client: '',
    date: '',
    start_date: '',
    end_date: '',
    process_type: '',
    subproject_id: '',
    request_type: ''
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token || userType !== 'admin') {
      navigate('/admin-login');
      return;
    }
    
    const storedInfo = localStorage.getItem('adminInfo');
    if (storedInfo) setAdminInfo(JSON.parse(storedInfo));
    
    setLoading(false);
    fetchGeographies();
    fetchClients();
    fetchResourcesWithStats();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Fetch hierarchy data
  const fetchGeographies = async () => {
    try {
      const response = await axios.get(`${API_URL}/geographies`, getAuthHeaders());
      setGeographies(response.data.geographies || response.data || []);
    } catch (error) {
      console.error('Error fetching geographies:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API_URL}/clients`, getAuthHeaders());
      setClients(response.data.clients || response.data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchProjects = async (clientId) => {
    try {
      const response = await axios.get(`${API_URL}/projects`, {
        ...getAuthHeaders(),
        params: { client_id: clientId }
      });
      setProjects(response.data.projects || response.data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchSubprojects = async (projectId) => {
    try {
      const response = await axios.get(`${API_URL}/subprojects`, {
        ...getAuthHeaders(),
        params: { project_id: projectId }
      });
      setSubprojects(response.data.subprojects || response.data || []);
    } catch (error) {
      console.error('Error fetching subprojects:', error);
    }
  };

  // Fetch resources with stats
  const fetchResourcesWithStats = async () => {
    setLoadingResources(true);
    try {
      const params = {};
      if (listFilters.geography_id) params.geography_id = listFilters.geography_id;
      if (listFilters.client_id) params.client_id = listFilters.client_id;
      if (listFilters.search) params.search = listFilters.search;
      
      const response = await axios.get(`${API_URL}/admin/resources-with-stats`, {
        ...getAuthHeaders(),
        params
      });
      
      setResources(response.data.resources || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
      // Fallback to basic resources endpoint
      try {
        const fallbackResponse = await axios.get(`${API_URL}/resources`, getAuthHeaders());
        const basicResources = fallbackResponse.data.resources || fallbackResponse.data || [];
        // Add placeholder stats
        setResources(basicResources.map(r => ({
          ...r,
          stats: { today: 0, till_yesterday: 0, total: 0 }
        })));
      } catch (err) {
        setResources([]);
      }
    } finally {
      setLoadingResources(false);
    }
  };

  // Fetch cases for selected resource
  const fetchResourceCases = async (page = 1) => {
    if (!selectedResource) return;
    
    setLoadingCases(true);
    try {
      const params = {
        resource_email: selectedResource.email,
        page,
        limit: 50
      };
      
      if (detailFilters.client) params.client = detailFilters.client;
      if (detailFilters.date) params.date = detailFilters.date;
      if (detailFilters.start_date) params.start_date = detailFilters.start_date;
      if (detailFilters.end_date) params.end_date = detailFilters.end_date;
      if (detailFilters.process_type) params.process_type = detailFilters.process_type;
      if (detailFilters.subproject_id) params.subproject_id = detailFilters.subproject_id;
      if (detailFilters.request_type) params.request_type = detailFilters.request_type;
      
      const response = await axios.get(`${API_URL}/admin/resource-cases`, {
        ...getAuthHeaders(),
        params
      });
      
      setCases(response.data.cases || []);
      setCasePagination({
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

  // Export cases to CSV
  const exportToCSV = async () => {
    if (!selectedResource) return;
    
    try {
      const params = {
        resource_email: selectedResource.email,
        export: 'csv'
      };
      
      if (detailFilters.client) params.client = detailFilters.client;
      if (detailFilters.date) params.date = detailFilters.date;
      if (detailFilters.start_date) params.start_date = detailFilters.start_date;
      if (detailFilters.end_date) params.end_date = detailFilters.end_date;
      if (detailFilters.process_type) params.process_type = detailFilters.process_type;
      if (detailFilters.subproject_id) params.subproject_id = detailFilters.subproject_id;
      
      const response = await axios.get(`${API_URL}/admin/resource-cases/export`, {
        ...getAuthHeaders(),
        params,
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedResource.name}_cases_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export data');
    }
  };

  // Handle resource selection
  const handleResourceClick = (resource) => {
    setSelectedResource(resource);
    setViewMode('detail');
    setDetailFilters({
      client: '',
      date: '',
      start_date: '',
      end_date: '',
      process_type: '',
      subproject_id: '',
      request_type: ''
    });
  };

  // Handle back to list
  const handleBackToList = () => {
    setViewMode('list');
    setSelectedResource(null);
    setCases([]);
  };

  // Fetch cases when detail filters change
  useEffect(() => {
    if (viewMode === 'detail' && selectedResource) {
      fetchResourceCases(1);
    }
  }, [viewMode, selectedResource, detailFilters]);

  // Fetch resources when list filters change
  useEffect(() => {
    if (viewMode === 'list') {
      fetchResourcesWithStats();
    }
  }, [listFilters]);

  // Handle detail filter changes
  const handleDetailFilterChange = (field, value) => {
    setDetailFilters(prev => {
      const newFilters = { ...prev, [field]: value };
      
      if (field === 'client') {
        newFilters.process_type = '';
        newFilters.subproject_id = '';
        if (value) {
          const client = clients.find(c => c.name?.toLowerCase() === value.toLowerCase());
          if (client) fetchProjects(client._id);
        }
      }
      if (field === 'process_type') {
        newFilters.subproject_id = '';
        if (value) {
          const project = projects.find(p => p.name === value);
          if (project) fetchSubprojects(project._id);
        }
      }
      
      return newFilters;
    });
  };

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

  // Filter resources by search
  const filteredResources = useMemo(() => {
    if (!listFilters.search) return resources;
    const search = listFilters.search.toLowerCase();
    return resources.filter(r => 
      r.name?.toLowerCase().includes(search) || 
      r.email?.toLowerCase().includes(search)
    );
  }, [resources, listFilters.search]);

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
              <button onClick={() => viewMode === 'detail' ? handleBackToList() : navigate('/admin-dashboard')} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="text-base font-semibold text-gray-800">
                  {viewMode === 'list' ? 'Resource Cases Overview' : `Cases - ${selectedResource?.name}`}
                </h1>
                <p className="text-xs text-gray-500">
                  {viewMode === 'list' ? 'View all resources and their logged cases' : `Email: ${selectedResource?.email}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {viewMode === 'detail' && (
                <button onClick={exportToCSV} className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>
              )}
              <span className="text-sm text-gray-600">{adminInfo?.email}</span>
              <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-4 space-y-4">
        {/* ════════════════════════════════════════════════════════════════ */}
        {/* LIST VIEW - All Resources with Stats */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {viewMode === 'list' && (
          <>
            {/* List Filters */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Search */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Search Resource</label>
                  <input
                    type="text"
                    value={listFilters.search}
                    onChange={(e) => setListFilters(prev => ({ ...prev, search: e.target.value }))}
                    placeholder="Name or email..."
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                {/* Geography */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Geography</label>
                  <select
                    value={listFilters.geography_id}
                    onChange={(e) => setListFilters(prev => ({ ...prev, geography_id: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Geographies</option>
                    {geographies.map(g => (
                      <option key={g._id} value={g._id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Client */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
                  <select
                    value={listFilters.client_id}
                    onChange={(e) => setListFilters(prev => ({ ...prev, client_id: e.target.value }))}
                    className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Clients</option>
                    {clients.map(c => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Refresh */}
                <div className="flex items-end">
                  <button
                    onClick={fetchResourcesWithStats}
                    className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Resources Table */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-2 bg-indigo-600 text-white flex justify-between items-center">
                <h3 className="text-sm font-semibold">👥 All Resources</h3>
                <span className="text-xs bg-indigo-500 px-2 py-0.5 rounded">{filteredResources.length} resources</span>
              </div>

              {loadingResources ? (
                <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div></div>
              ) : filteredResources.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No resources found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold border-r">#</th>
                        <th className="px-3 py-2 text-left font-semibold border-r">Resource Name</th>
                        <th className="px-3 py-2 text-left font-semibold border-r">Email</th>
                        <th className="px-3 py-2 text-center font-semibold border-r bg-green-50">Today's Cases</th>
                        <th className="px-3 py-2 text-center font-semibold border-r bg-yellow-50">Till Yesterday</th>
                        <th className="px-3 py-2 text-center font-semibold border-r bg-blue-50">Total Cases</th>
                        <th className="px-3 py-2 text-center font-semibold border-r">Assigned Locations</th>
                        <th className="px-3 py-2 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredResources.map((resource, idx) => (
                        <tr
                          key={resource._id}
                          onClick={() => handleResourceClick(resource)}
                          className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-indigo-50 cursor-pointer transition`}
                        >
                          <td className="px-3 py-2 font-medium border-r">{idx + 1}</td>
                          <td className="px-3 py-2 border-r">
                            <div className="font-medium text-indigo-600">{resource.name}</div>
                          </td>
                          <td className="px-3 py-2 border-r text-gray-600">{resource.email}</td>
                          <td className="px-3 py-2 text-center border-r bg-green-50">
                            <span className="px-2 py-0.5 rounded font-bold text-green-700 bg-green-100">
                              {resource.stats?.today || 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center border-r bg-yellow-50">
                            <span className="px-2 py-0.5 rounded font-bold text-yellow-700 bg-yellow-100">
                              {resource.stats?.till_yesterday || 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center border-r bg-blue-50">
                            <span className="px-2 py-0.5 rounded font-bold text-blue-700 bg-blue-100">
                              {resource.stats?.total || 0}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center border-r">
                            {resource.assignments?.reduce((sum, a) => sum + (a.subprojects?.length || 0), 0) || 0}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              resource.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {resource.is_active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* DETAIL VIEW - Selected Resource Cases */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {viewMode === 'detail' && selectedResource && (
          <>
            {/* Resource Summary Card */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 font-bold text-lg">{selectedResource.name?.charAt(0)}</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">{selectedResource.name}</h2>
                    <p className="text-sm text-gray-500">{selectedResource.email}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="text-center px-4 py-2 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{selectedResource.stats?.today || 0}</div>
                    <div className="text-xs text-green-700">Today</div>
                  </div>
                  <div className="text-center px-4 py-2 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">{selectedResource.stats?.till_yesterday || 0}</div>
                    <div className="text-xs text-yellow-700">Till Yesterday</div>
                  </div>
                  <div className="text-center px-4 py-2 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{selectedResource.stats?.total || 0}</div>
                    <div className="text-xs text-blue-700">Total</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Detail Filters */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 Filter Cases</h2>
              
              {/* Row 1 */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
                {/* Client */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
                  <select
                    value={detailFilters.client}
                    onChange={(e) => handleDetailFilterChange('client', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Clients</option>
                    <option value="MRO">MRO</option>
                    <option value="Verisma">Verisma</option>
                    <option value="Datavant">Datavant</option>
                  </select>
                </div>
                
                {/* Specific Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Specific Date</label>
                  <input
                    type="date"
                    value={detailFilters.date}
                    onChange={(e) => handleDetailFilterChange('date', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                  <input
                    type="date"
                    value={detailFilters.start_date}
                    onChange={(e) => handleDetailFilterChange('start_date', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                {/* End Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                  <input
                    type="date"
                    value={detailFilters.end_date}
                    onChange={(e) => handleDetailFilterChange('end_date', e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                {/* Process Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label>
                  <select
                    value={detailFilters.process_type}
                    onChange={(e) => handleDetailFilterChange('process_type', e.target.value)}
                    disabled={!detailFilters.client}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">All</option>
                    {projects.map(p => (
                      <option key={p._id} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Location */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <select
                    value={detailFilters.subproject_id}
                    onChange={(e) => handleDetailFilterChange('subproject_id', e.target.value)}
                    disabled={!detailFilters.process_type}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">All</option>
                    {subprojects.map(sp => (
                      <option key={sp._id} value={sp._id}>{sp.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    onClick={() => setDetailFilters({ client: '', date: '', start_date: '', end_date: '', process_type: '', subproject_id: '', request_type: '' })}
                    className="w-full px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {/* Cases Table */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="px-4 py-2 bg-gray-800 text-white flex justify-between items-center">
                <h3 className="text-sm font-semibold">📋 Logged Cases</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">{casePagination.total} total cases</span>
                  <button onClick={exportToCSV} className="text-xs bg-green-600 px-2 py-0.5 rounded hover:bg-green-700 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export
                  </button>
                </div>
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
                        <th className="px-2 py-2 text-left font-semibold border-r">Client</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Alloc Date</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Log Date</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Process</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                        <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                        <th className="px-2 py-2 text-center font-semibold border-r">Count</th>
                        <th className="px-2 py-2 text-center font-semibold border-r">Late</th>
                        <th className="px-2 py-2 text-center font-semibold border-r">Edits</th>
                        <th className="px-2 py-2 text-center font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {cases.map((caseItem, idx) => {
                        // Color coding
                        let rowClass = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                        if (caseItem.is_deleted) rowClass = 'bg-red-50 border-l-4 border-red-500';
                        else if (caseItem.has_pending_delete_request) rowClass = 'bg-orange-50 border-l-4 border-orange-500';
                        else if (caseItem.is_late_log) rowClass = 'bg-yellow-50 border-l-4 border-yellow-500';
                        else if (caseItem.edit_count > 0) rowClass = 'bg-blue-50 border-l-4 border-blue-500';
                        
                        return (
                          <tr key={caseItem._id} className={`${rowClass} hover:bg-opacity-80`}>
                            <td className="px-2 py-1.5 font-medium border-r">{caseItem.sr_no}</td>
                            <td className="px-2 py-1.5 border-r">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                caseItem.client_name === 'MRO' ? 'bg-green-100 text-green-700' :
                                caseItem.client_name === 'Verisma' ? 'bg-blue-100 text-blue-700' :
                                'bg-purple-100 text-purple-700'
                              }`}>{caseItem.client_name}</span>
                            </td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.allocation_date)}</td>
                            <td className="px-2 py-1.5 border-r">{formatDate(caseItem.logged_date)}</td>
                            <td className="px-2 py-1.5 border-r">{caseItem.process_type || caseItem.project_name}</td>
                            <td className="px-2 py-1.5 border-r font-medium">{caseItem.subproject_name}</td>
                            <td className="px-2 py-1.5 border-r">{caseItem.request_id || '-'}</td>
                            <td className="px-2 py-1.5 border-r">{caseItem.request_type || '-'}</td>
                            <td className="px-2 py-1.5 text-center border-r font-medium">{caseItem.count || 1}</td>
                            <td className="px-2 py-1.5 text-center border-r">
                              {caseItem.is_late_log ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-200 text-yellow-800">+{caseItem.days_late}d</span>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-center border-r">
                              {caseItem.edit_count > 0 ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-200 text-blue-800">{caseItem.edit_count}x</span>
                              ) : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              {caseItem.is_deleted ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-800">Deleted</span>
                              ) : caseItem.has_pending_delete_request ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-200 text-orange-800">Del Req</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Active</span>
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
              {casePagination.pages > 1 && (
                <div className="px-4 py-3 border-t flex items-center justify-between">
                  <span className="text-xs text-gray-600">Page {casePagination.page} of {casePagination.pages}</span>
                  <div className="flex gap-2">
                    <button onClick={() => fetchResourceCases(casePagination.page - 1)} disabled={casePagination.page <= 1} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50">Previous</button>
                    <button onClick={() => fetchResourceCases(casePagination.page + 1)} disabled={casePagination.page >= casePagination.pages} className="px-3 py-1 text-xs border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminResourceCases;