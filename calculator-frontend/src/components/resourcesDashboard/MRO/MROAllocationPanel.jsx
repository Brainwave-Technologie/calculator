// src/components/resourcesDashboard/MRO/MROAllocationPanel.jsx
// UPDATED: 
// - Allows multiple entries per location per day (same Request ID logic)
// - "Pending" = locations not yet logged for TODAY (not this selected date)
// - Location dropdown shows ALL assigned locations (with entry count indicator)
// - Once logged on ANY date, location won't appear as "pending" on future dates
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
const API_URL = import.meta.env.VITE_BACKEND_URL;

// MRO Dropdown Options
const MRO_REQUEST_TYPES = ['New Request', 'Follow up', 'Batch', 'DDS', 'E-link', 'E-Request'];
const MRO_REQUESTOR_TYPES = ['NRS-NO Records', 'Manual', 'Other Processing (Canceled/Released By Other)', 'Processed', 'Processed through File Drop'];

const MROAllocationPanel = ({
  locations = [],  // DATE-FILTERED locations from parent
  selectedDate,
  resourceInfo,
  geographyId,
  geographyName,
  allocations = [],  // Allocations for selectedDate
  onRefresh,
  onDateChange,
  loading
}) => {
  // Form state
  const [formData, setFormData] = useState({
    selectedProcess: '',
    subproject_id: '',
    facility_name: '',
    request_id: '',
    request_type: '',
    requestor_type: '',
    processing_time: ''
  });

  // Local allocation date for the form (separate from parent's selectedDate)
  const [formDate, setFormDate] = useState(selectedDate || '');

  // Sync formDate when parent selectedDate changes
  useEffect(() => {
    if (selectedDate) setFormDate(selectedDate);
  }, [selectedDate]);

  // Min = first day of current month, Max = today (no future dates)
  const { minDate, maxDate } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return {
      minDate: `${year}-${month}-01`,
      maxDate: now.toLocaleDateString('en-CA')
    };
  }, []);

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

  // Batch mode state
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [batchRequestIds, setBatchRequestIds] = useState(Array(10).fill(''));
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [showBatchWarning, setShowBatchWarning] = useState(false);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Flatten locations from assignments
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

  // Unique process types from assigned locations
  const uniqueProcessTypes = useMemo(() => {
    const types = new Set();
    allAssignedLocations.forEach(loc => {
      if (loc.project_name) types.add(loc.project_name);
    });
    return [...types];
  }, [allAssignedLocations]);

  // ═══════════════════════════════════════════════════════════════
  // AVAILABLE LOCATIONS: Filtered by selected process type
  // ═══════════════════════════════════════════════════════════════
  const availableLocations = useMemo(() => {
    if (!formData.selectedProcess) return [];
    return allAssignedLocations.filter(loc => loc.project_name === formData.selectedProcess);
  }, [allAssignedLocations, formData.selectedProcess]);

  // ═══════════════════════════════════════════════════════════════
  // PENDING LOCATIONS: Locations that have NO entries for selected date
  // These are "pending" because they need at least one entry
  // ═══════════════════════════════════════════════════════════════
  const pendingLocations = useMemo(() => {
    const loggedSubprojectIds = new Set(
      allocations.map(a => a.subproject_id?.toString())
    );
    
    return allAssignedLocations.filter(loc => 
      !loggedSubprojectIds.has(loc.subproject_id?.toString())
    );
  }, [allAssignedLocations, allocations]);

  // Get entry count per location for display in dropdown
  const entriesPerLocation = useMemo(() => {
    const counts = {};
    allocations.forEach(a => {
      const key = a.subproject_id?.toString();
      if (key) {
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [allocations]);

  // Check if selected date is valid
  const dateValidation = useMemo(() => {
    if (!formDate) return { valid: false, message: 'No date selected' };

    const selected = new Date(formDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selected.setHours(0, 0, 0, 0);

    if (selected > today) {
      return { valid: false, message: 'Cannot log entries for future dates' };
    }

    const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);

    if (new Date() > lastDayOfMonth) {
      return { valid: false, message: 'This month is locked. Cannot add new entries.' };
    }

    return { valid: true, message: null };
  }, [formDate]);

  // Handle process type selection
  const handleProcessChange = (processName) => {
    setFormData(prev => ({
      ...prev,
      selectedProcess: processName,
      subproject_id: '',
      requestor_type: ''
    }));
    setSelectedLocationInfo(null);
  };

  // Handle location selection
  const handleLocationChange = (subprojectId) => {
    const location = allAssignedLocations.find(l => l.subproject_id === subprojectId);
    setSelectedLocationInfo(location);

    setFormData(prev => ({
      ...prev,
      subproject_id: subprojectId,
      requestor_type: ''
    }));
  };

  // Check if process is "Processing" type
  const isProcessingType = useMemo(() => {
    if (!formData.selectedProcess) return false;
    return formData.selectedProcess.toLowerCase().includes('processing');
  }, [formData.selectedProcess]);

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
    if (!formData.subproject_id || !formData.request_type || !formData.request_id) {
      toast.error('Please fill Location, Request ID, and Request Type');
      return;
    }
    
    if (!dateValidation.valid) {
      toast.error(dateValidation.message);
      return;
    }
    
    if (isProcessingType && !formData.requestor_type) {
      toast.error('Please select Requestor Type for Processing locations');
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
        allocation_date: formDate,
        facility_name: formData.facility_name,
        request_id: formData.request_id,
        request_type: formData.request_type,
        requestor_type: isProcessingType ? formData.requestor_type : '',
        processing_time: formData.processing_time,
        geography_id: selectedLocationInfo?.geography_id || geographyId,
        geography_name: selectedLocationInfo?.geography_name || geographyName
      }, getAuthHeaders());
      
      toast.success('Entry submitted successfully!');
      
      // Reset form but KEEP process and location for quick additional entries
      setFormData(prev => ({
        ...prev,
        facility_name: '',
        request_id: '',
        request_type: '',
        requestor_type: '',
        processing_time: ''
        // Keep selectedProcess and subproject_id for quick additional entries
      }));
      setRequestIdWarning(null);
      
      if (onRefresh) onRefresh();
      
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  // Batch submit handler
  const handleBatchSubmit = async () => {
    if (!formData.subproject_id || !formData.request_type) {
      toast.error('Please fill Location and Request Type');
      return;
    }

    if (!dateValidation.valid) {
      toast.error(dateValidation.message);
      return;
    }

    if (isProcessingType && !formData.requestor_type) {
      toast.error('Please select Requestor Type for Processing locations');
      return;
    }

    const filledIds = batchRequestIds.filter(id => id.trim() !== '');
    const emptyCount = batchRequestIds.length - filledIds.length;

    if (filledIds.length === 0) {
      toast.error('Please fill at least one Request ID');
      return;
    }

    if (emptyCount > 0) {
      setShowBatchWarning(true);
      return;
    }

    await submitBatch(batchRequestIds);
  };

  const submitBatch = async (requestIds) => {
    setBatchSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/mro-daily-allocations/batch`, {
        subproject_id: formData.subproject_id,
        allocation_date: formDate,
        facility_name: formData.facility_name,
        request_type: formData.request_type,
        requestor_type: isProcessingType ? formData.requestor_type : '',
        processing_time: formData.processing_time,
        request_ids: requestIds
      }, getAuthHeaders());

      const { created_count, error_count } = response.data;

      if (error_count > 0) {
        toast.error(`${created_count} entries created, ${error_count} failed`);
      } else {
        toast.success(`Batch submitted! ${created_count} entries created successfully.`);
      }

      // Reset batch IDs for another round (keep shared fields)
      setBatchRequestIds(Array(batchSize).fill(''));
      setShowBatchWarning(false);

      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create batch entries');
    } finally {
      setBatchSubmitting(false);
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
      toast.error('Please enter a change reason');
      return;
    }
    
    try {
      await axios.put(`${API_URL}/mro-daily-allocations/${editingId}`, {
        ...editData,
        change_reason: changeReason
      }, getAuthHeaders());
      
      cancelEdit();
      toast.success('Entry updated successfully');
      if (onRefresh) onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update entry');
    }
  };

  // Delete request
  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      toast.error('Please enter a delete reason');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/mro-daily-allocations/${showDeleteModal}/request-delete`, {
        delete_reason: deleteReason
      }, getAuthHeaders());
      
      setShowDeleteModal(null);
      setDeleteReason('');
      if (onRefresh) onRefresh();
      toast.success('Delete request submitted for admin approval');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit delete request');
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
    pending: pendingLocations.length,
    todaysEntries: allocations.length,
    totalAssigned: allAssignedLocations.length,
    locationsLogged: allAssignedLocations.length - pendingLocations.length
  }), [pendingLocations, allocations, allAssignedLocations]);

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="flex flex-wrap gap-3">
        <div className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
          Pending Locations: {stats.pending}
        </div>
        <div className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
          Today's Entries: {stats.todaysEntries}
        </div>
        <div className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-xs font-medium">
          Locations Logged: {stats.locationsLogged}/{stats.totalAssigned}
        </div>
        <div className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
          Total Assigned: {stats.totalAssigned}
        </div>
      </div>

      {/* Info about multiple entries */}
      {stats.locationsLogged > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-700 text-xs">
          💡 <strong>Tip:</strong> You can add multiple Request IDs per location. 
          {stats.pending > 0 && ` ${stats.pending} location(s) still need at least one entry.`}
          {stats.pending === 0 && ' All locations have at least one entry!'}
        </div>
      )}

      {/* No Locations Warning */}
      {allAssignedLocations.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <p className="text-sm font-medium">⚠️ No locations available for this date</p>
          <p className="text-xs mt-1">
            You may not have any locations assigned that are effective on or before {selectedDate}.
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
          {allAssignedLocations.length === 0 ? (
            <div className="text-center py-4 text-yellow-600">
              <p className="text-sm">⚠️ No locations are assigned to you for this date.</p>
              <p className="text-xs mt-1">Try selecting a more recent date.</p>
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
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assigner Name</label>
                  <input type="text" value={resourceInfo?.name || ''} readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Process <span className="text-red-500">*</span></label>
                  <select
                    value={formData.selectedProcess}
                    onChange={(e) => handleProcessChange(e.target.value)}
                    disabled={isBatchMode}
                    className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 ${isBatchMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">-- Select --</option>
                    {uniqueProcessTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location <span className="text-red-500">*</span></label>
                  <select
                    value={formData.subproject_id}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    disabled={isBatchMode || !formData.selectedProcess}
                    className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 ${isBatchMode || !formData.selectedProcess ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">{formData.selectedProcess ? '-- Select --' : 'Select process first'}</option>
                    {availableLocations.map(loc => (
                      <option key={loc.subproject_id} value={loc.subproject_id}>
                        {loc.subproject_name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                  <input 
                    type="text" 
                    value={formData.facility_name} 
                    onChange={(e) => setFormData(prev => ({ ...prev, facility_name: e.target.value }))} 
                    placeholder="Free text" 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500" 
                  />
                </div>
                
                {!isBatchMode && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Request ID <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={formData.request_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, request_id: e.target.value }))}
                    placeholder="Enter ID"
                    className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-green-500 ${requestIdWarning ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'}`}
                  />
                  {requestIdWarning && <p className="text-[10px] text-yellow-600 mt-0.5">⚠️ Suggest: {requestIdWarning.suggested_type}</p>}
                </div>
                )}
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Request Type <span className="text-red-500">*</span></label>
                  <select
                    value={formData.request_type}
                    onChange={(e) => setFormData(prev => ({ ...prev, request_type: e.target.value }))}
                    disabled={isBatchMode}
                    className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 ${isBatchMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  >
                    <option value="">-- Select --</option>
                    {MRO_REQUEST_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Requestor Type {isProcessingType && <span className="text-red-500">*</span>}</label>
                  {isProcessingType ? (
                    <select
                      value={formData.requestor_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, requestor_type: e.target.value }))}
                      disabled={isBatchMode}
                      className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 ${isBatchMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    >
                      <option value="">-- Select --</option>
                      {MRO_REQUESTOR_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                  ) : (
                    <input type="text" value="N/A" readOnly className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-100 text-gray-500" />
                  )}
                </div>
              </div>
              
              {/* Batch Entry Section */}
              {isBatchMode && (
                <div className="mb-3 border border-purple-200 rounded-lg p-3 bg-purple-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-purple-800">Batch Entry Mode</h4>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-purple-700">Batch Size:</label>
                      <div className="flex items-center">
                        {batchSize > 10 && (
                          <button
                            onClick={() => {
                              const newSize = batchSize - 1;
                              setBatchSize(newSize);
                              setBatchRequestIds(prev => prev.slice(0, newSize));
                            }}
                            className="px-1.5 py-1 text-xs bg-purple-200 text-purple-800 rounded-l border border-purple-300 hover:bg-purple-300 font-bold"
                          >
                            −
                          </button>
                        )}
                        <select
                          value={[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].includes(batchSize) ? batchSize : ''}
                          onChange={(e) => {
                            const newSize = parseInt(e.target.value);
                            setBatchSize(newSize);
                            setBatchRequestIds(prev => {
                              if (newSize > prev.length) {
                                return [...prev, ...Array(newSize - prev.length).fill('')];
                              }
                              return prev.slice(0, newSize);
                            });
                          }}
                          className={`px-2 py-1 text-xs border-t border-b border-purple-300 text-center w-16 ${batchSize <= 10 ? 'rounded-l border-l' : ''}`}
                        >
                          {![10, 20, 30, 40, 50, 60, 70, 80, 90, 100].includes(batchSize) && (
                            <option value="">{batchSize}</option>
                          )}
                          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => {
                            const newSize = Math.min(200, batchSize + 1);
                            setBatchSize(newSize);
                            setBatchRequestIds(prev => [...prev, '']);
                          }}
                          disabled={batchSize >= 200}
                          className="px-1.5 py-1 text-xs bg-purple-200 text-purple-800 rounded-r border border-purple-300 hover:bg-purple-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setIsBatchMode(false);
                          setBatchRequestIds(Array(10).fill(''));
                          setBatchSize(10);
                        }}
                        className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel Batch
                      </button>
                    </div>
                  </div>

                  {/* Shared fields summary */}
                  <div className="flex flex-wrap gap-2 mb-3 text-[10px] text-purple-700">
                    <span className="bg-purple-100 px-2 py-0.5 rounded">Date: {formDate}</span>
                    <span className="bg-purple-100 px-2 py-0.5 rounded">Location: {selectedLocationInfo?.subproject_name}</span>
                    <span className="bg-purple-100 px-2 py-0.5 rounded">Process: {selectedLocationInfo?.project_name}</span>
                    <span className="bg-purple-100 px-2 py-0.5 rounded">Request Type: {formData.request_type}</span>
                    <span className="bg-purple-100 px-2 py-0.5 rounded">Requestor Type: {formData.requestor_type}</span>
                    {formData.facility_name && (
                      <span className="bg-purple-100 px-2 py-0.5 rounded">Facility: {formData.facility_name}</span>
                    )}
                  </div>

                  {/* Batch Request ID Table */}
                  <div className="max-h-80 overflow-y-auto border border-purple-200 rounded">
                    <table className="min-w-full text-xs">
                      <thead className="bg-purple-100 text-purple-800 sticky top-0">
                        <tr>
                          <th className="px-3 py-1.5 text-left w-16">S.No</th>
                          <th className="px-3 py-1.5 text-left">Request ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchRequestIds.map((rid, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/50'}>
                            <td className="px-3 py-1 font-medium text-purple-700">{idx + 1}</td>
                            <td className="px-3 py-1">
                              <input
                                type="text"
                                value={rid}
                                onChange={(e) => {
                                  const updated = [...batchRequestIds];
                                  updated[idx] = e.target.value;
                                  setBatchRequestIds(updated);
                                }}
                                placeholder={`Enter Request ID ${idx + 1}`}
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add More Rows */}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (batchRequestIds.length < 100) {
                          const rowsToAdd = Math.min(10, 100 - batchRequestIds.length);
                          setBatchRequestIds(prev => [...prev, ...Array(rowsToAdd).fill('')]);
                          setBatchSize(prev => Math.min(prev + rowsToAdd, 100));
                        }
                      }}
                      disabled={batchRequestIds.length >= 100}
                      className="px-3 py-1 text-xs bg-purple-200 text-purple-700 rounded hover:bg-purple-300 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      + Add 10 More Rows
                    </button>
                    <span className="text-[10px] text-purple-600">
                      {batchRequestIds.filter(r => r.trim() !== '').length} of {batchRequestIds.length} filled
                    </span>
                  </div>
                </div>
              )}

              {/* Form Row 2 */}
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Proc. Time</label>
                  <input
                    type="text"
                    value={formData.processing_time}
                    onChange={(e) => setFormData(prev => ({ ...prev, processing_time: e.target.value }))}
                    placeholder="Optional"
                    disabled={isBatchMode}
                    className={`w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 ${isBatchMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                </div>

                {isBatchMode ? (
                  <button
                    onClick={handleBatchSubmit}
                    disabled={batchSubmitting || !formData.subproject_id || !formData.request_type || !dateValidation.valid}
                    className="px-4 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {batchSubmitting ? 'Submitting Batch...' : `Submit Batch (${batchRequestIds.filter(r => r.trim()).length} entries)`}
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !formData.subproject_id || !formData.request_type || !formData.request_id || !dateValidation.valid}
                    className="px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Entry'}
                  </button>
                )}

                {!isBatchMode && (
                  <button
                    onClick={() => {
                      setIsBatchMode(true);
                      setBatchSize(10);
                      setBatchRequestIds(Array(10).fill(''));
                    }}
                    disabled={!formData.subproject_id || !formData.request_type || !dateValidation.valid || (isProcessingType && !formData.requestor_type)}
                    className="px-4 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Create Batch
                  </button>
                )}

                {(formData.subproject_id || formData.selectedProcess) && (
                  <button
                    onClick={() => {
                      setFormData({
                        selectedProcess: '',
                        subproject_id: '',
                        facility_name: '',
                        request_id: '',
                        request_type: '',
                        requestor_type: '',
                        processing_time: ''
                      });
                      setSelectedLocationInfo(null);
                      setIsBatchMode(false);
                      setBatchRequestIds(Array(10).fill(''));
                      setBatchSize(10);
                    }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300"
                  >
                    Clear
                  </button>
                )}
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
                          {isEditing ? (
                            <input type="text" value={editData.facility_name} onChange={(e) => setEditData(prev => ({ ...prev, facility_name: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" />
                          ) : (alloc.facility_name || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input type="text" value={editData.request_id} onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" />
                          ) : (alloc.request_id || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select value={editData.request_type} onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">
                              {MRO_REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : alloc.request_type}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {alloc.process_type !== 'Processing' ? (
                            <span className="text-gray-400">N/A</span>
                          ) : isEditing ? (
                            <select value={editData.requestor_type} onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))} className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded">
                              <option value="">--</option>
                              {MRO_REQUESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          ) : (alloc.requestor_type || '-')}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {locked ? (
                            <span className="text-gray-400 text-[10px]">🔒 Locked</span>
                          ) : isEditing ? (
                            <div className="flex gap-1 justify-center">
                              <button onClick={saveEdit} className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded hover:bg-green-600">Save</button>
                              <button onClick={cancelEdit} className="px-1.5 py-0.5 text-[10px] bg-gray-400 text-white rounded hover:bg-gray-500">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => startEdit(alloc)} className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600">Edit</button>
                              <button onClick={() => setShowDeleteModal(alloc._id)} disabled={alloc.has_pending_delete_request} className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300">Del</button>
                            </div>
                          )}
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

      {/* Batch Warning Modal */}
      {showBatchWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <h3 className="text-sm font-semibold text-yellow-800 mb-3">Some fields are not filled</h3>
            <p className="text-xs text-gray-600 mb-3">
              {batchRequestIds.filter(id => id.trim() === '').length} out of {batchRequestIds.length} Request ID fields are empty.
              Only filled entries will be submitted.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowBatchWarning(false)}
                className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600"
              >
                Fill
              </button>
              <button
                onClick={() => submitBatch(batchRequestIds)}
                disabled={batchSubmitting}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
              >
                {batchSubmitting ? 'Submitting...' : 'Continue to Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-96 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Request Deletion</h3>
            <p className="text-xs text-gray-600 mb-3">Your delete request will be sent to an admin for approval.</p>
            <textarea 
              value={deleteReason} 
              onChange={(e) => setDeleteReason(e.target.value)} 
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded" 
              rows={3} 
              placeholder="Enter delete reason (required)" 
            />
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