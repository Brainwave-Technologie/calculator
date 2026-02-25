// pages/admin/AdminQCDashboard.jsx - Admin QC Dashboard with date-wise summary
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const AdminQCDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, in_progress: 0, completed: 0 });
  const [clientCounts, setClientCounts] = useState({});
  const [assignedResources, setAssignedResources] = useState([]);
  const [sourceResources, setSourceResources] = useState([]);

  // Filters
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [assignedTo, setAssignedTo] = useState('');
  const [sourceResource, setSourceResource] = useState('');

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedClient) params.client_type = selectedClient;
      if (selectedMonth) params.month = selectedMonth;
      if (selectedYear) params.year = selectedYear;
      if (assignedTo) params.assigned_to = assignedTo;
      if (sourceResource) params.source_resource = sourceResource;

      const response = await axios.get(`${API_URL}/qc-assignments/admin/summary`, {
        ...getAuthHeaders(),
        params
      });

      setSummary(response.data.summary || []);
      setCounts(response.data.counts || { pending: 0, in_progress: 0, completed: 0 });
      setClientCounts(response.data.clientCounts || {});
      setAssignedResources(response.data.assignedResources || []);
      setSourceResources(response.data.sourceResources || []);
    } catch (error) {
      console.error('Error fetching QC summary:', error);
      toast.error('Failed to fetch QC data');
    } finally {
      setLoading(false);
    }
  }, [selectedClient, selectedMonth, selectedYear, assignedTo, sourceResource]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const totalAll = counts.pending + counts.in_progress + counts.completed;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

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

  const clearFilters = () => {
    setSelectedClient('');
    setAssignedTo('');
    setSourceResource('');
    setSelectedMonth(new Date().getMonth() + 1);
    setSelectedYear(new Date().getFullYear());
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QC Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Date-wise QC assignment summary across resources</p>
        </div>
        <button
          onClick={fetchSummary}
          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
        >
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Total</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{totalAll}</div>
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
        {['MRO', 'Verisma', 'Datavant'].map(ct => (
          <div key={ct} className="bg-white rounded-lg shadow-sm border p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider">{ct}</div>
            <div className="text-2xl font-bold text-purple-700 mt-1">{clientCounts[ct] || 0}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Client Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSelectedClient('')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${!selectedClient ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                All
              </button>
              {['MRO', 'Verisma', 'Datavant'].map(ct => (
                <button
                  key={ct}
                  onClick={() => setSelectedClient(ct)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${selectedClient === ct ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>

          {/* Month */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* QC Resource */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned Cases To</label>
            <select
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg min-w-[160px]"
            >
              <option value="">All Resources</option>
              {assignedResources.map(r => (
                <option key={r.email} value={r.email}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Assigned Cases Of */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Assigned Cases Of</label>
            <select
              value={sourceResource}
              onChange={e => setSourceResource(e.target.value)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg min-w-[160px]"
            >
              <option value="">All Sources</option>
              {sourceResources.map(r => (
                <option key={r.email} value={r.email}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div className="ml-auto">
            <label className="block text-xs font-medium text-gray-600 mb-1">&nbsp;</label>
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">#</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Assigned Cases Of</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Assigned Cases To</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider text-xs">Assigned</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider text-xs">Completed</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider text-xs">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-8 text-gray-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                      Loading summary...
                    </div>
                  </td>
                </tr>
              ) : summary.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium">No QC assignments found</p>
                      <p className="text-xs mt-1">Assign QC tasks from the Resources page</p>
                    </div>
                  </td>
                </tr>
              ) : (
                summary.map((row, index) => {
                  const allDone = row.completed === row.total_assigned;
                  const rowBg = allDone ? 'bg-green-50' : row.pending === row.total_assigned ? 'bg-yellow-50' : 'bg-white';

                  return (
                    <tr key={index} className={`${rowBg} hover:bg-gray-50 transition`}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-medium">{index + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{formatDate(row.date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold ${
                          row.client_type === 'MRO' ? 'bg-blue-100 text-blue-800' :
                          row.client_type === 'Verisma' ? 'bg-indigo-100 text-indigo-800' :
                          'bg-teal-100 text-teal-800'
                        }`}>
                          {row.client_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{row.source_resource_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">{row.qc_resource_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-800 font-bold text-sm">
                          {row.total_assigned}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-800 font-bold text-sm">
                          {row.completed}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                          row.pending > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {row.pending}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        {!loading && summary.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-600">
              {summary.length} assignment group{summary.length !== 1 ? 's' : ''} shown
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span>Total Assigned: <strong className="text-purple-700">{summary.reduce((s, r) => s + r.total_assigned, 0)}</strong></span>
              <span>Completed: <strong className="text-green-700">{summary.reduce((s, r) => s + r.completed, 0)}</strong></span>
              <span>Pending: <strong className="text-yellow-700">{summary.reduce((s, r) => s + r.pending, 0)}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminQCDashboard;
