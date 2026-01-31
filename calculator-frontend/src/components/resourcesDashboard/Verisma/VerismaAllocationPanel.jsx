// src/components/resourcesDashboard/Verisma/VerismaAllocationPanel.jsx
// Pre-populated table rows with inline editing and per-row submit
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Verisma Dropdown Options
const REQUEST_TYPES = ['', 'New Request', 'Key', 'Duplicate'];

const VerismaAllocationPanel = ({ locations, selectedDate, resourceInfo, geographyId, geographyName, allocations, onRefresh, loading }) => {
  const [submittingRows, setSubmittingRows] = useState({});
  const [rowData, setRowData] = useState({});

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Flatten locations
  const locationRows = useMemo(() => {
    const rows = [];
    locations.forEach(assignment => {
      assignment.subprojects?.forEach(sp => {
        rows.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name
        });
      });
    });
    return rows;
  }, [locations]);

  // Initialize row data
  useEffect(() => {
    const initialData = {};
    locationRows.forEach(loc => {
      if (!rowData[loc.subproject_id]) {
        initialData[loc.subproject_id] = {
          request_type: '',
          count: 1,
          remark: ''
        };
      }
    });
    if (Object.keys(initialData).length > 0) {
      setRowData(prev => ({ ...prev, ...initialData }));
    }
  }, [locationRows]);

  const handleRowChange = (subprojectId, field, value) => {
    setRowData(prev => ({
      ...prev,
      [subprojectId]: { ...prev[subprojectId], [field]: value }
    }));
  };

  const handleSubmitRow = async (location) => {
    const data = rowData[location.subproject_id];
    
    if (!data?.request_type) {
      alert('Please select Request Type');
      return;
    }

    setSubmittingRows(prev => ({ ...prev, [location.subproject_id]: true }));

    try {
      await axios.post(
        `${API_URL}/verisma-daily-allocations`,
        {
          subproject_id: location.subproject_id,
          request_type: data.request_type,
          count: parseInt(data.count) || 1,
          remark: data.remark || '',
          allocation_date: selectedDate,
          geography_id: geographyId,
          geography_name: geographyName
        },
        getAuthHeaders()
      );

      setRowData(prev => ({
        ...prev,
        [location.subproject_id]: { request_type: '', count: 1, remark: '' }
      }));

      onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add entry');
    } finally {
      setSubmittingRows(prev => ({ ...prev, [location.subproject_id]: false }));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    
    try {
      await axios.delete(`${API_URL}/verisma-daily-allocations/${id}`, getAuthHeaders());
      onRefresh();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short', year: '2-digit' 
    });
  };

  // Count totals
  const totalCount = allocations.reduce((sum, a) => sum + (a.count || 1), 0);

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="flex gap-4 text-xs">
        <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded">
          <span className="text-blue-700">Entries: <strong>{allocations.length}</strong></span>
        </div>
        <div className="bg-gray-50 border border-gray-200 px-3 py-1.5 rounded">
          <span className="text-gray-700">Total Count: <strong>{totalCount}</strong></span>
        </div>
      </div>

      {/* Entry Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-blue-700 text-white">
          <h3 className="text-sm font-semibold">Add New Entry</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                <th className="px-2 py-2 text-left font-semibold border-r">Project</th>
                <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                <th className="px-2 py-2 text-center font-semibold border-r w-16">Count</th>
                <th className="px-2 py-2 text-left font-semibold border-r">Remark</th>
                <th className="px-2 py-2 text-center font-semibold w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {locationRows.map((loc, idx) => {
                const data = rowData[loc.subproject_id] || {};
                const isSubmitting = submittingRows[loc.subproject_id];
                const canSubmit = !!data.request_type;
                
                return (
                  <tr key={loc.subproject_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1.5 font-medium text-gray-900 border-r">
                      <div className="max-w-[140px] truncate" title={loc.subproject_name}>
                        {loc.subproject_name}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-gray-600 border-r">{loc.project_name}</td>
                    <td className="px-1 py-1 border-r">
                      <select
                        value={data.request_type || ''}
                        onChange={(e) => handleRowChange(loc.subproject_id, 'request_type', e.target.value)}
                        className="w-full px-1 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                      >
                        {REQUEST_TYPES.map(type => (
                          <option key={type} value={type}>{type || '--'}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 border-r">
                      <input
                        type="number"
                        min="1"
                        value={data.count || 1}
                        onChange={(e) => handleRowChange(loc.subproject_id, 'count', e.target.value)}
                        className="w-full px-1 py-1 text-xs border border-gray-200 rounded text-center focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-1 py-1 border-r">
                      <input
                        type="text"
                        value={data.remark || ''}
                        onChange={(e) => handleRowChange(loc.subproject_id, 'remark', e.target.value)}
                        className="w-full px-1.5 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                        placeholder="remark"
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <button
                        onClick={() => handleSubmitRow(loc)}
                        disabled={isSubmitting || !canSubmit}
                        className={`px-2 py-1 text-[10px] font-medium rounded transition ${
                          isSubmitting || !canSubmit
                            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isSubmitting ? '...' : 'Submit'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submitted Entries Table */}
      {allocations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">Submitted Entries</h3>
            <span className="text-xs text-gray-500">{allocations.length} records</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-blue-700 text-white">
                <tr>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">SR#</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Allocation Date</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Resource Name</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Project</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Location</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Request Type</th>
                  <th className="px-2 py-2 text-center font-medium border-r border-blue-600">Count</th>
                  <th className="px-2 py-2 text-left font-medium border-r border-blue-600">Remark</th>
                  <th className="px-2 py-2 text-center font-medium w-12">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map((alloc, idx) => (
                  <tr key={alloc._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1.5 font-medium border-r">{alloc.sr_no}</td>
                    <td className="px-2 py-1.5 text-gray-600 border-r">{formatDate(alloc.allocation_date)}</td>
                    <td className="px-2 py-1.5 border-r">{alloc.resource_name}</td>
                    <td className="px-2 py-1.5 border-r">{alloc.project_name}</td>
                    <td className="px-2 py-1.5 border-r">{alloc.subproject_name}</td>
                    <td className="px-2 py-1.5 border-r">{alloc.request_type}</td>
                    <td className="px-2 py-1.5 text-center font-medium border-r">{alloc.count || 1}</td>
                    <td className="px-2 py-1.5 text-gray-500 border-r">{alloc.remark || '-'}</td>
                    <td className="px-2 py-1.5 text-center">
                      {!alloc.is_locked ? (
                        <button onClick={() => handleDelete(alloc._id)} className="text-red-500 hover:text-red-700">✕</button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && <div className="text-center py-4 text-gray-500 text-xs">Loading...</div>}
    </div>
  );
};

export default VerismaAllocationPanel;