// src/components/resource/VerismaAllocationPanel.jsx
// Verisma allocation panel - Resources log entries from PENDING ASSIGNMENTS ONLY
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
const API_URL = import.meta.env.VITE_BACKEND_URL;

// Dropdown Options
const VERISMA_REQUEST_TYPES = ['New Request', 'Duplicate', 'Key'];
const VERISMA_REQUESTOR_TYPES = ['Disability', 'Government', 'In Payment', 'Insurance', 'Legal', 'Other billable', 'Other', 'Non-Billable', 'Patient', 'Post payment', 'Provider', 'Service'];

const VerismaAllocationPanel = ({ resourceInfo, onNavigateToPrevious }) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Pending assignments
  const [pendingAssignments, setPendingAssignments] = useState([]);
  const [hasPreviousPending, setHasPreviousPending] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState(null);
  
  // Today's logged entries
  const [todaysEntries, setTodaysEntries] = useState([]);
  
  // Selected assignment for entry
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [formData, setFormData] = useState({
    facility: '',
    request_id: '',
    request_type: '',
    requestor_type: '',
    bronx_care_processing_time: '',
    count: 1,
    remark: ''
  });
  
  // Request ID check
  const [requestIdWarning, setRequestIdWarning] = useState(null);
  const [checkingRequestId, setCheckingRequestId] = useState(false);

  const getAuthHeaders = () => ({ 
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } 
  });

  // ═══════════════════════════════════════════════════════════
  // FETCH DATA
  // ═══════════════════════════════════════════════════════════

  const fetchPendingAssignments = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_URL}/verisma-daily-allocations/pending-assignments`,
        getAuthHeaders()
      );
      
      setPendingAssignments(response.data.assignments || []);
      setHasPreviousPending(response.data.has_previous_pending || false);
      setBlockedMessage(response.data.blocked_message || null);
      
    } catch (error) {
      console.error('Error fetching pending:', error);
      setPendingAssignments([]);
    }
  }, []);

  const fetchTodaysEntries = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(
        `${API_URL}/verisma-daily-allocations/my-allocations?date=${today}`,
        getAuthHeaders()
      );
      setTodaysEntries(response.data.allocations || []);
    } catch (error) {
      console.error('Error fetching today entries:', error);
      setTodaysEntries([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPendingAssignments(), fetchTodaysEntries()]);
    setLoading(false);
  }, [fetchPendingAssignments, fetchTodaysEntries]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ═══════════════════════════════════════════════════════════
  // REQUEST ID CHECK
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!formData.request_id || formData.request_id.trim() === '') {
        setRequestIdWarning(null);
        return;
      }
      
      setCheckingRequestId(true);
      try {
        const response = await axios.get(
          `${API_URL}/verisma-daily-allocations/check-request-id?request_id=${encodeURIComponent(formData.request_id)}`,
          getAuthHeaders()
        );
        
        if (response.data.exists && response.data.has_new_request) {
          setRequestIdWarning({
            type: 'error',
            message: `This Request ID already has a "New Request". Use "${response.data.suggested_type}" instead.`,
            suggestedType: response.data.suggested_type
          });
          
          if (formData.request_type === 'New Request') {
            setFormData(prev => ({ ...prev, request_type: response.data.suggested_type }));
          }
        } else {
          setRequestIdWarning(null);
        }
      } catch (error) {
        console.error('Error checking request ID:', error);
      } finally {
        setCheckingRequestId(false);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formData.request_id, formData.request_type]);

  // ═══════════════════════════════════════════════════════════
  // FORM HANDLERS
  // ═══════════════════════════════════════════════════════════

  const handleSelectAssignment = (assignment) => {
    setSelectedAssignment(assignment);
    setFormData({
      facility: '',
      request_id: '',
      request_type: '',
      requestor_type: '',
      bronx_care_processing_time: '',
      count: 1,
      remark: ''
    });
    setRequestIdWarning(null);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedAssignment) {
      toast.error('Please select an assignment from the pending list');
      return;
    }
    
    if (!formData.request_type) {
      toast.error('Please select a request type');
      return;
    }
    
    if (formData.request_type === 'New Request' && requestIdWarning?.type === 'error') {
      toast.error('Cannot use "New Request" - this ID already has one.');
      return;
    }
    
    setSubmitting(true);
    try {
      const payload = {
        assignment_id: selectedAssignment._id,
        request_type: formData.request_type,
        requestor_type: formData.requestor_type || '',
        request_id: formData.request_id || '',
        facility: formData.facility || '',
        bronx_care_processing_time: formData.bronx_care_processing_time || '',
        count: parseInt(formData.count) || 1,
        remark: formData.remark || ''
      };
      
      const response = await axios.post(
        `${API_URL}/verisma-daily-allocations`,
        payload,
        getAuthHeaders()
      );
      
      if (response.data.success) {
        toast.success(`Entry logged! ${response.data.remaining_pending} assignments remaining.`);
        
        setSelectedAssignment(null);
        setFormData({
          facility: '',
          request_id: '',
          request_type: '',
          requestor_type: '',
          bronx_care_processing_time: '',
          count: 1,
          remark: ''
        });
        setRequestIdWarning(null);
        
        fetchData();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  
  // Group by date
  const assignmentsByDate = useMemo(() => {
    const grouped = {};
    pendingAssignments.forEach(a => {
      const dateKey = new Date(a.assignment_date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(a);
    });
    return grouped;
  }, [pendingAssignments]);
  
  const totalTodayCount = useMemo(() => 
    todaysEntries.reduce((sum, e) => sum + (e.count || 1), 0),
    [todaysEntries]
  );

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded">
            Pending: {pendingAssignments.length}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
            Today's Entries: {todaysEntries.length}
          </span>
          <span className="px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
            Total Count: {totalTodayCount}
          </span>
        </div>
        
        {onNavigateToPrevious && (
          <button onClick={onNavigateToPrevious} className="text-xs text-blue-600 hover:underline">
            View Previous →
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* BLOCKED MESSAGE */}
      {/* ═══════════════════════════════════════════════════════ */}
      {hasPreviousPending && blockedMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-semibold text-red-800">Action Required</h3>
              <p className="text-xs text-red-700 mt-1">{blockedMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PENDING ASSIGNMENTS */}
      {/* ═══════════════════════════════════════════════════════ */}
      {pendingAssignments.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2 bg-orange-600 text-white flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pending Assignments</h3>
            <span className="text-xs bg-orange-500 px-2 py-0.5 rounded">
              {pendingAssignments.length} location(s)
            </span>
          </div>
          
          <div className="p-4 space-y-3">
            {Object.entries(assignmentsByDate).map(([dateKey, assignments]) => (
              <div key={dateKey} className="border rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-gray-100 border-b flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">
                    {formatDate(dateKey)} — {assignments.length} location(s)
                  </span>
                  {new Date(dateKey) < new Date(new Date().toISOString().split('T')[0]) && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">
                      OVERDUE
                    </span>
                  )}
                </div>
                
                <div className="divide-y">
                  {assignments.map(assignment => (
                    <div
                      key={assignment._id}
                      className={`p-3 flex items-center justify-between cursor-pointer transition ${
                        selectedAssignment?._id === assignment._id
                          ? 'bg-emerald-50 border-l-4 border-emerald-500'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleSelectAssignment(assignment)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">
                            {assignment.subproject_name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                            {assignment.project_name}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {assignment.geography_name}
                        </div>
                      </div>
                      
                      {selectedAssignment?._id === assignment._id ? (
                        <span className="text-xs text-emerald-600 font-medium">Selected ✓</span>
                      ) : (
                        <span className="text-xs text-gray-400">Click to select</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No pending */}
      {pendingAssignments.length === 0 && !hasPreviousPending && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-400 text-3xl mb-2">✓</div>
          <h3 className="text-sm font-medium text-gray-700">No Pending Assignments</h3>
          <p className="text-xs text-gray-500 mt-1">All done! Check back later for new assignments.</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ENTRY FORM */}
      {/* ═══════════════════════════════════════════════════════ */}
      {selectedAssignment && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-4 py-2 bg-emerald-600 text-white">
            <h3 className="text-sm font-semibold">Log Entry: {selectedAssignment.subproject_name}</h3>
            <p className="text-[10px] text-emerald-100">
              Date: {formatDate(selectedAssignment.assignment_date)} | Process: {selectedAssignment.project_name}
            </p>
          </div>
          
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Facility</label>
                <input
                  type="text"
                  value={formData.facility}
                  onChange={(e) => handleFormChange('facility', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-emerald-500"
                  placeholder="Free Text"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Request ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.request_id}
                    onChange={(e) => handleFormChange('request_id', e.target.value)}
                    className={`w-full px-2 py-1.5 text-xs border rounded ${
                      requestIdWarning?.type === 'error' ? 'border-red-300' : ''
                    }`}
                    placeholder="Enter ID"
                  />
                  {checkingRequestId && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <div className="animate-spin h-3 w-3 border border-gray-400 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Request Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.request_type}
                  onChange={(e) => handleFormChange('request_type', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded"
                >
                  <option value="">-- Select --</option>
                  {VERISMA_REQUEST_TYPES.map(t => (
                    <option 
                      key={t} 
                      value={t}
                      disabled={t === 'New Request' && requestIdWarning?.type === 'error'}
                    >
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Requestor Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.requestor_type}
                  onChange={(e) => handleFormChange('requestor_type', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded"
                >
                  <option value="">-- Select --</option>
                  {VERISMA_REQUESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bronx Care Time</label>
                <input
                  type="text"
                  value={formData.bronx_care_processing_time}
                  onChange={(e) => handleFormChange('bronx_care_processing_time', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded"
                  placeholder="e.g., 2h 30m"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Count</label>
                <input
                  type="number"
                  min="1"
                  value={formData.count}
                  onChange={(e) => handleFormChange('count', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded"
                />
              </div>
              
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
                <input
                  type="text"
                  value={formData.remark}
                  onChange={(e) => handleFormChange('remark', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border rounded"
                  placeholder="Optional"
                />
              </div>
            </div>
            
            {requestIdWarning && (
              <div className={`mt-3 p-2 rounded text-xs ${
                requestIdWarning.type === 'error' 
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
              }`}>
                ⚠️ {requestIdWarning.message}
              </div>
            )}
            
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSubmit}
                disabled={submitting || !formData.request_type}
                className="px-4 py-2 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {submitting ? 'Submitting...' : 'Submit Entry'}
              </button>
              
              <button
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* TODAY'S LOGGED ENTRIES */}
      {/* ═══════════════════════════════════════════════════════ */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-4 py-2 bg-gray-700 text-white flex items-center justify-between">
          <h3 className="text-sm font-semibold">Today's Logged Entries</h3>
          <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">{todaysEntries.length} records</span>
        </div>
        
        {todaysEntries.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No entries logged today</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">SR#</th>
                  <th className="px-2 py-2 text-left font-semibold">Process</th>
                  <th className="px-2 py-2 text-left font-semibold">Location</th>
                  <th className="px-2 py-2 text-left font-semibold">Facility</th>
                  <th className="px-2 py-2 text-left font-semibold">Request ID</th>
                  <th className="px-2 py-2 text-left font-semibold">Request Type</th>
                  <th className="px-2 py-2 text-left font-semibold">Requestor Type</th>
                  <th className="px-2 py-2 text-center font-semibold">Count</th>
                  <th className="px-2 py-2 text-left font-semibold">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {todaysEntries.map((entry, idx) => (
                  <tr key={entry._id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-2 font-medium">{entry.sr_no}</td>
                    <td className="px-2 py-2">
                      <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">
                        {entry.process || entry.project_name}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-medium">{entry.subproject_name}</td>
                    <td className="px-2 py-2">{entry.facility || '-'}</td>
                    <td className="px-2 py-2">{entry.request_id || '-'}</td>
                    <td className="px-2 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        entry.request_type === 'New Request' ? 'bg-emerald-100 text-emerald-700' :
                        entry.request_type === 'Duplicate' ? 'bg-orange-100 text-orange-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {entry.request_type}
                      </span>
                    </td>
                    <td className="px-2 py-2">{entry.requestor_type || '-'}</td>
                    <td className="px-2 py-2 text-center font-medium">{entry.count || 1}</td>
                    <td className="px-2 py-2">{entry.remark || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerismaAllocationPanel;