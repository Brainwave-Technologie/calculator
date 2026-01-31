import { useState, useEffect } from "react";
import FancyDropdown from "../FancyDropdown";
import axios from "axios";
import MonthlyAnalysisTable from "./Table/MonthlyAnalysisTable";

const MonthlyBudgetAnalysis = () => {
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [tableData, setTableData] = useState({});
  const apiUrl = import.meta.env.VITE_BACKEND_URL;

  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth(); // 0–11
  const monthNames = [
    "All Months",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Generate dropdown options dynamically
  const months = monthNames.map((month) =>
    month === "All Months" ? month : `${month} ${currentYear}`
  );

  // 🔹 Auto-set current month on mount
  useEffect(() => {
    const currentMonth = `${monthNames[currentMonthIndex + 1]} ${currentYear}`;
    setSelectedMonth(currentMonth);
  }, []);

  // 🔹 Auto-fetch when page loads or when month filter changes
  useEffect(() => {
    if (!selectedMonth) return;

    const fetchMonthlyData = async () => {
      try {
        setLoading(true);
        setMessage("");
        const res = await axios.post(`${apiUrl}/calculator/monthly-analysis`, {
          month: selectedMonth === "All Months" ? "all" : selectedMonth,
        });
        setTableData(res.data);
        setMessage("Budget analysis updated successfully!");
        console.log("Budget analysis result:", res.data);
      } catch (error) {
        console.error("Error fetching budget analysis:", error);
        setMessage("Failed to fetch budget analysis.");
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [selectedMonth]); // 👈 refetch whenever selectedMonth changes

  const handleReset = () => {
    const currentMonth = `${monthNames[currentMonthIndex + 1]} ${currentYear}`;
    setSelectedMonth(currentMonth);
    setMessage("");
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-8 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Monthly Budget Analysis
        </h2>

        {/* Month Dropdown */}
        <FancyDropdown
          label="Select Month"
          options={months}
          value={selectedMonth}
          onChange={setSelectedMonth}
        />

        {/* Reset Button */}
        <div className="flex justify-end">
          <button
            onClick={handleReset}
            disabled={loading}
            className={`bg-gray-200 text-gray-800 px-4 py-2 rounded-xl hover:bg-gray-300 transition ${loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
          >
            Reset
          </button>
        </div>

        {/* Result / Message */}
        {message && (
          <div className="text-sm text-gray-900 bg-gray-100 p-3 rounded">
            {message}
          </div>
        )}

        {/* Table */}
        <div>
          {loading ? (
            <p className="text-gray-500 italic">Loading...</p>
          ) : (
            <MonthlyAnalysisTable data={tableData} />
          )}
        </div>
      </div>
    </div>
  );
};

export default MonthlyBudgetAnalysis;
