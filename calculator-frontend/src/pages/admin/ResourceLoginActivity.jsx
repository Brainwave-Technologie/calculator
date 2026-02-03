// src/pages/admin/ResourceLoginActivity.jsx - View login activity for all resources
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL 

const ResourceLoginActivity = () => {
  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month'); // 'week', 'month', 'all'
  const [sortBy, setSortBy] = useState('last_login'); // 'last_login', 'total_logins', 'name'
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    fetchResources();
  }, [sortBy, sortOrder]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchResources = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${API_URL}/resource/login-activity?sort_by=${sortBy}&sort_order=${sortOrder}`,
        getAuthHeaders()
      );
      setResources(response.data.resources);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTimeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    return formatDate(date);
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return <span className="text-gray-300">↕</span>;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  // Calculate summary stats
  const totalLogins = resources.reduce((sum, r) => sum + (r.total_logins || 0), 0);
  const activeToday = resources.filter(r => {
    if (!r.last_login) return false;
    const today = new Date();
    const lastLogin = new Date(r.last_login);
    return lastLogin.toDateString() === today.toDateString();
  }).length;
  const activeThisWeek = resources.filter(r => {
    if (!r.last_login) return false;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return new Date(r.last_login) > weekAgo;
  }).length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Resource Login Activity</h1>
        <p className="text-gray-600 mt-1">Monitor resource login patterns and activity</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Resources</p>
              <p className="text-2xl font-bold text-gray-800">{resources.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Logins</p>
              <p className="text-2xl font-bold text-gray-800">{totalLogins}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Today</p>
              <p className="text-2xl font-bold text-gray-800">{activeToday}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active This Week</p>
              <p className="text-2xl font-bold text-gray-800">{activeThisWeek}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Resources Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Login Activity</h2>
          <button
            onClick={fetchResources}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('name')}
                  >
                    Resource <SortIcon field="name" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('total_logins')}
                  >
                    Total Logins <SortIcon field="total_logins" />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleSort('last_login')}
                  >
                    Last Login <SortIcon field="last_login" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {resources.map(resource => (
                  <tr key={resource._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-blue-600 font-medium text-sm">
                            {resource.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{resource.name}</div>
                          <div className="text-xs text-gray-500 capitalize">{resource.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {resource.email}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-lg font-semibold text-gray-800">
                        {resource.total_logins || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm text-gray-900">{getTimeAgo(resource.last_login)}</div>
                        <div className="text-xs text-gray-500">{formatDate(resource.last_login)}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        resource.status === 'active' 
                          ? 'bg-green-100 text-green-800' 
                          : resource.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {resource.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedResource(resource)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedResource && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto mx-4">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedResource.name}</h2>
                  <p className="text-gray-600">{selectedResource.email}</p>
                </div>
                <button
                  onClick={() => setSelectedResource(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{selectedResource.total_logins || 0}</p>
                  <p className="text-sm text-blue-800">Total Logins</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {selectedResource.monthly_logins?.[selectedResource.monthly_logins?.length - 1]?.count || 0}
                  </p>
                  <p className="text-sm text-green-800">This Month</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <p className="text-sm font-medium text-purple-600">{getTimeAgo(selectedResource.last_login)}</p>
                  <p className="text-sm text-purple-800">Last Login</p>
                </div>
              </div>

              {/* Recent Login History */}
              <h3 className="font-medium text-gray-800 mb-3">Recent Login History</h3>
              <div className="bg-gray-50 rounded-lg divide-y divide-gray-200 max-h-64 overflow-y-auto">
                {selectedResource.login_history?.length > 0 ? (
                  selectedResource.login_history.slice(0, 20).map((login, idx) => (
                    <div key={idx} className="p-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-800">{formatDate(login.login_time)}</p>
                        <p className="text-xs text-gray-500">IP: {login.ip_address}</p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                        {login.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">No login history available</div>
                )}
              </div>

              {/* Monthly Stats */}
              {selectedResource.monthly_logins?.length > 0 && (
                <>
                  <h3 className="font-medium text-gray-800 mb-3 mt-6">Monthly Login Stats</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedResource.monthly_logins.slice(-6).map((stat, idx) => (
                      <div key={idx} className="bg-gray-50 rounded p-2 text-center">
                        <p className="text-lg font-bold text-gray-800">{stat.count}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(stat.year, stat.month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceLoginActivity;
