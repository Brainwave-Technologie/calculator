// pages/BillingDashboard.jsx - WITH CLIENT SELECTOR TABS

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import VerismaDashboard from './Dashboards/VerismaDashboard';
import MRODashboard from './Dashboards/MRODashboard';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL 
// =============================================
// HELPER COMPONENTS
// =============================================

const PageHeader = ({ heading, subHeading }) => (
  <div className="p-6 bg-white border-b border-gray-200">
    <h1 className="text-3xl font-extrabold text-gray-900">{heading}</h1>
    {/* <p className="text-sm text-gray-500 mt-1">{subHeading}</p> */}
  </div>
);

// Client Tab Configuration
const CLIENT_TABS = [
  {
    id: 'verisma',
    name: 'Verisma',
    // description: 'Request Type Based Billing (New Request, Key, Duplicate)',
    color: 'blue'
  },
  {
    id: 'mro',
    name: 'MRO',
    // description: 'MRO Billing Dashboard',
    color: 'green'
  },
  // {
  //   id: 'datavant',
  //   name: 'Datavant',
  //   description: 'Datavant Billing Dashboard',
  //   color: 'purple',
  //   disabled: true // Coming soon
  // }
];

// Client Tab Button Component
const ClientTabButton = ({ tab, isActive, onClick }) => {
  const colorClasses = {
    blue: {
      active: 'bg-blue-600 h-6  text-white border-blue-600 shadow-lg',
      inactive: 'bg-white h-6  text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50'
    },
    green: {
      active: 'bg-green-600 h-6  text-white border-green-600 shadow-lg',
      inactive: 'bg-white h-6  text-gray-700 border-gray-300 hover:border-green-400 hover:bg-green-50'
    },
    purple: {
      active: 'bg-purple-600 h-6  text-white border-purple-600 shadow-lg',
      inactive: 'bg-white h-6  text-gray-700 border-gray-300 hover:border-purple-400 hover:bg-purple-50'
    }
  };

  const colors = colorClasses[tab.color] || colorClasses.blue;

  return (
    <button
      onClick={() => !tab.disabled && onClick(tab.id)}
      disabled={tab.disabled}
      className={`
        relative px-6 py-3 rounded-lg border-2 transition-all duration-200
        flex items-center space-x-3 min-w-[180px]
        ${isActive ? colors.active : colors.inactive}
        ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <span className="text-2xl">{tab.icon}</span>
      <div className="text-left">
        <div className="font-semibold">{tab.name}</div>
        {tab.disabled && (
          <span className="text-xs opacity-75">Coming Soon</span>
        )}
      </div>
      {isActive && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 
          border-l-8 border-r-8 border-t-8 
          border-l-transparent border-r-transparent border-t-current"
          style={{ borderTopColor: tab.color === 'blue' ? '#2563eb' : tab.color === 'green' ? '#16a34a' : '#9333ea' }}
        />
      )}
    </button>
  );
};

// =============================================
// MAIN DASHBOARD COMPONENT
// =============================================

const BillingDashboard = () => {
  const [activeClient, setActiveClient] = useState('verisma');
  const [clientsFromDB, setClientsFromDB] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(true);

  // Fetch available clients from database (optional - for dynamic client list)
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/client`);
        const data = await response.json();
        setClientsFromDB(Array.isArray(data) ? data : data.clients || []);
      } catch (error) {
        console.error('Error fetching clients:', error);
      } finally {
        setIsLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  const handleClientChange = (clientId) => {
    setActiveClient(clientId);
    toast.success(`Switched to ${CLIENT_TABS.find(t => t.id === clientId)?.name} Dashboard`);
  };

  // Get active tab info
  const activeTab = CLIENT_TABS.find(t => t.id === activeClient);

  return (
    <div className="bg-gray-50 min-h-screen">
      <PageHeader 
        heading="Billing Dashboard" 
        subHeading="Aggregated view of billing by Geography, Client, Location, Process Type, and Request Type" 
      />

      {/* Client Selector Tabs */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-100 to-gray-50 border-b">
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Select Client Dashboard</h2>
              <p className="text-sm text-gray-500">Each client has different billing logic and dashboard view</p>
            </div>
            
            {/* Quick Stats Badge */}
            {activeTab && (
              <div className={`px-4 py-2 rounded-full text-sm font-medium
                ${activeTab.color === 'blue' ? 'bg-blue-100 text-blue-800' : ''}
                ${activeTab.color === 'green' ? 'bg-green-100 text-green-800' : ''}
                ${activeTab.color === 'purple' ? 'bg-purple-100 text-purple-800' : ''}
              `}>
                Currently viewing: {activeTab.name}
              </div>
            )}
          </div>

          {/* Client Tab Buttons */}
          <div className="flex flex-wrap gap-4">
            {CLIENT_TABS.map(tab => (
              <ClientTabButton
                key={tab.id}
                tab={tab}
                isActive={activeClient === tab.id}
                onClick={handleClientChange}
              />
            ))}
          </div>

          {/* Active Client Description */}
          {/* {activeTab && (
            <div className={`mt-2 p-3 rounded-lg text-sm
              ${activeTab.color === 'blue' ? 'bg-blue-50 text-blue-700 border border-blue-200' : ''}
              ${activeTab.color === 'green' ? 'bg-green-50 text-green-700 border border-green-200' : ''}
              ${activeTab.color === 'purple' ? 'bg-purple-50 text-purple-700 border border-purple-200' : ''}
            `}>
              <span className="font-semibold">Billing Logic:</span> {activeTab.description}
            </div>
          )} */}
        </div>
      </div>

      {/* Render Active Dashboard */}
      <div className="dashboard-content">
        {activeClient === 'verisma' && <VerismaDashboard />}
        {activeClient === 'mro' && <MRODashboard />}
        {activeClient === 'datavant' && (
          <div className="p-8 text-center">
            <div className="text-6xl mb-4"></div>
            <h3 className="text-xl font-semibold text-gray-700">Datavant Dashboard Coming Soon</h3>
            <p className="text-gray-500 mt-2">This dashboard is currently under development.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BillingDashboard;