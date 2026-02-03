// src/components/resourcesDashboard/MRO/MROAllocationPanel.jsx
// Fixed: Uses date-filtered locations based on assigned_date
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL;

// MRO Dropdown Options
const MRO_REQUEST_TYPES = ['New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'];
const MRO_REQUESTOR_TYPES = ['NRS-NO Records', 'Manual', 'Other Processing (Canceled/Released By Other)', 'Processed', 'Processed through File Drop'];

const MROAllocationPanel = ({ 
  locations = [],  // These are now DATE-FILTERED from parent
  selectedDate, 
  resourceInfo, 
  geographyId,
  geographyName,
  allocations = [],
  onRefresh,
  loading 
}) => {
  // Form state
  const [formData, setFormData] = useState({
    subproject_id: '',
    facility_name: '',
    request_id: '',
    request_type: '',
    requestor_type: '',
    processing_time: ''
  });
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [requestIdWarning, setRequestIdWarning] = useState(null);
  const [selectedLocationInfo, setSelectedLocationInfo] = useState(null);
  
  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [changeReason, setChangeReason] = useState('');
  
  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Flatten locations from assignments
  // These locations are ALREADY filtered by assigned_date from parent component
  const allAssignedLocations = useMemo(() => {
    const locs = [];
    
    locations.forEach(assignment => {
      assignment.subprojects?.forEach(sp => {
        locs.push({
          subproject_id: sp.subproject_id,
          subproject_name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          assigned_date: sp.assigned_date, // Track assigned date
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

  // Filter out locations that already have entries for selected date
  const availableLocations = useMemo(() => {
    const loggedSubprojectIds = new Set(
      allocations.map(a => a.subproject_id?.toString())
    );
    
    return allAssignedLocations.filter(loc => 
      !loggedSubprojectIds.has(loc.subproject_id?.toString())
    );
  }, [allAssignedLocations, allocations]);

  // Check if selected date is valid
  const dateValidation = useMemo(() => {
    if (!selectedDate) return { valid: false, message: 'No date selected' };
    
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Cannot log for future dates
    if (selected > today) {
      return { valid: false, message: 'Cannot log entries for future dates' };
    }
    
    // Check if month is locked
    const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    
    if (new Date() > lastDayOfMonth) {
      return { valid: false, message: 'This month is locked. Cannot add new entries.' };
    }
    
    return { valid: true, message: null };
  }, [selectedDate]);

  // Handle location selection
  const handleLocationChange = (subprojectId) => {
    const location = availableLocations.find(l => l.subproject_id === subprojectId);
    setSelectedLocationInfo(location);
    
    setFormData(prev => ({
      ...prev,
      subproject_id: subprojectId,
      requestor_type: ''
    }));
  };

  // Check if process is "Processing" type
  const isProcessingType = useMemo(() => {
    if (!selectedLocationInfo) return false;
    return selectedLocationInfo.project_name?.toLowerCase().includes('processing');
  }, [selectedLocationInfo]);

  // Check Request ID for duplicates
  const checkRequestId = async (requestId) => {
    if (!requestId || requestId.trim() === '') {
      setRequestIdWarning(null);
      return;
    }
    
    try {
      const response = await axios.get(`${API_URL}/mro-daily-allocations/check-request-id`, {
        ...getAuthHeaders(),
        params: { request_id: requestId }
      });
      
      if (response.data.exists) {
        setRequestIdWarning({
          message: `This Request ID already has a "New Request" entry`,
          suggested_type: response.data.suggested_type
        });
      } else {
        setRequestIdWarning(null);
      }
    } catch (err) {
      console.error('Error checking request ID:', err);
    }
  };

  // Debounced request ID check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.request_id && formData.request_type === 'New Request') {
        checkRequestId(formData.request_id);
      } else {
        setRequestIdWarning(null);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formData.request_id, formData.request_type]);

  // Submit new entry
  const handleSubmit = async () => {
    if (!formData.subproject_id || !formData.request_type) {
      alert('Please select Location and Request Type');
      return;
    }
    
    if (!dateValidation.valid) {
      alert(dateValidation.message);
      return;
    }
    
    if (isProcessingType && !formData.requestor_type) {
      alert('Please select Requestor Type for Processing locations');
      return;
    }
    
    if (requestIdWarning && formData.request_type === 'New Request') {
      const proceed = window.confirm(
        `${requestIdWarning.message}. Suggested type: "${requestIdWarning.suggested_type}". Continue anyway?`
      );
      if (!proceed) return;
    }
    
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/mro-daily-allocations`, {
        subproject_id: formData.subproject_id,
        allocation_date: selectedDate,
        facility_name: formData.facility_name,
        request_id: formData.request_id,
        request_type: formData.request_type,
        requestor_type: isProcessingType ? formData.requestor_type : '',
        processing_time: formData.processing_time,
        geography_id: selectedLocationInfo?.geography_id || geographyId,
        geography_name: selectedLocationInfo?.geography_name || geographyName
      }, getAuthHeaders());
      
      // Reset form
      setFormData({
        subproject_id: '',
        facility_name: '',
        request_id: '',
        request_type: '',
        requestor_type: '',
        processing_time: ''
      });
      setSelectedLocationInfo(null);
      setRequestIdWarning(null);
      
      if (onRefresh) onRefresh();
      
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit functions
  const startEdit = (allocation) => {
    setEditingId(allocation._id);
    setEditData({
      facility_name: allocation.facility_name || '',
      request_id: allocation.request_id || '',
      request_type: allocation.request_type || '',
      requestor_type: allocation.requestor_type || '',
      processing_time: allocation.processing_time || ''
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
      await axios.put(`${API_URL}/mro-daily-allocations/${editingId}`, {
        ...editData,
        change_reason: changeReason
      }, getAuthHeaders());
      
      cancelEdit();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update entry');
    }
  };

  // Delete request
  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      alert('Please enter a delete reason');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/mro-daily-allocations/${showDeleteModal}/request-delete`, {
        delete_reason: deleteReason
      }, getAuthHeaders());
      
      setShowDeleteModal(null);
      setDeleteReason('');
      if (onRefresh) onRefresh();
      alert('Delete request submitted for admin approval');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit delete request');
    }
  };

  // Check if entry is locked
  const isEntryLocked = (allocation) => {
    if (allocation.is_locked) return true;
    
    const allocDate = new Date(allocation.allocation_date);
    const lastDayOfMonth = new Date(allocDate.getFullYear(), allocDate.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    
    return new Date() > lastDayOfMonth;
  };

  // Stats
  const stats = useMemo(() => ({
    pending: availableLocations.length,
    todaysEntries: allocations.length,
    totalAssigned: allAssignedLocations.length
  }), [availableLocations, allocations, allAssignedLocations]);

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="flex flex-wrap gap-3">
        <div className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
          Pending: {stats.pending}
        </div>
        <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
          Today's Entries: {stats.todaysEntries}
        </div>
        <div className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-xs font-medium">
          Total for Date: {stats.todaysEntries}
        </div>
        <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
          Assigned Locations (for this date): {stats.totalAssigned}
        </div>
      </div>

      {/* No Locations Warning */}
      {allAssignedLocations.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <p className="text-sm font-medium">⚠️ No locations available for this date</p>
          <p className="text-xs mt-1">
            You may not have any locations assigned that are effective on or before {selectedDate}.
            Locations can only be logged from their assignment date onwards.
          </p>
        </div>
      )}

      {/* Date Validation Warning */}
      {!dateValidation.valid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          ⚠️ {dateValidation.message}
        </div>
      )}

      {/* Add New Entry Form */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-green-600 text-white">
          <h3 className="text-sm font-semibold">✨ Add New Entry</h3>
        </div>
        
        <div className="p-4">
          {availableLocations.length === 0 && allAssignedLocations.length > 0 ? (
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">✅ All assigned locations have been logged for this date.</p>
              <p className="text-xs mt-1">Select a different date or wait for new assignments.</p>
            </div>
          ) : allAssignedLocations.length === 0 ? (
            <div className="text-center py-4 text-yellow-600">
              <p className="text-sm">⚠️ No locations are assigned to you for this date.</p>
              <p className="text-xs mt-1">
                Locations are only available from their assignment date. 
                Try selecting a more recent date.
              </p>
            </div>
          ) : !dateValidation.valid ? (
            <div className="text-center py-4 text-red-500">
              <p className="text-sm">⚠️ Cannot add entries for this date.</p>
              <p className="text-xs mt-1">{dateValidation.message}</p>
            </div>
          ) : (
            <>
              {/* Form Row 1 */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Date</label>
                  <input type="text" value={selectedDate} readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assigner Name</label>
                  <input type="text" value={resourceInfo?.name || ''} readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location <span className="text-red-500">*</span></label>
                  <select value={formData.subproject_id} onChange={(e) => handleLocationChange(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500">
                    <option value="">-- Select --</option>
                    {availableLocations.map(loc => (
                      <option key={loc.subproject_id} value={loc.subproject_id}>
                        {loc.subproject_name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Process</label>
                  <input type="text" value={selectedLocationInfo?.project_name || 'Select location'} readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                  <input type="text" value={formData.facility_name} onChange={(e) => setFormData(prev => ({ ...prev, facility_name: e.target.value }))} placeholder="Free text" className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500" />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Request ID <span className="text-red-500">*</span></label>
                  <input type="text" value={formData.request_id} onChange={(e) => setFormData(prev => ({ ...prev, request_id: e.target.value }))} placeholder="Enter ID" className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-green-500 ${requestIdWarning ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`} />
                  {requestIdWarning && <p className="text-[10px] text-yellow-600 mt-0.5">⚠️ Suggest: {requestIdWarning.suggested_type}</p>}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Request Type <span className="text-red-500">*</span></label>
                  <select value={formData.request_type} onChange={(e) => setFormData(prev => ({ ...prev, request_type: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500">
                    <option value="">-- Select --</option>
                    {MRO_REQUEST_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Requestor Type</label>
                  {isProcessingType ? (
                    <select value={formData.requestor_type} onChange={(e) => setFormData(prev => ({ ...prev, requestor_type: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500">
                      <option value="">-- Select --</option>
                      {MRO_REQUESTOR_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  ) : (
                    <input type="text" value="N/A" readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-100 text-gray-500" />
                  )}
                </div>
              </div>
              
              {/* Form Row 2 */}
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Proc. Time</label>
                  <input type="text" value={formData.processing_time} onChange={(e) => setFormData(prev => ({ ...prev, processing_time: e.target.value }))} placeholder="Optional" className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500" />
                </div>
                
                <button onClick={handleSubmit} disabled={submitting || !formData.subproject_id || !formData.request_type || !dateValidation.valid} className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
                  {submitting ? 'Submitting...' : 'Submit Entry'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-gray-700 text-white flex justify-between items-center">
          <h3 className="text-sm font-semibold">📋 Entries for {selectedDate}</h3>
          <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{allocations.length} entries</span>
        </div>

        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : allocations.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">No entries logged for this date yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold border-r">SR#</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Process</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Facility</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Requestor Type</th>
                  <th className="px-2 py-2 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allocations.map((alloc, idx) => {
                  const isEditing = editingId === alloc._id;
                  const locked = isEntryLocked(alloc);
                  
                  return (
                    <React.Fragment key={alloc._id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''}`}>
                        <td className="px-2 py-1.5 font-medium border-r">{alloc.sr_no}</td>
                        <td className="px-2 py-1.5 border-r font-medium">{alloc.subproject_name}</td>
                        <td className="px-2 py-1.5 border-r">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${alloc.process_type === 'Processing' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {alloc.process_type || alloc.project_name}
                          </span>
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? <input type="text" value={editData.facility_name} onChange={(e) => setEditData(prev => ({ ...prev, facility_name: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" /> : (alloc.facility_name || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? <input type="text" value={editData.request_id} onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" /> : (alloc.request_id || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select value={editData.request_type} onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">
                              {MRO_REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : alloc.request_type}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {alloc.process_type !== 'Processing' ? <span className="text-gray-400">N/A</span> : 
                            isEditing ? (
                              <select value={editData.requestor_type} onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">
                                <option value="">--</option>
                                {MRO_REQUESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            ) : (alloc.requestor_type || '-')
                          }
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {locked ? <span className="text-gray-400 text-[10px]">🔒 Locked</span> : 
                            isEditing ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={saveEdit} className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded hover:bg-green-600">Save</button>
                                <button onClick={cancelEdit} className="px-1.5 py-0.5 text-[10px] bg-gray-400 text-white rounded hover:bg-gray-500">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => startEdit(alloc)} className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                                <button onClick={() => setShowDeleteModal(alloc._id)} disabled={alloc.has_pending_delete_request} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300">Del</button>
                              </div>
                            )
                          }
                        </td>
                      </tr>
                      
                      {isEditing && (
                        <tr className="bg-yellow-50">
                          <td colSpan={8} className="px-4 py-2">
                            <div className="flex gap-4 items-end">
                              <div className="flex-1">
                                <label className="block text-xs font-medium text-yellow-800 mb-1">Change Reason <span className="text-red-500">*</span></label>
                                <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded" placeholder="Why are you making this change?" />
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
      </div>

      {/* Delete Modal */}
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

export default MROAllocationPanel;