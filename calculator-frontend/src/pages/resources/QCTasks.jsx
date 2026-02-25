// pages/resources/QCTasks.jsx - QC Tasks page for resource dashboard
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const QCTasks = () => {
  const navigate = useNavigate();
  const [resourceInfo, setResourceInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, in_progress: 0, completed: 0 });
  const [totalTasks, setTotalTasks] = useState(0);

  // Filters
  const [selectedClient, setSelectedClient] = useState('MRO');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Editing state
  const [editingRow, setEditingRow] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Load resource info on mount
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
    fetchResourceInfo();
  }, [navigate]);

  const fetchResourceInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/resource/me`, getAuthHeaders());
      if (response.data.resource) {
        setResourceInfo(response.data.resource);
        localStorage.setItem('resourceInfo', JSON.stringify(response.data.resource));
      }
    } catch (error) {
      if (error.response?.status === 401) {
        handleLogout();
      }
    }
  };

  // Fetch QC tasks
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: currentPage, limit: pageSize };
      if (selectedClient) params.client_type = selectedClient;
      if (statusFilter) params.status = statusFilter;
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;

      const response = await axios.get(`${API_URL}/qc-assignments/my-qc-tasks`, {
        ...getAuthHeaders(),
        params
      });

      setTasks(response.data.tasks || []);
      setTotalTasks(response.data.total || 0);
      setCounts(response.data.counts || { pending: 0, in_progress: 0, completed: 0 });
    } catch (error) {
      console.error('Error fetching QC tasks:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [selectedClient, statusFilter, selectedMonth, selectedYear, currentPage, pageSize]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceInfo');
    navigate('/resource-login');
  };

  const totalPages = Math.ceil(totalTasks / pageSize);

  // Start editing a row
  const startEditing = (task) => {
    setEditingRow(task._id);
    setEditData({
      qc_date: task.qc_date ? new Date(task.qc_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      duplicate_code: task.duplicate_code || '',
      qc_request_type: task.qc_request_type || '',
      qc_action_taken: task.qc_action_taken || '',
      qc_error_type: task.qc_error_type || '',
      qc_remark: task.qc_remark || '',
      qc_code: task.qc_code || '1'
    });
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditData({});
  };

  // Save QC data for a single row
  const saveRow = async (taskId) => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/qc-assignments/${taskId}`, editData, getAuthHeaders());
      toast.success('QC entry saved');
      setEditingRow(null);
      setEditData({});
      fetchTasks();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  };

  // Month options
  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 1, currentYear, currentYear + 1];
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-full mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/resource/dashboard')}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">QC</div>
              <div>
                <h1 className="text-base font-semibold text-gray-800">QC Dashboard</h1>
                <p className="text-xs text-gray-500">Review and quality check logged cases</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/resource/dashboard')}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                Back to Dashboard
              </button>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
                <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
              </div>
              <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">Total Tasks</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{counts.pending + counts.in_progress + counts.completed}</div>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow-sm border border-yellow-200 p-4">
            <div className="text-xs text-yellow-600 uppercase tracking-wider">Pending</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{counts.pending}</div>
          </div>
          <div className="bg-blue-50 rounded-lg shadow-sm border border-blue-200 p-4">
            <div className="text-xs text-blue-600 uppercase tracking-wider">In Progress</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{counts.in_progress}</div>
          </div>
          <div className="bg-green-50 rounded-lg shadow-sm border border-green-200 p-4">
            <div className="text-xs text-green-600 uppercase tracking-wider">Completed</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{counts.completed}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Client Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
              <div className="flex gap-2">
                {['MRO', 'Verisma', 'Datavant'].map(ct => (
                  <button
                    key={ct}
                    onClick={() => { setSelectedClient(ct); setCurrentPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${selectedClient === ct ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {ct}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setStatusFilter(''); setCurrentPage(1); }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${!statusFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  All
                </button>
                {[{ value: 'pending', label: 'Pending', color: 'yellow' }, { value: 'completed', label: 'Completed', color: 'green' }].map(s => (
                  <button
                    key={s.value}
                    onClick={() => { setStatusFilter(s.value); setCurrentPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${statusFilter === s.value ? `bg-${s.color}-600 text-white border-${s.color}-600` : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Month/Year */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
              <select
                value={selectedMonth}
                onChange={e => { setSelectedMonth(parseInt(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
              >
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
              <select
                value={selectedYear}
                onChange={e => { setSelectedYear(parseInt(e.target.value)); setCurrentPage(1); }}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Refresh */}
            <div className="ml-auto">
              <label className="block text-xs font-medium text-gray-600 mb-1">&nbsp;</label>
              <button
                onClick={fetchTasks}
                className="px-4 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* QC Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">SR No</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Actual Date of Logging</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Assigner Name</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">QC Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">QC Done By</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Process</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Location</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Request ID</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Duplicate</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Code</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Request Type</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Requestor Type</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Action Taken</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Type of Error</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Remark</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="16" className="text-center py-8 text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                        Loading QC tasks...
                      </div>
                    </td>
                  </tr>
                ) : tasks.length === 0 ? (
                  <tr>
                    <td colSpan="16" className="text-center py-12 text-gray-500">
                      <div className="flex flex-col items-center">
                        <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="font-medium">No QC tasks found</p>
                        <p className="text-xs mt-1">QC tasks will appear here when assigned by admin</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tasks.map((task, index) => {
                    const isEditing = editingRow === task._id;
                    const rowBg = task.status === 'completed' ? 'bg-green-50' : task.status === 'pending' ? 'bg-yellow-50' : 'bg-white';

                    return (
                      <tr key={task._id} className={`${rowBg} hover:bg-gray-50 transition`}>
                        {/* SR No */}
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                          {(currentPage - 1) * pageSize + index + 1}
                        </td>

                        {/* Actual Date of Logging */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {formatDate(task.original_allocation_date)}
                        </td>

                        {/* Assigner Name */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {task.original_resource_name}
                        </td>

                        {/* QC Date */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editData.qc_date || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_date: e.target.value }))}
                              className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            />
                          ) : (
                            <span className={task.qc_date ? 'text-gray-700' : 'text-gray-400'}>
                              {task.qc_date ? formatDate(task.qc_date) : '—'}
                            </span>
                          )}
                        </td>

                        {/* QC Done By */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {task.qc_done_by || (isEditing ? resourceInfo?.name : '—')}
                        </td>

                        {/* Process */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {task.process_type || task.project_name || '—'}
                          </span>
                        </td>

                        {/* Location */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {task.subproject_name || '—'}
                        </td>

                        {/* Request ID */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700 font-mono text-xs">
                          {task.request_id || '—'}
                        </td>

                        {/* Duplicate Code */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.duplicate_code || ''}
                              onChange={e => setEditData(prev => ({ ...prev, duplicate_code: e.target.value }))}
                              placeholder="Duplicate code..."
                              className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 font-mono"
                            />
                          ) : (
                            <span className={`font-mono text-xs ${task.duplicate_code ? 'text-gray-700' : 'text-gray-400'}`}>
                              {task.duplicate_code || '—'}
                            </span>
                          )}
                        </td>

                        {/* Code */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.qc_code || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_code: e.target.value }))}
                              className="w-12 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            />
                          ) : (
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold ${task.qc_code ? 'bg-orange-100 text-orange-800' : 'text-gray-400'}`}>
                              {task.qc_code || '—'}
                            </span>
                          )}
                        </td>

                        {/* Request Type (QC finding) */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <select
                              value={editData.qc_request_type || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_request_type: e.target.value }))}
                              className="w-24 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            >
                              <option value="">Select...</option>
                              <option value="Key">Key</option>
                              <option value="Duplicate">Duplicate</option>
                            </select>
                          ) : (
                            task.qc_request_type ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${task.qc_request_type === 'Key' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {task.qc_request_type}
                              </span>
                            ) : <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Requestor Type */}
                        <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                          {task.requestor_type || '—'}
                        </td>

                        {/* Action Taken */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <select
                              value={editData.qc_action_taken || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_action_taken: e.target.value }))}
                              className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            >
                              <option value="">Select...</option>
                              <option value="Corrected">Corrected</option>
                              <option value="No Action">No Action</option>
                              <option value="Escalated">Escalated</option>
                            </select>
                          ) : (
                            task.qc_action_taken ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                {task.qc_action_taken}
                              </span>
                            ) : <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Type of Error */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.qc_error_type || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_error_type: e.target.value }))}
                              placeholder="Error type..."
                              className="w-28 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            />
                          ) : (
                            <span className={task.qc_error_type ? 'text-red-600 font-medium' : 'text-gray-400'}>
                              {task.qc_error_type || '—'}
                            </span>
                          )}
                        </td>

                        {/* Remark */}
                        <td className="px-3 py-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.qc_remark || ''}
                              onChange={e => setEditData(prev => ({ ...prev, qc_remark: e.target.value }))}
                              placeholder="Remark..."
                              className="w-32 px-1.5 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                            />
                          ) : (
                            <span className={task.qc_remark ? 'text-gray-700' : 'text-gray-400'}>
                              {task.qc_remark || '—'}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2 whitespace-nowrap text-center">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-center">
                              <button
                                onClick={() => saveRow(task._id)}
                                disabled={saving}
                                className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50 font-medium"
                              >
                                {saving ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-2.5 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditing(task)}
                              className={`px-2.5 py-1 text-xs font-medium rounded transition ${
                                task.status === 'completed'
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {task.status === 'completed' ? 'Edit' : 'Review'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && totalTasks > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xs text-gray-600">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalTasks)} of {totalTasks}
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Rows:</label>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(parseInt(e.target.value)); setCurrentPage(1); }}
                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                  >
                    {[25, 50, 100, 200].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="First page"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  {(() => {
                    const pages = [];
                    let start = Math.max(1, currentPage - 2);
                    let end = Math.min(totalPages, start + 4);
                    if (end - start < 4) start = Math.max(1, end - 4);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map(p => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`w-7 h-7 text-xs rounded transition font-medium ${p === currentPage ? 'bg-purple-600 text-white' : 'border border-gray-300 hover:bg-gray-100 text-gray-700'}`}
                      >
                        {p}
                      </button>
                    ));
                  })()}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Last page"
                  >
                    Last
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default QCTasks;
