// src/pages/PreviousLoggedCases.jsx - View and filter previous logged cases
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL 

const PreviousLoggedCases = () => {
  const navigate = useNavigate();
  const [resourceInfo, setResourceInfo] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    subproject_key: '',
    process_type: '',
    request_id: '',
    geography_id: ''
  });
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [changeReason, setChangeReason] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  
  // Delete request
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
    
    fetchLocations();
  }, [navigate]);

  useEffect(() => {
    if (resourceInfo) {
      fetchAllocations();
    }
  }, [filters, page, resourceInfo]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchLocations = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/resource/me/locations`,
        getAuthHeaders()
      );
      setLocations(response.data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchAllocations = async () => {
    setLoading(true);
    try {
      const params = { ...filters, page, limit: 50 };
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === null) {
          delete params[key];
        }
      });
      
      const response = await axios.get(
        `${API_URL}/mro-daily-allocations/previous-cases`,
        { ...getAuthHeaders(), params }
      );
      
      setAllocations(response.data.allocations || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.pages || 1);
      
    } catch (error) {
      console.error('Error fetching allocations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique values for dropdowns
  const uniqueLocations = useMemo(() => {
    const locs = [];
    locations.forEach(assignment => {
      assignment.subprojects?.forEach(sp => {
        if (sp.subproject_key) {
          locs.push({
            key: sp.subproject_key,
            name: sp.subproject_name,
            project: assignment.project_name
          });
        }
      });
    });
    return locs;
  }, [locations]);

  const uniqueGeographies = useMemo(() => {
    const geos = new Map();
    locations.forEach(a => {
      if (a.geography_id) {
        geos.set(a.geography_id, a.geography_name);
      }
    });
    return Array.from(geos, ([id, name]) => ({ id, name }));
  }, [locations]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short', year: '2-digit' 
    });
  };

  const isDateLocked = (dateString) => {
    const now = new Date();
    const entryDate = new Date(dateString);
    const lastDayOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    return now > lastDayOfMonth;
  };

  // Edit handlers
  const startEdit = (allocation) => {
    if (isDateLocked(allocation.allocation_date)) {
      alert('Cannot edit entries from locked months');
      return;
    }
    setEditingId(allocation._id);
    setEditData({
      facility_name: allocation.facility_name || '',
      request_id: allocation.request_id || '',
      request_type: allocation.request_type || '',
      requestor_type: allocation.requestor_type || '',
      processing_time: allocation.processing_time || '',
      remark: allocation.remark || ''
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
      await axios.put(
        `${API_URL}/mro-daily-allocations/${editingId}`,
        {
          ...editData,
          change_reason: changeReason,
          change_notes: changeNotes
        },
        getAuthHeaders()
      );
      
      cancelEdit();
      fetchAllocations();
      
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
      await axios.post(
        `${API_URL}/mro-daily-allocations/${showDeleteModal}/request-delete`,
        { delete_reason: deleteReason },
        getAuthHeaders()
      );
      
      setShowDeleteModal(null);
      setDeleteReason('');
      fetchAllocations();
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

  // Generate month options
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

  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 2; y--) {
    years.push(y);
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link 
                to="/resource-dashboard"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                ← Back to Dashboard
              </Link>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Logged Cases for the Month</h1>
                <p className="text-xs text-gray-500">View and filter your previous entries</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
                <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Month */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Month</label>
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
            
            {/* Year */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Year</label>
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
            
            {/* Geography */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Geography</label>
              <select
                value={filters.geography_id}
                onChange={(e) => handleFilterChange('geography_id', e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All</option>
                {uniqueGeographies.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            
            {/* Process Type */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Process Type</label>
              <select
                value={filters.process_type}
                onChange={(e) => handleFilterChange('process_type', e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="Processing">Processing</option>
                <option value="Logging">Logging</option>
                <option value="MRO Payer Project">MRO Payer Project</option>
              </select>
            </div>
            
            {/* Location */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Location</label>
              <select
                value={filters.subproject_key}
                onChange={(e) => handleFilterChange('subproject_key', e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">All</option>
                {uniqueLocations.map(l => (
                  <option key={l.key} value={l.key}>{l.name} ({l.project})</option>
                ))}
              </select>
            </div>
            
            {/* Request ID */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Request ID</label>
              <input
                type="text"
                value={filters.request_id}
                onChange={(e) => handleFilterChange('request_id', e.target.value)}
                placeholder="Search by ID"
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Showing {allocations.length} of {total} entries
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-xs text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>

        {/* Allocations Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">SR#</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Alloc. Date</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Logged Date</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Process</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Location</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Facility</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Request ID</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Request Type</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Requestor Type</th>
                  <th className="px-2 py-2 text-center font-medium border-r border-blue-600">Late?</th>
                  <th className="px-2 py-2 text-center font-medium border-r border-blue-600">Edits</th>
                  <th className="px-2 py-2 text-center font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : allocations.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                      No entries found for the selected filters
                    </td>
                  </tr>
                ) : (
                  allocations.map((alloc, idx) => {
                    const isEditing = editingId === alloc._id;
                    const locked = isDateLocked(alloc.allocation_date);
                    
                    return (
                      <React.Fragment key={alloc._id}>
                        <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''} ${alloc.is_late_log ? 'border-l-4 border-l-orange-400' : ''}`}>
                          <td className="px-2 py-1.5 font-medium border-r">{alloc.sr_no}</td>
                          <td className="px-2 py-1.5 text-gray-600 border-r">{formatDate(alloc.allocation_date)}</td>
                          <td className="px-2 py-1.5 text-gray-600 border-r">{formatDate(alloc.logged_date)}</td>
                          <td className="px-2 py-1.5 border-r">{alloc.process_type}</td>
                          <td className="px-2 py-1.5 border-r font-medium">{alloc.subproject_name}</td>
                          
                          {/* Editable fields */}
                          <td className="px-1 py-1 border-r">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editData.facility_name || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, facility_name: e.target.value }))}
                                className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                              />
                            ) : (
                              alloc.facility_name || '-'
                            )}
                          </td>
                          <td className="px-1 py-1 border-r">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editData.request_id || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))}
                                className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                              />
                            ) : (
                              alloc.request_id || '-'
                            )}
                          </td>
                          <td className="px-1 py-1 border-r">
                            {isEditing ? (
                              <select
                                value={editData.request_type || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))}
                                className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                              >
                                <option value="">--</option>
                                <option value="New Request">New Request</option>
                                <option value="Follow up">Follow up</option>
                                <option value="Batch">Batch</option>
                                <option value="DDS">DDS</option>
                                <option value="E-link">E-link</option>
                                <option value="E-Request">E-Request</option>
                              </select>
                            ) : (
                              alloc.request_type
                            )}
                          </td>
                          <td className="px-1 py-1 border-r">
                            {alloc.process_type === 'Processing' ? (
                              isEditing ? (
                                <select
                                  value={editData.requestor_type || ''}
                                  onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))}
                                  className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                                >
                                  <option value="">--</option>
                                  <option value="NRS-NO Records">NRS-NO Records</option>
                                  <option value="Manual">Manual</option>
                                  <option value="Other Processing (Canceled/Released By Other)">Other Processing</option>
                                  <option value="Processed">Processed</option>
                                  <option value="Processed through File Drop">File Drop</option>
                                </select>
                              ) : (
                                alloc.requestor_type || '-'
                              )
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center border-r">
                            {alloc.is_late_log ? (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded">
                                +{alloc.days_late}d
                              </span>
                            ) : (
                              <span className="text-green-600">✓</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center border-r">
                            {alloc.edit_count > 0 ? (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded">
                                {alloc.edit_count}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {locked ? (
                              <span className="text-gray-400 text-[10px]">Locked</span>
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
                                  onClick={() => startEdit(alloc)}
                                  className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setShowDeleteModal(alloc._id)}
                                  className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600"
                                  disabled={alloc.has_pending_delete_request}
                                >
                                  {alloc.has_pending_delete_request ? '...' : 'Del'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        
                        {/* Change reason input row */}
                        {isEditing && (
                          <tr className="bg-yellow-50">
                            <td colSpan={12} className="px-4 py-2">
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Delete Request Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Request Deletion</h3>
            <p className="text-xs text-gray-600 mb-3">
              Your delete request will be sent to an admin for approval.
            </p>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded"
              rows={3}
              placeholder="Enter delete reason (required)"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowDeleteModal(null); setDeleteReason(''); }}
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