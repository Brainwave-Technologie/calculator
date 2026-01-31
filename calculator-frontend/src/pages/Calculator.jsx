import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader";
import axios from "axios";
import Card from "../components/Calculator/Card";

// Import your tab components (create these files)
// import ProjectCostEstimation from "../components/Calculator/ProjectCostEstimation";
// import ResourceAllocationAnalysis from "../components/Calculator/ResourceAllocationAnalysis";
// import MonthlyBudgetAnalysis from "../components/Calculator/MonthlyBudgetAnalysis";
import toast from "react-hot-toast/headless";
import ProjectCostEstimation from "../components/Calculator/ProjectCostEstimation";
import ResourceAllocationAnalysis from "../components/Calculator/ResourceAllocationAnalysis";
import MonthlyBudgetAnalysis from "../components/Calculator/MonthlyBudgetAnalysis";

const Calculator = () => {
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalResources: 0,
    billableResources: 0,
    currentMonthBilling: 0,
  });
  const apiUrl = import.meta.env.VITE_BACKEND_URL;

  const [activeTab, setActiveTab] = useState("Monthly Budget Analysis");

  useEffect(() => {
    const fetchStatusCardsData = async () => {
      try {
        const response = await axios.get(`${apiUrl}/dashboard`);
        setStats(response.data);

      } catch (error) {
        console.log("There was an error while fetching data: ", error);
        toast.error("Failed fetching data");
      }
    }
    fetchStatusCardsData();
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "Project Cost Estimation":
        return <ProjectCostEstimation />;

      case "Resource Allocation Analysis":
        return <ResourceAllocationAnalysis />
      // return <div>Resource Allocation Analysis Coming Soon</div>;

      case "Monthly Budget Analysis":
        return <MonthlyBudgetAnalysis />
      // return <div>Monthly Budget Analysis Coming Soon</div>;

      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        heading="Analysis"
        subHeading="Calculate resource costs and productivity"
      />

      {/* Top Stats Cards */}
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          <Card title="Total Projects" value={stats.totalProjects} />
          <Card title="Total Resources" value={stats.totalResources} />
          <Card title="Billable Resources" value={stats.billableResources} />
          <Card
            title="Current Month Billing"
            value={`$${stats.currentMonthBilling.toFixed(2)}`}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex space-x-4 border-b border-gray-200 mb-4">
          {[ "Monthly Budget Analysis", "Project Cost Estimation", "Resource Allocation Analysis"].map((tab) => (
            <button
              key={tab}
              className={`py-2 px-4 text-sm font-medium border-b-2 transition ${activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-blue-600"
                }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white p-4 rounded shadow">
          <div className={activeTab === "Project Cost Estimation" ? "block" : "hidden"}>
            <ProjectCostEstimation />
          </div>
          <div className={activeTab === "Resource Allocation Analysis" ? "block" : "hidden"}>
            <ResourceAllocationAnalysis />
          </div>
          <div className={activeTab === "Monthly Budget Analysis" ? "block" : "hidden"}>
            <MonthlyBudgetAnalysis />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
