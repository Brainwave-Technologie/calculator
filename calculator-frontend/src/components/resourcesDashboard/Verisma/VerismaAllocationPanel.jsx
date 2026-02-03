// src/components/resourcesDashboard/Verisma/VerismaAllocationPanel.jsx
// Updated with all Excel fields: Allocation Date, Assigner Name, Process, Location, Facility, 
// Request ID, Request Type, Requestor Type, Bronx Care Processing Time
// Request ID validation: "New Request" can only be used ONCE per Request ID
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL

// Verisma Dropdown Options
const REQUEST_TYPES = ['', 'New Request', 'Duplicate', 'Key'];
const REQUESTOR_TYPES = [
  '',
  'Disability',
  'Government',
  'In Payment',
  'Insurance',
  'Legal',
  'Other billable',
  'Other',
  'Non-Billable',
  'Patient',
  'Post payment',
  'Provider',
  'Service'
];

const VerismaAllocationPanel = ({ 
  locations, 
  selectedDate, 
  resourceInfo, 
  geographyId, 
  geographyName, 
  allocations, 
  onRefresh, 
  loading 
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    process: '',
    location_id: '',
    facility: '',
    request_id: '',
    request_type: '',
    requestor_type: '',
    bronx_care_processing_time: '',
    remark: ''
  });
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeNotes, setChangeNotes] = useState('');
  const [requestIdWarning, setRequestIdWarning] = useState(null);
  const [requestIdChecking, setRequestIdChecking] = useState(false);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Flatten locations into dropdown options
  const locationOptions = useMemo(() => {
    const options = [];
    locations.forEach(assignment => {
      assignment.subprojects?.forEach(sp => {
        options.push({
          id: sp.subproject_id,
          name: sp.subproject_name,
          subproject_key: sp.subproject_key,
          project_id: assignment.project_id,
          project_name: assignment.project_name,
          client_id: assignment.client_id,
          client_name: assignment.client_name
        });
      });
    });
    return options;
  }, [locations]);

  // Get unique process types from locations
  const processOptions = useMemo(() => {
    const processes = new Set();
    locations.forEach(assignment => {
      if (assignment.project_name) {
        processes.add(assignment.project_name);
      }
    });
    return ['', ...Array.from(processes)];
  }, [locations]);

  // Filter locations by selected process
  const filteredLocationOptions = useMemo(() => {
    if (!formData.process) return locationOptions;
    return locationOptions.filter(loc => loc.project_name === formData.process);
  }, [locationOptions, formData.process]);

  const selectedLocation = useMemo(() => {
    return locationOptions.find(loc => loc.id === formData.location_id);
  }, [locationOptions, formData.location_id]);

  const handleFormChange = (field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Reset location if process changes
      if (field === 'process') {
        newData.location_id = '';
      }
      
      return newData;
    });
    
    // Clear warning when request_id or request_type changes
    if (field === 'request_id' || field === 'request_type') {
      setRequestIdWarning(null);
    }
  };

  // Check if Request ID exists in ANY previous logs (all time, not just today)
  const checkRequestId = async () => {
    const requestId = formData.request_id?.trim();
    
    // Skip check if no request ID entered
    if (!requestId) {
      setRequestIdWarning(null);
      return { exists: false, canUseNewRequest: true };
    }
    
    setRequestIdChecking(true);
    
    try {
      const response = await axios.get(
        `${API_URL}/verisma-daily-allocations/check-request-id`,
        { 
          ...getAuthHeaders(), 
          params: { request_id: requestId } 
        }
      );
      
      const { exists, has_new_request, suggested_type, existing_entries } = response.data;
      
      if (exists) {
        if (has_new_request) {
          // Request ID already has a "New Request" entry - MUST use Duplicate or Key
          setRequestIdWarning({
            type: 'error',
            message: `Request ID "${requestId}" already has a "New Request" entry. You must use "${suggested_type}" for subsequent entries.`,
            suggestedType: suggested_type,
            existingEntries: existing_entries,
            canUseNewRequest: false
          });
          
          // Auto-set to suggested type if user selected "New Request"
          if (formData.request_type === 'New Request') {
            setFormData(prev => ({ ...prev, request_type: suggested_type }));
          }
          
          return { exists: true, canUseNewRequest: false };
        } else {
          // Request ID exists but no "New Request" yet - can still use "New Request"
          setRequestIdWarning({
            type: 'info',
            message: `Request ID "${requestId}" found in previous entries but has no "New Request". You can use "New Request" or "${suggested_type}".`,
            suggestedType: suggested_type,
            existingEntries: existing_entries,
            canUseNewRequest: true
          });
          return { exists: true, canUseNewRequest: true };
        }
      }
      
      // Request ID doesn't exist - first entry, should use "New Request"
      setRequestIdWarning(null);
      return { exists: false, canUseNewRequest: true };
      
    } catch (error) {
      console.error('Error checking request ID:', error);
      return { exists: false, canUseNewRequest: true };
    } finally {
      setRequestIdChecking(false);
    }
  };

  // Validate before submit
  const validateSubmission = async () => {
    if (!formData.location_id) {
      alert('Please select a Location');
      return false;
    }
    if (!formData.request_type) {
      alert('Please select Request Type');
      return false;
    }
    
    const requestId = formData.request_id?.trim();
    
    // If Request ID is provided, validate it
    if (requestId) {
      const checkResult = await checkRequestId();
      
      // If trying to use "New Request" but it's not allowed
      if (formData.request_type === 'New Request' && !checkResult.canUseNewRequest) {
        alert(`Cannot use "New Request" for Request ID "${requestId}". This Request ID already has a "New Request" entry. Please use "Duplicate" or "Key".`);
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async () => {
    const isValid = await validateSubmission();
    if (!isValid) return;

    setSubmitting(true);

    try {
      await axios.post(
        `${API_URL}/verisma-daily-allocations`,
        {
          subproject_id: formData.location_id,
          allocation_date: selectedDate,
          process: formData.process || selectedLocation?.project_name || '',
          facility: formData.facility || '',
          request_id: formData.request_id?.trim() || '',
          request_type: formData.request_type,
          requestor_type: formData.requestor_type || '',
          bronx_care_processing_time: formData.bronx_care_processing_time || '',
          remark: formData.remark || '',
          geography_id: geographyId,
          geography_name: geographyName
        },
        getAuthHeaders()
      );

      // Reset form
      setFormData({
        process: '',
        location_id: '',
        facility: '',
        request_id: '',
        request_type: '',
        requestor_type: '',
        bronx_care_processing_time: '',
        remark: ''
      });
      setRequestIdWarning(null);
      onRefresh();
      
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add entry');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (allocation) => {
    setEditingId(allocation._id);
    setEditData({
      process: allocation.process || '',
      facility: allocation.facility || '',
      request_id: allocation.request_id || '',
      request_type: allocation.request_type || '',
      requestor_type: allocation.requestor_type || '',
      bronx_care_processing_time: allocation.bronx_care_processing_time || '',
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
        `${API_URL}/verisma-daily-allocations/${editingId}`,
        { 
          ...editData, 
          change_reason: changeReason, 
          change_notes: changeNotes 
        },
        getAuthHeaders()
      );
      cancelEdit();
      onRefresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update entry');
    }
  };

  const submitDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      alert('Please enter a delete reason');
      return;
    }
    
    try {
      await axios.post(
        `${API_URL}/verisma-daily-allocations/${showDeleteModal}/request-delete`,
        { delete_reason: deleteReason },
        getAuthHeaders()
      );
      setShowDeleteModal(null);
      setDeleteReason('');
      onRefresh();
      alert('Delete request submitted for admin approval');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit delete request');
    }
  };

  const todaysEntries = useMemo(() => {
    const today = new Date(selectedDate);
    today.setHours(0, 0, 0, 0);
    return allocations.filter(a => {
      const allocDate = new Date(a.allocation_date);
      allocDate.setHours(0, 0, 0, 0);
      return allocDate.getTime() === today.getTime();
    });
  }, [allocations, selectedDate]);

  const totalCount = todaysEntries.length;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="flex gap-3 text-xs">
        <div className="bg-orange-50 border border-orange-200 px-3 py-1.5 rounded">
          <span className="text-orange-700">Pending: <strong>{filteredLocationOptions.length}</strong></span>
        </div>
        <div className="bg-green-50 border border-green-200 px-3 py-1.5 rounded">
          <span className="text-green-700">Today's Entries: <strong>{todaysEntries.length}</strong></span>
        </div>
        <div className="bg-blue-50 border border-blue-200 px-3 py-1.5 rounded">
          <span className="text-blue-700">Total Count: <strong>{totalCount}</strong></span>
        </div>
      </div>

      {/* Single Entry Form */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-blue-600 text-white">
          <h3 className="text-sm font-semibold">➕ Add New Entry</h3>
        </div>

        <div className="p-4">
          {/* Row 1: Basic Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
            {/* Allocation Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Allocation Date</label>
              <input 
                type="text" 
                value={selectedDate} 
                readOnly 
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" 
              />
            </div>

            {/* Assigner Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigner Name</label>
              <input 
                type="text" 
                value={resourceInfo?.name || 'You'} 
                readOnly 
                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50" 
              />
            </div>

            {/* Process Dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Process</label>
              <select 
                value={formData.process} 
                onChange={(e) => handleFormChange('process', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- All --</option>
                {processOptions.filter(p => p).map(process => (
                  <option key={process} value={process}>{process}</option>
                ))}
              </select>
            </div>

            {/* Location Dropdown */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Location <span className="text-red-500">*</span>
              </label>
              <select 
                value={formData.location_id} 
                onChange={(e) => handleFormChange('location_id', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Select --</option>
                {filteredLocationOptions.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {formData.process ? '' : `(${loc.project_name})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Facility */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
              <input 
                type="text" 
                value={formData.facility} 
                onChange={(e) => handleFormChange('facility', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" 
                placeholder="Free Text" 
              />
            </div>

            {/* Request ID */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Request ID <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  type="text" 
                  value={formData.request_id} 
                  onChange={(e) => handleFormChange('request_id', e.target.value)} 
                  onBlur={checkRequestId}
                  className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 ${
                    requestIdWarning?.type === 'error' ? 'border-red-400 bg-red-50' : 
                    requestIdWarning?.type === 'info' ? 'border-yellow-400 bg-yellow-50' : 
                    'border-gray-300'
                  }`} 
                  placeholder="Enter ID" 
                />
                {requestIdChecking && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">...</span>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Request Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {/* Request Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Request Type <span className="text-red-500">*</span>
              </label>
              <select 
                value={formData.request_type} 
                onChange={(e) => handleFormChange('request_type', e.target.value)} 
                className={`w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-blue-500 ${
                  requestIdWarning?.type === 'error' && formData.request_type === 'New Request' 
                    ? 'border-red-400 bg-red-50' 
                    : 'border-gray-300'
                }`}
              >
                {REQUEST_TYPES.map(type => (
                  <option 
                    key={type} 
                    value={type}
                    disabled={type === 'New Request' && requestIdWarning?.canUseNewRequest === false}
                  >
                    {type || '-- Select --'}
                    {type === 'New Request' && requestIdWarning?.canUseNewRequest === false ? ' (Not Allowed)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Requestor Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Requestor Type <span className="text-red-500">*</span></label>
              <select 
                value={formData.requestor_type} 
                onChange={(e) => handleFormChange('requestor_type', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                {REQUESTOR_TYPES.map(type => (
                  <option key={type} value={type}>{type || '-- Select --'}</option>
                ))}
              </select>
            </div>

            {/* Bronx Care Processing Time */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bronx Care Processing Time</label>
              <input 
                type="text" 
                value={formData.bronx_care_processing_time} 
                onChange={(e) => handleFormChange('bronx_care_processing_time', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" 
                placeholder="e.g., 2h 30m" 
              />
            </div>

            {/* Remark */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
              <input 
                type="text" 
                value={formData.remark} 
                onChange={(e) => handleFormChange('remark', e.target.value)} 
                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500" 
                placeholder="Optional notes" 
              />
            </div>
          </div>

          {/* Request ID Warning/Info Box */}
          {requestIdWarning && (
            <div className={`mt-3 p-2 rounded text-xs ${
              requestIdWarning.type === 'error' 
                ? 'bg-red-50 border border-red-200 text-red-700' 
                : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
            }`}>
              <div className="flex items-start gap-2">
                <span>{requestIdWarning.type === 'error' ? '❌' : 'ℹ️'}</span>
                <div className="flex-1">
                  <p className="font-medium">{requestIdWarning.message}</p>
                  {requestIdWarning.existingEntries && requestIdWarning.existingEntries.length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] underline">
                        View {requestIdWarning.existingEntries.length} existing entries
                      </summary>
                      <ul className="mt-1 text-[10px] list-disc list-inside">
                        {requestIdWarning.existingEntries.slice(0, 5).map((entry, idx) => (
                          <li key={idx}>
                            {entry.request_type} - {entry.allocation_date} by {entry.resource_name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {requestIdWarning.suggestedType && requestIdWarning.type === 'error' && (
                    <button 
                      onClick={() => handleFormChange('request_type', requestIdWarning.suggestedType)} 
                      className="mt-1 px-2 py-0.5 bg-white border border-current rounded text-[10px] hover:bg-gray-50"
                    >
                      Use "{requestIdWarning.suggestedType}" instead
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-4 flex items-center gap-3">
            <button 
              onClick={handleSubmit} 
              disabled={submitting || !formData.location_id || !formData.request_type || !formData.request_id || !formData.requestor_type} 
              className={`px-4 py-1.5 text-xs font-medium rounded transition ${
                submitting || !formData.location_id || !formData.request_type 
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit Entry'}
            </button>
            
            {selectedLocation && (
              <span className="text-xs text-gray-500">
                📍 {selectedLocation.name} ({selectedLocation.project_name})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Today's Logged Entries */}
      {todaysEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2 bg-gray-700 text-white flex justify-between items-center">
            <h3 className="text-sm font-semibold">📝 Today's Logged Entries</h3>
            <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{todaysEntries.length} records</span>
          </div>

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
                  <th className="px-2 py-2 text-left font-semibold border-r">Bronx Care Time</th>
                  <th className="px-2 py-2 text-left font-semibold border-r">Remark</th>
                  <th className="px-2 py-2 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {todaysEntries.map((alloc, idx) => {
                  const isEditing = editingId === alloc._id;
                  
                  return (
                    <React.Fragment key={alloc._id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isEditing ? 'bg-yellow-50' : ''}`}>
                        <td className="px-2 py-1.5 font-medium border-r">{alloc.sr_no || idx + 1}</td>
                        
                        {/* Process */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.process || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, process: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.process || alloc.project_name || '-')}
                        </td>
                        
                        {/* Location */}
                        <td className="px-2 py-1.5 border-r font-medium">{alloc.subproject_name}</td>
                        
                        {/* Facility */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.facility || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, facility: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.facility || '-')}
                        </td>
                        
                        {/* Request ID */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.request_id || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, request_id: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.request_id || '-')}
                        </td>
                        
                        {/* Request Type */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select 
                              value={editData.request_type || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, request_type: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                            >
                              {REQUEST_TYPES.map(type => (
                                <option key={type} value={type}>{type || '--'}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              alloc.request_type === 'New Request' ? 'bg-green-100 text-green-700' :
                              alloc.request_type === 'Duplicate' ? 'bg-orange-100 text-orange-700' :
                              alloc.request_type === 'Key' ? 'bg-blue-100 text-blue-700' : ''
                            }`}>
                              {alloc.request_type}
                            </span>
                          )}
                        </td>
                        
                        {/* Requestor Type */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <select 
                              value={editData.requestor_type || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, requestor_type: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded"
                            >
                              {REQUESTOR_TYPES.map(type => (
                                <option key={type} value={type}>{type || '--'}</option>
                              ))}
                            </select>
                          ) : (alloc.requestor_type || '-')}
                        </td>
                        
                        {/* Bronx Care Processing Time */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.bronx_care_processing_time || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, bronx_care_processing_time: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.bronx_care_processing_time || '-')}
                        </td>
                        
                        {/* Remark */}
                        <td className="px-1 py-1 border-r">
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={editData.remark || ''} 
                              onChange={(e) => setEditData(prev => ({ ...prev, remark: e.target.value }))} 
                              className="w-full px-1 py-0.5 text-xs border border-yellow-400 rounded" 
                            />
                          ) : (alloc.remark || '-')}
                        </td>
                        
                        {/* Actions */}
                        <td className="px-2 py-1.5 text-center">
                          {!alloc.is_locked ? (
                            isEditing ? (
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
                                  {alloc.has_pending_delete_request ? '...' : 'Del'}
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="text-gray-400 text-[10px]">Locked</span>
                          )}
                        </td>
                      </tr>
                      
                      {/* Edit Reason Row */}
                      {isEditing && (
                        <tr className="bg-yellow-50">
                          <td colSpan={10} className="px-4 py-2">
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
                                <label className="block text-xs font-medium text-yellow-800 mb-1">Change Notes</label>
                                <input 
                                  type="text" 
                                  value={changeNotes} 
                                  onChange={(e) => setChangeNotes(e.target.value)} 
                                  className="w-full px-2 py-1.5 text-xs border border-yellow-400 rounded" 
                                  placeholder="Optional additional notes" 
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
        </div>
      )}

      {/* Empty State */}
      {todaysEntries.length === 0 && !loading && (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-500 text-sm">No entries logged for {selectedDate}</p>
          <p className="text-gray-400 text-xs mt-1">Use the form above to add your first entry</p>
        </div>
      )}

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

      {loading && (
        <div className="text-center py-4 text-gray-500 text-xs">Loading...</div>
      )}
    </div>
  );
};

export default VerismaAllocationPanel;