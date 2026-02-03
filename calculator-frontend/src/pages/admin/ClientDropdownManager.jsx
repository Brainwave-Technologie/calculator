// src/pages/admin/ClientDropdownManager.jsx - Manage dropdown options per client
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_BACKEND_URL 

const ClientDropdownManager = () => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newOption, setNewOption] = useState({ category: '', value: '' });

  useEffect(() => {
    fetchClients();
  }, []);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API_URL}/clients`, getAuthHeaders());
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchClientOptions = async (clientId) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_URL}/dropdown-options/client/${clientId}`,
        getAuthHeaders()
      );
      setOptions(response.data);
    } catch (error) {
      console.error('Error fetching options:', error);
      // Set empty options if not found
      setOptions({
        request_types: [],
        requestor_types: [],
        process_types: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = (e) => {
    const clientId = e.target.value;
    const client = clients.find(c => c._id === clientId);
    setSelectedClient(client);
    if (clientId) {
      fetchClientOptions(clientId);
    } else {
      setOptions(null);
    }
  };

  const handleAddOption = async () => {
    if (!newOption.category || !newOption.value.trim()) {
      alert('Please select a category and enter a value');
      return;
    }

    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/dropdown-options/client/${selectedClient._id}/${newOption.category}`,
        { value: newOption.value.trim() },
        getAuthHeaders()
      );
      
      // Refresh options
      await fetchClientOptions(selectedClient._id);
      setNewOption({ category: '', value: '' });
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to add option');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOption = async (category, value) => {
    if (!window.confirm(`Delete "${value}" from ${category}?`)) return;

    try {
      await axios.delete(
        `${API_URL}/dropdown-options/client/${selectedClient._id}/${category}/${encodeURIComponent(value)}`,
        getAuthHeaders()
      );
      await fetchClientOptions(selectedClient._id);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete option');
    }
  };

  const handleToggleActive = async (category, option) => {
    try {
      await axios.put(
        `${API_URL}/dropdown-options/client/${selectedClient._id}/${category}/${encodeURIComponent(option.value)}`,
        { is_active: !option.is_active },
        getAuthHeaders()
      );
      await fetchClientOptions(selectedClient._id);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update option');
    }
  };

  const handleSaveAll = async () => {
    if (!selectedClient || !options) return;

    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/dropdown-options/client/${selectedClient._id}`,
        {
          request_types: options.request_types,
          requestor_types: options.requestor_types,
          process_types: options.process_types
        },
        getAuthHeaders()
      );
      alert('Options saved successfully!');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save options');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromClient = async (sourceClientId) => {
    if (!selectedClient) return;
    if (!window.confirm('This will replace all current options. Continue?')) return;

    try {
      await axios.post(
        `${API_URL}/dropdown-options/copy/${sourceClientId}/${selectedClient._id}`,
        {},
        getAuthHeaders()
      );
      await fetchClientOptions(selectedClient._id);
      alert('Options copied successfully!');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to copy options');
    }
  };

  const renderOptionsList = (category, categoryLabel) => {
    const items = options?.[category] || [];
    
    return (
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center justify-between">
          {categoryLabel}
          <span className="text-sm text-gray-500">{items.length} options</span>
        </h3>
        
        {items.length === 0 ? (
          <p className="text-gray-500 text-sm italic">No options defined</p>
        ) : (
          <ul className="space-y-2">
            {items.map((opt, idx) => (
              <li 
                key={idx} 
                className={`flex items-center justify-between p-2 rounded ${
                  opt.is_active ? 'bg-gray-50' : 'bg-gray-200'
                }`}
              >
                <span className={!opt.is_active ? 'line-through text-gray-400' : ''}>
                  {opt.label || opt.value}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(category, opt)}
                    className={`text-xs px-2 py-1 rounded ${
                      opt.is_active 
                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {opt.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDeleteOption(category, opt.value)}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Client Dropdown Options</h1>
        <p className="text-gray-600 mt-1">
          Configure Request Type, Requestor Type, and Process Type options for each client
        </p>
      </div>

      {/* Client Selector */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Client
            </label>
            <select
              value={selectedClient?._id || ''}
              onChange={handleClientSelect}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select a Client --</option>
              {clients.map(client => (
                <option key={client._id} value={client._id}>
                  {client.name} ({client.geography_name})
                </option>
              ))}
            </select>
          </div>

          {selectedClient && (
            <div className="flex gap-2">
              <select
                className="px-3 py-2 border rounded-lg text-sm"
                onChange={(e) => e.target.value && handleCopyFromClient(e.target.value)}
                defaultValue=""
              >
                <option value="">Copy options from...</option>
                {clients.filter(c => c._id !== selectedClient._id).map(client => (
                  <option key={client._id} value={client._id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading options...</p>
        </div>
      )}

      {/* Options Editor */}
      {selectedClient && options && !loading && (
        <>
          {/* Add New Option */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="font-medium text-gray-800 mb-3">Add New Option</h2>
            <div className="flex gap-3 items-end">
              <div className="w-48">
                <label className="block text-sm text-gray-600 mb-1">Category</label>
                <select
                  value={newOption.category}
                  onChange={(e) => setNewOption({ ...newOption, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Select Category</option>
                  <option value="request_types">Request Type</option>
                  <option value="requestor_types">Requestor Type</option>
                  <option value="process_types">Process Type</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">Value</label>
                <input
                  type="text"
                  value={newOption.value}
                  onChange={(e) => setNewOption({ ...newOption, value: e.target.value })}
                  placeholder="Enter option value"
                  className="w-full px-3 py-2 border rounded-lg"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddOption()}
                />
              </div>
              <button
                onClick={handleAddOption}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {saving ? 'Adding...' : 'Add Option'}
              </button>
            </div>
          </div>

          {/* Options Lists */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {renderOptionsList('request_types', 'Request Type')}
            {renderOptionsList('requestor_types', 'Requestor Type')}
            {renderOptionsList('process_types', 'Process Type')}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </>
      )}

      {/* No Client Selected */}
      {!selectedClient && !loading && (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-500">Select a client to manage its dropdown options</p>
        </div>
      )}

      {/* Default Options Reference */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="font-medium text-blue-800 mb-3">Reference: Common Options</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-blue-700 mb-2">MRO Request Types:</h4>
            <ul className="text-blue-600 list-disc list-inside">
              <li>Batch</li>
              <li>DDS</li>
              <li>E-link</li>
              <li>E-Request</li>
              <li>Follow up</li>
              <li>New Request</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-700 mb-2">MRO Requestor Types:</h4>
            <ul className="text-blue-600 list-disc list-inside">
              <li>NRS-NO Records</li>
              <li>Other Processing (Canceled/Released By Other)</li>
              <li>Processed</li>
              <li>Processed through File Drop</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-700 mb-2">MRO Process Types:</h4>
            <ul className="text-blue-600 list-disc list-inside">
              <li>Logging</li>
              <li>MRO Payer Project</li>
              <li>Processing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDropdownManager;
