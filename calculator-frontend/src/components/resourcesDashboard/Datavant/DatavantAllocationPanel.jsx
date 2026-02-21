// src/components/DatavantAllocationPanel.jsx
// Simplified: Process Type selection + Count (location = process type for Datavant)
import React, { useState, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const DatavantAllocationPanel = ({
  locations = [],
  selectedDate,
  resourceInfo,
  geographyId,
  geographyName,
  allocations = [],
  onRefresh,
  onDateChange,
  loading
}) => {
  const [formData, setFormData] = useState({
    subproject_id: '',
    count: 1,
    remark: ''
  });

  // Local allocation date for the form
  const [formDate, setFormDate] = useState(selectedDate || '');

  // Sync formDate when parent selectedDate changes
  React.useEffect(() => {
    if (selectedDate) setFormDate(selectedDate);
  }, [selectedDate]);

  // Min = first day of current month, Max = today
  const { minDate, maxDate } = React.useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return {
      minDate: `${year}-${month}-01`,
      maxDate: now.toLocaleDateString('en-CA')
    };
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [selectedLocationInfo, setSelectedLocationInfo] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [changeReason, setChangeReason] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Flatten locations (already date-filtered from parent)
  const allAssignedLocations = useMemo(() => {
    const locs = [];
    locations.forEach(assignment => {
      assignment.subprojects?.forEach(sp => {
        locs.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: sp.assigned_date,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name,
          geography_id: assignment.geography_id,
          geography_name: assignment.geography_name
        });
      });
    });
    return locs;
  }, [locations]);

  // All assigned process types available (allow logging to same process type multiple times per day)
  const availableLocations = allAssignedLocations;

  // Date validation
  const dateValidation = useMemo(() => {
    if (!formDate) return { valid: false, message: 'No date selected' };

    const todayStr = new Date().toLocaleDateString('en-CA');

    if (formDate > todayStr) return { valid: false, message: 'Cannot log entries for future dates' };

    const selected = new Date(formDate + 'T00:00:00');
    const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    const lastDayStr = lastDayOfMonth.toLocaleDateString('en-CA');

    if (todayStr > lastDayStr) return { valid: false, message: 'This month is locked' };

    return { valid: true };
  }, [formDate]);

  const handleLocationChange = (subprojectId) => {
    const location = allAssignedLocations.find(l => l.subproject_id === subprojectId);
    setSelectedLocationInfo(location);
    setFormData(prev => ({ ...prev, subproject_id: subprojectId }));
  };

  const handleSubmit = async () => {
    if (!formData.subproject_id) {
      alert('Please select a Process Type');
      return;
    }
    if (!dateValidation.valid) {
      alert(dateValidation.message);
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/datavant-daily-allocations`, {
        subproject_id: formData.subproject_id,
        allocation_date: formDate,
        count: formData.count || 1,
        remark: formData.remark || '',
        geography_id: selectedLocationInfo?.geography_id || geographyId,
        geography_name: selectedLocationInfo?.geography_name || geographyName
      }, getAuthHeaders());

      setFormData({ subproject_id: '', count: 1, remark: '' });
      setSelectedLocationInfo(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (allocation) => {
    setEditingId(allocation._id);
    setEditData({
      count: allocation.count || 1,
      remark: allocation.remark || ''
    });
    setChangeReason('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
    setChangeReason('');
  };

  const saveEdit = async () => {
    if (!changeReason.trim()) {
      alert('Please enter a change reason');
      return;
    }
    try {
      await axios.put(`${API_URL}/datavant-daily-allocations/${editingId}`, {
        ...editData,
        change_reason: changeReason
      }, getAuthHeaders());
      cancelEdit();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update');
    }
  };

  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) return;
    try {
      await axios.post(`${API_URL}/datavant-daily-allocations/${showDeleteModal}/request-delete`, {
        delete_reason: deleteReason
      }, getAuthHeaders());
      setShowDeleteModal(null);
      setDeleteReason('');
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed');
    }
  };

  const isEntryLocked = (allocation) => {
    if (allocation.is_locked) return true;
    const allocDate = new Date(allocation.allocation_date);
    const lastDayOfMonth = new Date(allocDate.getFullYear(), allocDate.getMonth() + 1, 0);
    return new Date() > lastDayOfMonth;
  };

  const stats = useMemo(() => ({
    todaysEntries: allocations.length,
    totalAssigned: allAssignedLocations.length
  }), [allocations, allAssignedLocations]);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <div className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">Today's Entries: {stats.todaysEntries}</div>
        <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">Assigned Process Types: {stats.totalAssigned}</div>
      </div>

      {allAssignedLocations.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <p className="text-sm font-medium">No Datavant process types assigned to you</p>
          <p className="text-xs mt-1">Contact your admin to get process types assigned.</p>
        </div>
      )}

      {!dateValidation.valid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{dateValidation.message}</div>
      )}

      {/* Add Entry Form */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-purple-600 text-white"><h3 className="text-sm font-semibold">Add New Entry</h3></div>
        <div className="p-4">
          {allAssignedLocations.length === 0 ? (
            <div className="text-center py-4 text-yellow-600 text-sm">No Datavant process types assigned. Contact admin.</div>
          ) : !dateValidation.valid ? (
            <div className="text-center py-4 text-red-500 text-sm">{dateValidation.message}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={formDate}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => {
                    setFormDate(e.target.value);
                    if (onDateChange) onDateChange(e.target.value);
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Process Type <span className="text-red-500">*</span></label>
                <select value={formData.subproject_id} onChange={(e) => handleLocationChange(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded">
                  <option value="">-- Select --</option>
                  {allAssignedLocations.map(loc => <option key={loc.subproject_id} value={loc.subproject_id}>{loc.subproject_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Count</label>
                <input type="number" min="1" value={formData.count} onChange={(e) => setFormData(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded" />
              </div>
              <div className="flex items-end">
                <button onClick={handleSubmit} disabled={submitting || !formData.subproject_id || !dateValidation.valid} className="w-full px-4 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:bg-gray-300">
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-gray-700 text-white flex justify-between">
          <h3 className="text-sm font-semibold">Entries for {selectedDate}</h3>
          <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{allocations.length}</span>
        </div>
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : allocations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No entries for this date</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-2 text-left border-r">SR#</th>
                  <th className="px-2 py-2 text-left border-r">Process Type</th>
                  <th className="px-2 py-2 text-center border-r">Count</th>
                  <th className="px-2 py-2 text-left border-r">Remark</th>
                  <th className="px-2 py-2 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allocations.map((alloc, idx) => {
                  const isEditing = editingId === alloc._id;
                  const locked = isEntryLocked(alloc);
                  return (
                    <React.Fragment key={alloc._id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''}`}>
                        <td className="px-2 py-1.5 border-r">{alloc.sr_no}</td>
                        <td className="px-2 py-1.5 border-r font-medium">{alloc.subproject_name}</td>
                        <td className="px-1 py-1 text-center border-r">
                          {isEditing
                            ? <input type="number" min="1" value={editData.count} onChange={(e) => setEditData(prev => ({ ...prev, count: parseInt(e.target.value) || 1 }))} className="w-16 px-1 py-0.5 text-xs border border-yellow-400 rounded text-center" />
                            : alloc.count}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing
                            ? <input type="text" value={editData.remark} onChange={(e) => setEditData(prev => ({ ...prev, remark: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" placeholder="Optional" />
                            : (alloc.remark || '-')}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {locked ? <span className="text-gray-400 text-[10px]">Locked</span> : isEditing ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={saveEdit} className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded">Save</button>
                              <button onClick={cancelEdit} className="px-1.5 py-0.5 text-[10px] bg-gray-400 text-white rounded">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => startEdit(alloc)} className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded">Edit</button>
                              <button onClick={() => setShowDeleteModal(alloc._id)} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded">Del</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isEditing && (
                        <tr className="bg-yellow-50">
                          <td colSpan={5} className="px-4 py-2">
                            <label className="text-xs font-medium text-yellow-800">Change Reason <span className="text-red-500">*</span></label>
                            <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="w-full mt-1 px-2 py-1.5 text-xs border border-yellow-400 rounded" placeholder="Why are you editing?" />
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
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <h3 className="text-sm font-semibold mb-3">Request Deletion</h3>
            <textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="w-full px-3 py-2 text-xs border rounded" rows={3} placeholder="Delete reason (required)" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setShowDeleteModal(null); setDeleteReason(''); }} className="px-3 py-1.5 text-xs bg-gray-200 rounded">Cancel</button>
              <button onClick={submitDeleteRequest} disabled={!deleteReason.trim()} className="px-3 py-1.5 text-xs bg-red-500 text-white rounded disabled:bg-red-300">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatavantAllocationPanel;