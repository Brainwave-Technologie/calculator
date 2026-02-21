// src/components/resourcesDashboard/Verisma/VerismaAllocationPanel.jsx
// UPDATED: 
// - Fixed date validation to use local date comparison
// - Allows multiple entries per location per day (same Request ID logic)
// - CHANGED ORDER: Process dropdown first, then Location filtered by Process
// - "Pending" = locations not yet logged for this selected date
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
const API_URL = import.meta.env.VITE_BACKEND_URL;

// Verisma Dropdown Options
const VERISMA_REQUEST_TYPES = ['New Request', 'Duplicate', 'Key'];
const VERISMA_REQUESTOR_TYPES = [
  'Disability', 'Government', 'In Payment', 'Insurance', 'Legal', 
  'Other billable', 'Other', 'Non-Billable', 'Patient', 'Post payment', 
  'Provider', 'Service'
];

const VerismaAllocationPanel = ({ 
  locations = [],  // DATE-FILTERED locations from parent
  selectedDate, 
  resourceInfo, 
  geographyId,
  geographyName,
  allocations = [],  // Allocations for selectedDate
  onRefresh,
  loading 
}) => {
  // Form state - UPDATED: Added selectedProcess
  const [formData, setFormData] = useState({
    selectedProcess: '',  // NEW: Process selection first
    subproject_id: '',
    facility: '',
    request_id: '',
    request_type: '',
    requestor_type: '',
    bronx_care_processing_time: '',
    count: 1,
    remark: ''
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

  // ═══════════════════════════════════════════════════════════════
  // GET UNIQUE PROCESSES (for Process dropdown)
  // ═══════════════════════════════════════════════════════════════
  const availableProcesses = useMemo(() => {
    const processMap = new Map();
    
    allAssignedLocations.forEach(loc => {
      if (loc.project_id && loc.project_name) {
        processMap.set(loc.project_id, {
          project_id: loc.project_id,
          project_name: loc.project_name
        });
      }
    });
    
    return Array.from(processMap.values()).sort((a, b) => 
      a.project_name.localeCompare(b.project_name)
    );
  }, [allAssignedLocations]);

  // ═══════════════════════════════════════════════════════════════
  // LOCATIONS FILTERED BY SELECTED PROCESS
  // ═══════════════════════════════════════════════════════════════
  const locationsForSelectedProcess = useMemo(() => {
    if (!formData.selectedProcess) {
      return [];
    }
    
    return allAssignedLocations.filter(loc => 
      loc.project_id === formData.selectedProcess
    );
  }, [allAssignedLocations, formData.selectedProcess]);

  // ═══════════════════════════════════════════════════════════════
  // PENDING LOCATIONS: Locations that have NO entries for selected date
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

  // ═══════════════════════════════════════════════════════════════
  // FIXED DATE VALIDATION - Using local date string comparison
  // ═══════════════════════════════════════════════════════════════
  const dateValidation = useMemo(() => {
    if (!selectedDate) return { valid: false, message: 'No date selected' };
    
    // Get today's date in YYYY-MM-DD format (local time)
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA'); // Returns YYYY-MM-DD format
    
    // selectedDate is already in YYYY-MM-DD format
    const selectedStr = selectedDate;
    
    // String comparison works for YYYY-MM-DD format
    if (selectedStr > todayStr) {
      return { valid: false, message: 'Cannot log entries for future dates' };
    }
    
    // Check if month is locked (past month-end)
    const selected = new Date(selectedDate + 'T00:00:00');
    const lastDayOfMonth = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    const lastDayStr = lastDayOfMonth.toLocaleDateString('en-CA');
    
    if (todayStr > lastDayStr) {
      return { valid: false, message: 'This month is locked. Cannot add new entries.' };
    }
    
    return { valid: true, message: null };
  }, [selectedDate]);

  // ═══════════════════════════════════════════════════════════════
  // HANDLE PROCESS CHANGE - Reset location when process changes
  // ═══════════════════════════════════════════════════════════════
  const handleProcessChange = (projectId) => {
    setFormData(prev => ({
      ...prev,
      selectedProcess: projectId,
      subproject_id: '' // Reset location when process changes
    }));
    setSelectedLocationInfo(null);
  };

  // Handle location selection
  const handleLocationChange = (subprojectId) => {
    const location = locationsForSelectedProcess.find(l => l.subproject_id === subprojectId);
    setSelectedLocationInfo(location);
    
    setFormData(prev => ({
      ...prev,
      subproject_id: subprojectId
    }));
  };

  // Check Request ID for duplicates
  const checkRequestId = async (requestId) => {
    if (!requestId || requestId.trim() === '') {
      setRequestIdWarning(null);
      return;
    }
    
    try {
      const response = await axios.get(`${API_URL}/verisma-daily-allocations/check-request-id`, {
        ...getAuthHeaders(),
        params: { request_id: requestId }
      });
      
      if (response.data.exists && response.data.has_new_request) {
        setRequestIdWarning({
          message: `This Request ID already has a "New Request" entry`,
          suggested_type: response.data.suggested_type
        });
        // Auto-select suggested type
        if (formData.request_type === 'New Request' || formData.request_type === '') {
          setFormData(prev => ({ ...prev, request_type: response.data.suggested_type }));
        }
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
      if (formData.request_id) {
        checkRequestId(formData.request_id);
      } else {
        setRequestIdWarning(null);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formData.request_id]);

  // Submit new entry
  const handleSubmit = async () => {
    if (!formData.selectedProcess) {
      toast.error('Please select a Process');
      return;
    }
    
    if (!formData.subproject_id) {
      toast.error('Please select a Location');
      return;
    }
    
    if (!formData.request_id || formData.request_id.trim() === '') {
      toast.error('Please enter Request ID');
      return;
    }
    
    if (!formData.request_type) {
      toast.error('Please select Request Type');
      return;
    }
    
    if (!formData.requestor_type) {
      toast.error('Please select Requestor Type');
      return;
    }
    
    if (!dateValidation.valid) {
      toast.error(dateValidation.message);
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
      await axios.post(`${API_URL}/verisma-daily-allocations`, {
        subproject_id: formData.subproject_id,
        allocation_date: selectedDate,
        facility: formData.facility,
        request_id: formData.request_id.trim(),
        request_type: formData.request_type,
        requestor_type: formData.requestor_type,
        bronx_care_processing_time: formData.bronx_care_processing_time,
        count: parseInt(formData.count) || 1,
        remark: formData.remark,
        geography_id: selectedLocationInfo?.geography_id || geographyId,
        geography_name: selectedLocationInfo?.geography_name || geographyName
      }, getAuthHeaders());
      
      toast.success('Entry submitted successfully!');
      
      // Reset form but KEEP the selected process and location for quick additional entries
      setFormData(prev => ({
        ...prev,
        facility: '',
        request_id: '',
        request_type: '',
        requestor_type: '',
        bronx_care_processing_time: '',
        count: 1,
        remark: ''
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

  // Edit functions
  const startEdit = (allocation) => {
    setEditingId(allocation._id);
    setEditData({
      facility: allocation.facility || '',
      request_id: allocation.request_id || '',
      request_type: allocation.request_type || '',
      requestor_type: allocation.requestor_type || '',
      bronx_care_processing_time: allocation.bronx_care_processing_time || '',
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
      toast.error('Please enter a change reason');
      return;
    }
    
    try {
      await axios.put(`${API_URL}/verisma-daily-allocations/${editingId}`, {
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
      await axios.post(`${API_URL}/verisma-daily-allocations/${showDeleteModal}/request-delete`, {
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
    
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');
    const lastDayStr = lastDayOfMonth.toLocaleDateString('en-CA');
    
    return todayStr > lastDayStr;
  };

  // Stats
  const stats = useMemo(() => {
    const totalCount = allocations.reduce((sum, a) => sum + (a.count || 1), 0);
    return {
      pending: pendingLocations.length,
      todaysEntries: allocations.length,
      totalCount: totalCount,
      totalAssigned: allAssignedLocations.length,
      locationsLogged: allAssignedLocations.length - pendingLocations.length
    };
  }, [pendingLocations, allocations, allAssignedLocations]);

  // Get process name for selected process
  const selectedProcessName = useMemo(() => {
    if (!formData.selectedProcess) return '';
    const proc = availableProcesses.find(p => p.project_id === formData.selectedProcess);
    return proc?.project_name || '';
  }, [formData.selectedProcess, availableProcesses]);

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
        <div className="px-4 py-2 bg-emerald-600 text-white">
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
              {/* Form Row 1 - REORDERED: Process before Location */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Date</label>
                  <input 
                    type="text" 
                    value={selectedDate} 
                    readOnly 
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" 
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Resource Name</label>
                  <input 
                    type="text" 
                    value={resourceInfo?.name || ''} 
                    readOnly 
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" 
                  />
                </div>
                
                {/* PROCESS DROPDOWN - NOW FIRST */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Process <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={formData.selectedProcess} 
                    onChange={(e) => handleProcessChange(e.target.value)} 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Select Process --</option>
                    {availableProcesses.map(proc => (
                      <option key={proc.project_id} value={proc.project_id}>
                        {proc.project_name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* LOCATION DROPDOWN - NOW SECOND, FILTERED BY PROCESS */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Location <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={formData.subproject_id} 
                    onChange={(e) => handleLocationChange(e.target.value)} 
                    disabled={!formData.selectedProcess}
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {formData.selectedProcess ? '-- Select Location --' : '-- Select Process First --'}
                    </option>
                    {locationsForSelectedProcess.map(loc => {
                      const entryCount = entriesPerLocation[loc.subproject_id?.toString()] || 0;
                      return (
                        <option key={loc.subproject_id} value={loc.subproject_id}>
                          {loc.subproject_name} {entryCount > 0 ? `(${entryCount} entries)` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {formData.selectedProcess && locationsForSelectedProcess.length === 0 && (
                    <p className="text-[10px] text-orange-600 mt-0.5">
                      No locations for this process
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                  <input 
                    type="text" 
                    value={formData.facility} 
                    onChange={(e) => setFormData(prev => ({ ...prev, facility: e.target.value }))} 
                    placeholder="Free text" 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500" 
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Request ID <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    value={formData.request_id} 
                    onChange={(e) => setFormData(prev => ({ ...prev, request_id: e.target.value }))} 
                    placeholder="Enter ID" 
                    className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-emerald-500 ${
                      requestIdWarning ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
                    }`} 
                  />
                  {requestIdWarning && (
                    <p className="text-[10px] text-yellow-600 mt-0.5">
                      ⚠️ Suggest: {requestIdWarning.suggested_type}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Request Type <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={formData.request_type} 
                    onChange={(e) => setFormData(prev => ({ ...prev, request_type: e.target.value }))} 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Select --</option>
                    {VERISMA_REQUEST_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Requestor Type <span className="text-red-500">*</span>
                  </label>
                  <select 
                    value={formData.requestor_type} 
                    onChange={(e) => setFormData(prev => ({ ...prev, requestor_type: e.target.value }))} 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">-- Select --</option>
                    {VERISMA_REQUESTOR_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Form Row 2 */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
                  <input 
                    type="text" 
                    value={formData.remark} 
                    onChange={(e) => setFormData(prev => ({ ...prev, remark: e.target.value }))} 
                    placeholder="Optional" 
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-emerald-500" 
                  />
                </div>
                
                <div className="col-span-2 lg:col-span-6 flex justify-end gap-2">
                  <button 
                    onClick={handleSubmit} 
                    disabled={submitting || !formData.selectedProcess || !formData.subproject_id || !formData.request_type || !formData.requestor_type || !formData.request_id?.trim() || !dateValidation.valid} 
                    className="px-6 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit Entry'}
                  </button>
                  
                  {(formData.selectedProcess || formData.subproject_id) && (
                    <button 
                      onClick={() => {
                        setFormData({
                          selectedProcess: '',
                          subproject_id: '',
                          facility: '',
                          request_id: '',
                          request_type: '',
                          requestor_type: '',
                          bronx_care_processing_time: '',
                          count: 1,
                          remark: ''
                        });
                        setSelectedLocationInfo(null);
                      }}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
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
                  <th className="px-2 py-2 text-left font-semibold border-r">Process</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Location</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Facility</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Request ID</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Request Type</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Requestor Type</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Remark</th>
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
                        <td className="px-2 py-1.5 border-r">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                            {alloc.process || alloc.project_name}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 border-r font-medium">{alloc.subproject_name}</td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.facility} 
                              onChange={(e) => setEditData(prev => ({ ...prev, facility: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.facility || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.request_id} 
                              onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.request_id || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select 
                              value={editData.request_type} 
                              onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                            >
                              {VERISMA_REQUEST_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              alloc.request_type === 'New Request' ? 'bg-emerald-100 text-emerald-700' :
                              alloc.request_type === 'Duplicate' ? 'bg-orange-100 text-orange-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {alloc.request_type}
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select 
                              value={editData.requestor_type} 
                              onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                            >
                              <option value="">--</option>
                              {VERISMA_REQUESTOR_TYPES.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          ) : (alloc.requestor_type || '-')}
                        </td>
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.remark} 
                              onChange={(e) => setEditData(prev => ({ ...prev, remark: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.remark || '-')}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {locked ? (
                            <span className="text-gray-400 text-[10px]">🔒 Locked</span>
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
                                disabled={alloc.has_pending_delete_request} 
                                className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-300"
                              >
                                Del
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      
                      {isEditing && (
                        <tr className="bg-yellow-50">
                          <td colSpan={9} className="px-4 py-2">
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

export default VerismaAllocationPanel;