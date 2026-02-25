// src/pages/ResourceDashboard.jsx
// Multi-client dashboard with smart location filtering
// - Dropdown: Shows ALL assigned locations (allows multiple entries per location per day)
// - Pending: Locations not yet logged for the selected date
// - Future dates: If location was logged on a previous date, it won't appear for future dates
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Client-specific components
import MROAllocationPanel from '../../components/resourcesDashboard/MRO/MROAllocationPanel';
import VerismaAllocationPanel from '../../components/resourcesDashboard/Verisma/VerismaAllocationPanel';
import DatavantAllocationPanel from '../../components/resourcesDashboard/Datavant/DatavantAllocationPanel';

const API_URL = import.meta.env.VITE_BACKEND_URL;

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
  const [loading, setLoading] = useState(true);
  
  // Selection state
  const [selectedGeography, setSelectedGeography] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Data state
  const [locations, setLocations] = useState([]);  // Locations for dropdown (date-filtered but allows multiple)
  const [allocations, setAllocations] = useState([]);  // Allocations for selected date
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  
  // All assignments (for geography/client selection)
  const [allAssignments, setAllAssignments] = useState([]);

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

    fetchResourceInfo();
  }, [navigate]);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  // Fetch resource info with all assignments
  const fetchResourceInfo = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/resource/me`, getAuthHeaders());
      
      if (response.data.resource) {
        setResourceInfo(response.data.resource);
        setAllAssignments(response.data.resource.assignments || []);
        localStorage.setItem('resourceInfo', JSON.stringify(response.data.resource));
      }
    } catch (error) {
      console.error('Error fetching resource info:', error);
      if (error.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch locations for dropdown
  // Uses /locations endpoint which filters by:
  // 1. assigned_date <= selectedDate
  // 2. NOT logged on any date BEFORE selectedDate (for future date filtering)
  const fetchLocationsForDate = async (clientName, date) => {
    if (!clientName || !date) return;
    
    setLoadingLocations(true);
    try {
      const response = await axios.get(`${API_URL}/resource/locations`, {
        ...getAuthHeaders(),
        params: { 
          client: clientName,
          date: date
        }
      });
      
      setLocations(response.data.locations || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      setLocations([]);
    } finally {
      setLoadingLocations(false);
    }
  };

  // Fetch allocations for selected date
  const fetchAllocations = async () => {
    if (!selectedClient || !selectedDate) return;
    
    setLoadingAllocations(true);
    try {
      const clientInfo = availableClients.find(c => c.id === selectedClient);
      const clientName = clientInfo?.name?.toLowerCase();
      
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

  // Extract unique geographies
  const geographies = useMemo(() => {
    const geoMap = new Map();
    allAssignments.forEach(a => {
      if (a.geography_id && !geoMap.has(a.geography_id)) {
        geoMap.set(a.geography_id, { id: a.geography_id, name: a.geography_name });
      }
    });
    return Array.from(geoMap.values());
  }, [allAssignments]);

  // Extract clients for selected geography
  const availableClients = useMemo(() => {
    if (!selectedGeography) return [];
    
    const clientMap = new Map();
    allAssignments
      .filter(a => a.geography_id === selectedGeography)
      .forEach(a => {
        if (a.client_id && !clientMap.has(a.client_id)) {
          clientMap.set(a.client_id, { id: a.client_id, name: a.client_name });
        }
      });
    return Array.from(clientMap.values());
  }, [allAssignments, selectedGeography]);

  // Get location count per client
  const getClientLocationCount = (clientName) => {
    if (!selectedGeography) return 0;
    return allAssignments
      .filter(a => a.geography_id === selectedGeography && a.client_name?.toLowerCase() === clientName.toLowerCase())
      .reduce((sum, a) => sum + (a.subprojects?.length || 0), 0);
  };

  // Check if client is accessible
  const isClientAccessible = (clientName) => {
    return availableClients.some(c => c.name?.toLowerCase() === clientName.toLowerCase());
  };

  // Get current client name
  const currentClientName = useMemo(() => {
    if (!selectedClient) return '';
    return availableClients.find(c => c.id === selectedClient)?.name || '';
  }, [selectedClient, availableClients]);

  // Fetch data when client or date changes
  useEffect(() => {
    if (selectedClient && selectedDate && currentClientName) {
      fetchLocationsForDate(currentClientName, selectedDate);
      fetchAllocations();
    }
  }, [selectedClient, selectedDate, currentClientName]);

  const handleGeographyChange = (geoId) => {
    setSelectedGeography(geoId);
    setSelectedClient('');
    setLocations([]);
    setAllocations([]);
  };

  const handleClientSelect = (clientId) => {
    setSelectedClient(clientId);
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const handleRefresh = () => {
    fetchLocationsForDate(currentClientName, selectedDate);
    fetchAllocations();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceInfo');
    navigate('/resource-login');
  };

  const goToPreviousCases = () => {
    navigate(`/previous-logged-cases${selectedClient ? `?client=${currentClientName}` : ''}`);
  };

  // Date validation
  const dateValidation = useMemo(() => {
    if (!selectedDate) return { valid: false, message: 'Select a date' };
    
    const selected = new Date(selectedDate);
    const today = new Date();
    selected.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    if (selected > today) {
      return { valid: false, message: 'Cannot select future date' };
    }
    
    return { valid: true };
  }, [selectedDate]);

  // Render client-specific panel
  const renderClientPanel = () => {
    const clientLower = currentClientName.toLowerCase();
    const geographyName = geographies.find(g => g.id === selectedGeography)?.name || '';
    
    const commonProps = {
      locations: locations,  // Date-filtered locations
      selectedDate,
      resourceInfo,
      geographyId: selectedGeography,
      geographyName,
      allocations,
      onRefresh: handleRefresh,
      onDateChange: handleDateChange,
      loading: loadingAllocations || loadingLocations
    };
    
    if (clientLower === 'mro') {
      return <MROAllocationPanel {...commonProps} />;
    } else if (clientLower === 'verisma') {
      return <VerismaAllocationPanel {...commonProps} />;
    } else if (clientLower === 'datavant') {
      return <DatavantAllocationPanel {...commonProps} />;
    }
    
    return <div className="text-gray-500 text-center py-8">Select a client to view allocation panel</div>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">D</div>
              <div>
                <h1 className="text-base font-semibold text-gray-800">Daily Allocation System</h1>
                <p className="text-xs text-gray-500">Log your daily work entries</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={goToPreviousCases} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Previous Cases
              </button>
              <button onClick={() => navigate('/resource/qc-tasks')} className="px-3 py-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-1 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                QC Tasks
              </button>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-800">{resourceInfo?.name}</p>
                <p className="text-xs text-gray-500">{resourceInfo?.email}</p>
              </div>
              <button onClick={handleLogout} className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        {/* Geography Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Select Geography</h2>
          <div className="flex gap-2 flex-wrap">
            {geographies.map(geo => (
              <button
                key={geo.id}
                onClick={() => handleGeographyChange(geo.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition ${
                  selectedGeography === geo.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {geo.name}
              </button>
            ))}
          </div>
        </div>

        {/* Client Selection */}
        {selectedGeography && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Select Client</h2>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(CLIENT_CONFIG).map(([key, config]) => {
                const accessible = isClientAccessible(key);
                const locationCount = getClientLocationCount(key);
                const isSelected = currentClientName.toLowerCase() === key.toLowerCase();
                
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (accessible) {
                        const clientData = availableClients.find(c => c.name?.toLowerCase() === key.toLowerCase());
                        if (clientData) handleClientSelect(clientData.id);
                      }
                    }}
                    disabled={!accessible}
                    className={`p-4 rounded-lg border-2 text-left transition ${
                      isSelected
                        ? config.bgSelected + ' border-2'
                        : accessible
                          ? 'bg-white border-gray-200 hover:bg-gray-50'
                          : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className={`font-semibold ${isSelected ? config.textColor : accessible ? 'text-gray-800' : 'text-gray-400'}`}>
                      {config.name}
                    </div>
                    <div className={`text-xs ${accessible ? (isSelected ? config.textColor : 'text-green-600') : 'text-red-400'}`}>
                      {accessible ? `${locationCount} locations` : 'No locations assigned'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Date Selection & Stats */}
        {selectedClient && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date:</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                {!dateValidation.valid && (
                  <div className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded">
                    ⚠️ {dateValidation.message}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="font-semibold text-gray-800">{currentClientName}</span>
                  <span className="text-gray-500 mx-2">•</span>
                  <span className="text-gray-600">{allocations.length} entries</span>
                </div>
                
                <button onClick={goToPreviousCases} className="text-xs text-blue-600 hover:text-blue-800 underline">
                  View Previous →
                </button>
              </div>
            </div>
            
            {/* Location availability info */}
            {loadingLocations ? (
              <div className="mt-3 text-xs text-gray-500">Loading locations...</div>
            ) : (
              <div className="mt-3 text-xs text-gray-500">
                {locations.reduce((sum, l) => sum + (l.subprojects?.length || 0), 0)} location(s) available for {selectedDate}
                {locations.length === 0 && (
                  <span className="text-yellow-600 ml-2">
                    (No locations assigned — contact admin)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Client Panel */}
        {selectedClient && renderClientPanel()}
      </main>
    </div>
  );
};

export default ResourceDashboard;