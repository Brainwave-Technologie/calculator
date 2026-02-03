// src/pages/admin/AdminDeleteRequests.jsx - Admin page for reviewing delete requests
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL 

const AdminDeleteRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [deleteType, setDeleteType] = useState('soft');

  useEffect(() => {
   const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token || userType !== 'admin') {
      navigate('/login');
      return;
    }
    fetchRequests();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/mro-daily-allocations/admin/delete-requests`,
        getAuthHeaders()
      );
      setRequests(response.data.requests || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('en-GB', { 
      day: 'numeric', month: 'short', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handleReview = async () => {
    if (!reviewAction) {
      alert('Please select an action');
      return;
    }
    
    try {
      await axios.post(
        `${API_URL}/mro-daily-allocations/admin/review-delete/${reviewingId}`,
        {
          action: reviewAction,
          comment: reviewComment,
          delete_type: deleteType
        },
        getAuthHeaders()
      );
      
      setReviewingId(null);
      setReviewAction('');
      setReviewComment('');
      setDeleteType('soft');
      fetchRequests();
      
      alert(`Delete request ${reviewAction}ed successfully`);
      
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to process request');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link 
                to="/dashboard"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                ← Back to Dashboard
              </Link>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Delete Requests Queue</h1>
                <p className="text-xs text-gray-500">Review and approve/reject delete requests</p>
              </div>
            </div>
            
            <span className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-full">
              {requests.length} Pending
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <p className="text-gray-500">No pending delete requests</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div key={req._id} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Request Header */}
                <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">
                      Delete Request for Entry #{req.sr_no}
                    </h3>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Requested by <strong>{req.delete_request?.requested_by_name}</strong> 
                      ({req.delete_request?.requested_by_email})
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(req.delete_request?.requested_at)}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                    Pending Review
                  </span>
                </div>
                
                {/* Entry Details */}
                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Allocation Date:</span>
                    <p className="font-medium">{formatDate(req.allocation_date)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Resource:</span>
                    <p className="font-medium">{req.resource_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Location:</span>
                    <p className="font-medium">{req.subproject_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Process Type:</span>
                    <p className="font-medium">{req.process_type}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Request ID:</span>
                    <p className="font-medium">{req.request_id || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Request Type:</span>
                    <p className="font-medium">{req.request_type}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Requestor Type:</span>
                    <p className="font-medium">{req.requestor_type || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Billing Amount:</span>
                    <p className="font-medium">${req.billing_amount?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>
                
                {/* Delete Reason */}
                <div className="px-4 py-3 bg-gray-50 border-t">
                  <p className="text-xs text-gray-500 mb-1">Delete Reason:</p>
                  <p className="text-sm text-gray-800 bg-white p-2 rounded border">
                    {req.delete_request?.delete_reason || 'No reason provided'}
                  </p>
                </div>
                
                {/* Review Actions */}
                {reviewingId === req._id ? (
                  <div className="px-4 py-3 bg-blue-50 border-t space-y-3">
                    <div className="flex gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
                        <select
                          value={reviewAction}
                          onChange={(e) => setReviewAction(e.target.value)}
                          className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                        >
                          <option value="">Select...</option>
                          <option value="approve">Approve</option>
                          <option value="reject">Reject</option>
                        </select>
                      </div>
                      
                      {reviewAction === 'approve' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Delete Type</label>
                          <select
                            value={deleteType}
                            onChange={(e) => setDeleteType(e.target.value)}
                            className="px-2 py-1.5 text-xs border border-gray-300 rounded"
                          >
                            <option value="soft">Soft Delete (can restore)</option>
                            <option value="hard">Hard Delete (permanent)</option>
                          </select>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Comment {reviewAction === 'reject' && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                        rows={2}
                        placeholder={reviewAction === 'reject' ? 'Please provide reason for rejection' : 'Optional comment'}
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleReview}
                        disabled={!reviewAction || (reviewAction === 'reject' && !reviewComment.trim())}
                        className={`px-3 py-1.5 text-xs rounded ${
                          reviewAction === 'approve' 
                            ? 'bg-green-500 text-white hover:bg-green-600' 
                            : 'bg-red-500 text-white hover:bg-red-600'
                        } disabled:opacity-50`}
                      >
                        {reviewAction === 'approve' ? 'Approve Delete' : 'Reject Request'}
                      </button>
                      <button
                        onClick={() => {
                          setReviewingId(null);
                          setReviewAction('');
                          setReviewComment('');
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t flex gap-2">
                    <button
                      onClick={() => setReviewingId(req._id)}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Review Request
                    </button>
                    <Link
                      to={`/admin/allocation/${req._id}/history`}
                      className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      View Edit History
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDeleteRequests;