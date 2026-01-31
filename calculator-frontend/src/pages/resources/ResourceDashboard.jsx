// src/pages/ResourceDashboard.jsx - Multi-client dashboard with Geography → Client flow

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Client-specific components
import MROAllocationPanel from '../../components/resourcesDashboard/MRO/MROAllocationPanel';
import VerismaAllocationPanel from '../../components/resourcesDashboard/Verisma/VerismaAllocationPanel';
import DatavantAllocationPanel from '../../components/resourcesDashboard/Datavant/DatavantAllocationPanel';


const API_URL = import.meta.env.VITE_BACKEND_URL 

const CLIENT_CONFIG = {
  MRO: {
    name: 'MRO',
    bgSelected: 'bg-green-50 border-green-500',
    textColor: 'text-green-700',
    description: 'Medical Records Processing'
  },
  Verisma: {
    name: 'Verisma',
    bgSelected: 'bg-blue-50 border-blue-500',
    textColor: 'text-blue-700',
    description: 'ROI Processing'
  },
  Datavant: {
    name: 'Datavant',
    bgSelected: 'bg-purple-50 border-purple-500',
    textColor: 'text-purple-700',
    description: 'Data Processing'
  }
};

const ResourceDashboard = () => {
  const navigate = useNavigate();
  const [resourceInfo, setResourceInfo] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Selection state
  const [selectedGeography, setSelectedGeography] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Data state
  const [allocations, setAllocations] = useState([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    
    if (!token || userType !== 'resource') {
      navigate('/resource-login');
      return;
    }

    const storedInfo = localStorage.getItem('resourceInfo');
    if (storedInfo) {
      setResourceInfo(JSON.parse(storedInfo));
    }

    fetchAssignments();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/resource/me/locations`, getAuthHeaders());
      setAssignments(response.data || []);
    } catch (error) {
      console.error('Error fetching assignments:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Extract unique geographies
  const geographies = useMemo(() => {
    const geoMap = new Map();
    assignments.forEach(a => {
      if (a.geography_id && !geoMap.has(a.geography_id)) {
        geoMap.set(a.geography_id, { id: a.geography_id, name: a.geography_name });
      }
    });
    return Array.from(geoMap.values());
  }, [assignments]);

  // Extract clients available for selected geography
  const availableClients = useMemo(() => {
    if (!selectedGeography) return [];
    
    const clientMap = new Map();
    assignments
      .filter(a => a.geography_id === selectedGeography)
      .forEach(a => {
        if (a.client_id && !clientMap.has(a.client_id)) {
          clientMap.set(a.client_id, { id: a.client_id, name: a.client_name });
        }
      });
    return Array.from(clientMap.values());
  }, [assignments, selectedGeography]);

  // Get locations count per client
  const getClientLocationCount = (clientName) => {
    if (!selectedGeography) return 0;
    return assignments
      .filter(a => a.geography_id === selectedGeography && a.client_name?.toLowerCase() === clientName.toLowerCase())
      .reduce((sum, a) => sum + (a.subprojects?.length || 0), 0);
  };

  // Check if client is accessible
  const isClientAccessible = (clientName) => {
    return availableClients.some(c => c.name.toLowerCase() === clientName.toLowerCase());
  };

  // Get locations for selected client
  const clientLocations = useMemo(() => {
    if (!selectedGeography || !selectedClient) return [];
    return assignments.filter(
      a => a.geography_id === selectedGeography && a.client_id === selectedClient
    );
  }, [assignments, selectedGeography, selectedClient]);

  // Fetch allocations when client/date changes
  useEffect(() => {
    if (selectedClient && selectedDate) {
      fetchAllocations();
    }
  }, [selectedClient, selectedDate]);

  const fetchAllocations = async () => {
    if (!selectedClient) return;
    
    setLoadingAllocations(true);
    try {
      const clientName = availableClients.find(c => c.id === selectedClient)?.name?.toLowerCase();
      
      let endpoint = '';
      if (clientName === 'mro') endpoint = `${API_URL}/mro-daily-allocations/my-allocations`;
      else if (clientName === 'verisma') endpoint = `${API_URL}/verisma-daily-allocations/my-allocations`;
      else if (clientName === 'datavant') endpoint = `${API_URL}/datavant-daily-allocations/my-allocations`;
      
      if (endpoint) {
        const response = await axios.get(endpoint, {
          ...getAuthHeaders(),
          params: { date: selectedDate }
        });
        setAllocations(response.data.allocations || []);
      }
    } catch (error) {
      console.error('Error fetching allocations:', error);
      setAllocations([]);
    } finally {
      setLoadingAllocations(false);
    }
  };

  const handleGeographyChange = (geoId) => {
    setSelectedGeography(geoId);
    setSelectedClient('');
    setAllocations([]);
  };

  const handleClientSelect = (clientId) => {
    setSelectedClient(clientId);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceInfo');
    navigate('/resource-login');
  };

  // Get current client name
  const currentClientName = useMemo(() => {
    if (!selectedClient) return '';
    return availableClients.find(c => c.id === selectedClient)?.name || '';
  }, [selectedClient, availableClients]);

  // Render client-specific panel
  const renderClientPanel = () => {
    const clientLower = currentClientName.toLowerCase();
    const geographyName = geographies.find(g => g.id === selectedGeography)?.name || '';
    
    const commonProps = {
      locations: clientLocations,
      selectedDate,
      resourceInfo,
      geographyId: selectedGeography,
      geographyName,
      allocations,
      onRefresh: fetchAllocations,
      loading: loadingAllocations
    };
    
    if (clientLower === 'mro') return <MROAllocationPanel {...commonProps} />;
    if (clientLower === 'verisma') return <VerismaAllocationPanel {...commonProps} />;
    if (clientLower === 'datavant') return <DatavantAllocationPanel {...commonProps} />;
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Compact */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Daily Allocation System</h1>
                <p className="text-xs text-gray-500">Log your daily work entries</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
                <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Geography Selection - Compact */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Select Geography</h2>
          <div className="flex flex-wrap gap-2">
            {geographies.length === 0 ? (
              <p className="text-gray-500 text-sm">No geographies assigned.</p>
            ) : (
              geographies.map(geo => (
                <button
                  key={geo.id}
                  onClick={() => handleGeographyChange(geo.id)}
                  className={`px-4 py-2 rounded text-sm font-medium transition ${
                    selectedGeography === geo.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {geo.name}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Client Selection - Always show all 3, disabled if no access */}
        {selectedGeography && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Select Client</h2>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(CLIENT_CONFIG).map(([key, config]) => {
                const isAccessible = isClientAccessible(key);
                const clientData = availableClients.find(c => c.name.toLowerCase() === key.toLowerCase());
                const isSelected = selectedClient === clientData?.id;
                const locationCount = getClientLocationCount(key);
                
                return (
                  <button
                    key={key}
                    onClick={() => isAccessible && handleClientSelect(clientData.id)}
                    disabled={!isAccessible}
                    className={`p-4 rounded-lg border-2 transition text-left ${
                      isSelected
                        ? config.bgSelected
                        : isAccessible
                          ? 'border-gray-200 hover:border-gray-300 bg-white'
                          : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <h3 className={`text-sm font-semibold ${isSelected ? config.textColor : isAccessible ? 'text-gray-800' : 'text-gray-400'}`}>
                      {config.name}
                    </h3>
                    <p className={`text-xs mt-0.5 ${isAccessible ? 'text-gray-500' : 'text-gray-400'}`}>
                      {config.description}
                    </p>
                    <p className={`text-xs mt-2 ${isAccessible ? 'text-green-600' : 'text-red-400'}`}>
                      {isAccessible ? `${locationCount} locations` : 'No locations assigned'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date & Stats Bar */}
        {selectedClient && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="text-sm text-gray-600">
                <span className="font-medium">{currentClientName}</span>
                <span className="mx-2">•</span>
                <span>{allocations.length} entries</span>
              </div>
            </div>
          </div>
        )}

        {/* Client-Specific Panel with Pre-populated Table */}
        {selectedClient && renderClientPanel()}
      </main>
    </div>
  );
};

export default ResourceDashboard;