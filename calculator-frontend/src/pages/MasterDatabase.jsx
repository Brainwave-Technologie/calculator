import React, { useState } from "react";
import KPICards from "../components/MasterDadatabase/KPICards";
import PageHeader from "../components/PageHeader";
import {
  FaFolder,
  FaFolderOpen,
  FaUsers,
  FaBolt,
  FaMoneyBillWave,
} from "react-icons/fa";
import ProjectContent from "../components/MasterDadatabase/ProjectContent";
import SubprojectsContent from "../components/MasterDadatabase/SubprojectContent";
import ResourcesContent from "../components/MasterDadatabase/ResourcesContent";
import ProductivityContent from "../components/MasterDadatabase/ProductivityContent";
import BillingContent from "../components/MasterDadatabase/BillingContent";

const tabs = [
  { id: "projects", label: "Projects", icon: <FaFolder /> },
  { id: "sub-projects", label: "Sub-Projects", icon: <FaFolderOpen /> },
  { id: "resources", label: "Resources", icon: <FaUsers /> },
  { id: "productivity", label: "Productivity", icon: <FaBolt /> },
  { id: "billing", label: "Billing", icon: <FaMoneyBillWave /> },
];

const MasterDatabase = () => {
  const [activeTab, setActiveTab] = useState("projects");

  const renderTabContent = () => {
    switch (activeTab) {
      case "projects":
        return <div><ProjectContent /></div>;
      case "sub-projects":
        return <div><SubprojectsContent /></div>;
      case "resources":
        return <div><ResourcesContent /></div>;
      case "productivity":
        return <div><ProductivityContent /></div>;
      case "billing":
        return <div><BillingContent /></div>;
      default:
        return null;
    }
  };

  return (
    <div className="p-6">
      <PageHeader
        heading="Master Database"
        subHeading="Centralized view of all data entities"
      />

      {/* Shared KPI Cards */}
      <div className="mt-6">
        <KPICards />
      </div>

      {/* Tabs and Tab Content */}
      <div className="mt-8">
        {/* Tabs */}
        <div className="flex space-x-4 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-md transition-colors duration-200 
              ${activeTab === tab.id
                  ? "bg-blue-100 text-blue-600 font-medium"
                  : "text-gray-600 hover:text-blue-500"
                }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-sm">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4 bg-white border border-t-0 border-gray-200 rounded-b-md shadow-sm">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default MasterDatabase;
