// src/pages/admin/AdminDeleteRequests.jsx - Admin page for reviewing delete requests from ALL clients
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_BACKEND_URL;

const AdminDeleteRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewingClient, setReviewingClient] = useState(null);
  const [reviewAction, setReviewAction] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [deleteType, setDeleteType] = useState('soft');
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token || userType !== 'admin') {
      navigate('/login');
      return;
    }
    fetchAllRequests();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Fetch delete requests from all clients
  const fetchAllRequests = async () => {
    setLoading(true);
    try {
      const [mroResponse, verismaResponse, datavantResponse] = await Promise.allSettled([
        axios.get(`${API_URL}/mro-daily-allocations/admin/delete-requests`, getAuthHeaders()),
        axios.get(`${API_URL}/verisma-daily-allocations/admin/delete-requests`, getAuthHeaders()),
        axios.get(`${API_URL}/datavant-daily-allocations/admin/delete-requests`, getAuthHeaders()),
      ]);
      
      const allRequests = [];
      
      // Process MRO requests
      if (mroResponse.status === 'fulfilled' && mroResponse.value?.data?.requests) {
        const mroRequests = mroResponse.value.data.requests.map(req => ({
          ...req,
          client_name: req.client_name || 'MRO',
          _client: 'mro'
        }));
        allRequests.push(...mroRequests);
      }
      
      // Process Verisma requests
      if (verismaResponse.status === 'fulfilled' && verismaResponse.value?.data?.requests) {
        const verismaRequests = verismaResponse.value.data.requests.map(req => ({
          ...req,
          client_name: req.client_name || 'Verisma',
          _client: 'verisma'
        }));
        allRequests.push(...verismaRequests);
      }
      
      // Process Datavant requests
      if (datavantResponse.status === 'fulfilled' && datavantResponse.value?.data?.requests) {
        const datavantRequests = datavantResponse.value.data.requests.map(req => ({
          ...req,
          client_name: req.client_name || 'Datavant',
          _client: 'datavant'
        }));
        allRequests.push(...datavantRequests);
      }
      
      // Sort all requests by requested_at (newest first)
      allRequests.sort((a, b) => {
        const dateA = new Date(a.delete_request?.requested_at || 0);
        const dateB = new Date(b.delete_request?.requested_at || 0);
        return dateB - dateA;
      });
      
      setRequests(allRequests);
      
    } catch (error) {
      console.error('Error fetching requests:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
      toast.error('Failed to fetch delete requests');
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

  const formatDateOnly = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  // Get the correct API endpoint based on client
  const getClientEndpoint = (client) => {
    switch (client?.toLowerCase()) {
      case 'verisma':
        return 'verisma-daily-allocations';
      case 'datavant':
        return 'datavant-daily-allocations';
      case 'mro':
      default:
        return 'mro-daily-allocations';
    }
  };

  const handleReview = async () => {
    if (!reviewAction) {
      toast.error('Please select an action');
      return;
    }
    
    if (reviewAction === 'reject' && !reviewComment.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    
    try {
      const endpoint = getClientEndpoint(reviewingClient);
      
      await axios.post(
        `${API_URL}/${endpoint}/admin/review-delete/${reviewingId}`,
        {
          action: reviewAction,
          comment: reviewComment,
          delete_type: deleteType
        },
        getAuthHeaders()
      );
      
      // Reset state
      setReviewingId(null);
      setReviewingClient(null);
      setReviewAction('');
      setReviewComment('');
      setDeleteType('soft');
      
      // Refresh requests
      fetchAllRequests();
      
      toast.success(`Delete request ${reviewAction}ed successfully`);
      
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to process request');
    }
  };

  const startReview = (req) => {
    setReviewingId(req._id);
    setReviewingClient(req._client || req.client_name);
    setReviewAction('');
    setReviewComment('');
    setDeleteType('soft');
  };

  const cancelReview = () => {
    setReviewingId(null);
    setReviewingClient(null);
    setReviewAction('');
    setReviewComment('');
    setDeleteType('soft');
  };

  // Filter requests by client
  const filteredRequests = activeFilter === 'all' 
    ? requests 
    : requests.filter(req => req._client === activeFilter || req.client_name?.toLowerCase() === activeFilter);

  // Count by client
  const counts = {
    all: requests.length,
    mro: requests.filter(r => r._client === 'mro' || r.client_name?.toLowerCase() === 'mro').length,
    verisma: requests.filter(r => r._client === 'verisma' || r.client_name?.toLowerCase() === 'verisma').length,
    datavant: requests.filter(r => r._client === 'datavant' || r.client_name?.toLowerCase() === 'datavant').length,
  };

  // Get client badge color
  const getClientColor = (client) => {
    switch (client?.toLowerCase()) {
      case 'verisma':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'datavant':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'mro':
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
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
                <p className="text-xs text-gray-500">Review and approve/reject delete requests from all clients</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAllRequests}
                disabled={loading}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                🔄 Refresh
              </button>
              <span className="px-3 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                {requests.length} Pending
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm border p-2 mb-4">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
                activeFilter === 'all'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Clients ({counts.all})
            </button>
            <button
              onClick={() => setActiveFilter('mro')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
                activeFilter === 'mro'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              MRO ({counts.mro})
            </button>
            <button
              onClick={() => setActiveFilter('verisma')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
                activeFilter === 'verisma'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
              }`}
            >
              Verisma ({counts.verisma})
            </button>
            <button
              onClick={() => setActiveFilter('datavant')}
              className={`px-4 py-2 text-xs font-medium rounded-lg transition ${
                activeFilter === 'datavant'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
              }`}
            >
              Datavant ({counts.datavant})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-500 mt-3 text-sm">Loading delete requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-gray-600 font-medium">No pending delete requests</p>
            <p className="text-gray-400 text-sm mt-1">
              {activeFilter !== 'all' ? `No requests from ${activeFilter.toUpperCase()}` : 'All caught up!'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map((req) => (
              <div key={`${req._client}-${req._id}`} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {/* Request Header */}
                <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${getClientColor(req.client_name || req._client)}`}>
                        {(req.client_name || req._client || 'Unknown').toUpperCase()}
                      </span>
                      <h3 className="text-sm font-semibold text-gray-800">
                        Delete Request for Entry #{req.sr_no}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-600">
                      Requested by <strong>{req.delete_request?.requested_by_name}</strong> 
                      <span className="text-gray-400"> ({req.delete_request?.requested_by_email})</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(req.delete_request?.requested_at)}
                    </p>
                  </div>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded font-medium">
                    Pending Review
                  </span>
                </div>
                
                {/* Entry Details */}
                <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 text-xs border-b">
                  <div>
                    <span className="text-gray-500 block">Allocation Date</span>
                    <p className="font-medium text-gray-800">{formatDateOnly(req.allocation_date)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Resource</span>
                    <p className="font-medium text-gray-800">{req.resource_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Location</span>
                    <p className="font-medium text-gray-800">{req.subproject_name}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Process/Project</span>
                    <p className="font-medium text-gray-800">{req.process_type || req.project_name || req.process || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Request ID</span>
                    <p className="font-medium text-gray-800">{req.request_id || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Request Type</span>
                    <p className="font-medium">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        req.request_type === 'New Request' ? 'bg-green-100 text-green-700' :
                        req.request_type === 'Follow up' || req.request_type === 'Duplicate' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {req.request_type}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Requestor Type</span>
                    <p className="font-medium text-gray-800">{req.requestor_type || '-'}</p>
                  </div>
                  {/* Show count for Verisma */}
                  {(req._client === 'verisma' || req.client_name?.toLowerCase() === 'verisma') && (
                    <div>
                      <span className="text-gray-500 block">Count</span>
                      <p className="font-medium text-gray-800">{req.count || 1}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500 block">Billing Amount</span>
                    <p className="font-medium text-green-700">${(req.billing_amount || 0).toFixed(2)}</p>
                  </div>
                </div>
                
                {/* Delete Reason */}
                <div className="px-4 py-3 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1 font-medium">Delete Reason:</p>
                  <p className="text-sm text-gray-800 bg-white p-2 rounded border border-gray-200">
                    {req.delete_request?.delete_reason || 'No reason provided'}
                  </p>
                </div>
                
                {/* Review Actions */}
                {reviewingId === req._id ? (
                  <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 space-y-3">
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Action *</label>
                        <select
                          value={reviewAction}
                          onChange={(e) => setReviewAction(e.target.value)}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select action...</option>
                          <option value="approve">✓ Approve Delete</option>
                          <option value="reject">✗ Reject Request</option>
                        </select>
                      </div>
                      
                      {reviewAction === 'approve' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Delete Type</label>
                          <select
                            value={deleteType}
                            onChange={(e) => setDeleteType(e.target.value)}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="soft">Soft Delete (can restore)</option>
                            <option value="hard">Hard Delete (permanent)</option>
                          </select>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Comment {reviewAction === 'reject' && <span className="text-red-500">* (required for rejection)</span>}
                      </label>
                      <textarea
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                        rows={2}
                        placeholder={reviewAction === 'reject' ? 'Please provide reason for rejection...' : 'Optional comment...'}
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={handleReview}
                        disabled={!reviewAction || (reviewAction === 'reject' && !reviewComment.trim())}
                        className={`px-4 py-2 text-xs font-medium rounded transition ${
                          reviewAction === 'approve' 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : reviewAction === 'reject'
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {reviewAction === 'approve' ? '✓ Approve Delete' : reviewAction === 'reject' ? '✗ Reject Request' : 'Select Action'}
                      </button>
                      <button
                        onClick={cancelReview}
                        className="px-4 py-2 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t flex flex-wrap gap-2">
                    <button
                      onClick={() => startReview(req)}
                      className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                      Review Request
                    </button>
                    <button
                      onClick={() => {
                        startReview(req);
                        setReviewAction('approve');
                      }}
                      className="px-3 py-2 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                    >
                      Quick Approve
                    </button>
                    <button
                      onClick={() => {
                        startReview(req);
                        setReviewAction('reject');
                      }}
                      className="px-3 py-2 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                    >
                      Quick Reject
                    </button>
                    <Link
                      to={`/admin/allocation/${req._id}/history`}
                      className="px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                    >
                      View History
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Summary Footer */}
        {!loading && requests.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-800">{counts.all}</p>
                <p className="text-xs text-gray-500">Total Pending</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-700">{counts.mro}</p>
                <p className="text-xs text-blue-600">MRO</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-700">{counts.verisma}</p>
                <p className="text-xs text-emerald-600">Verisma</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-700">{counts.datavant}</p>
                <p className="text-xs text-purple-600">Datavant</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDeleteRequests;