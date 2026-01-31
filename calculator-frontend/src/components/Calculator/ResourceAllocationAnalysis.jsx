import { useState, useMemo } from "react";
import axios from "axios";
import FancyDropdown from "../FancyDropdown";
import ResourceAllocationTable from "./Table/ResourceAllocationTable";

const ResourceAllocationAnalysis = () => {
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [error, setError] = useState("");
  const [tableData, setTableData] = useState({});


  const apiUrl = import.meta.env.VITE_BACKEND_URL; // ✅ use from .env

  // Build month list
  const months = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseMonths = [
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
    ].map((m) => `${m} ${currentYear}`);
    return ["All Months", ...baseMonths];
  }, []);

  const handleReset = () => {
    setSelectedMonth("");
    setAnalysisData(null);
    setError("");
  };

  const handleAnalyze = async () => {
    console.log("This is the selected Month: ", selectedMonth)
    if (!selectedMonth) return;

    try {
      setLoading(true);
      setError("");
      setAnalysisData(null);

      const payload = selectedMonth;
      // Convert selected month to a backend-friendly format if needed
      // Example: "October 2025" → { month: 10, year: 2025 }

      const response = await axios.post(`${apiUrl}/calculator/resource-allocation`, { month: payload });

      setAnalysisData(response.data);
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Failed to fetch resource allocation data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">
        Resource Allocation Analysis
      </h2>

      {/* Month Selection */}
      <FancyDropdown
        label="Select Month"
        options={months}
        value={selectedMonth}
        onChange={setSelectedMonth}
      />

      {/* Buttons */}
      <div className="flex gap-x-4">
        <button
          onClick={handleAnalyze}
          disabled={!selectedMonth || loading}
          className={`w-1/2 bg-blue-500 text-white px-4 py-2 rounded-xl transition
            ${!selectedMonth || loading
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-blue-600"
            }`}
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>

        <button
          onClick={handleReset}
          className="w-1/2 bg-gray-200 text-gray-800 px-4 py-2 rounded-xl hover:bg-gray-300 transition"
        >
          Reset
        </button>
      </div>

      {/* Response Display */}
      {error && (
        <div className="text-red-600 bg-red-50 p-3 rounded">{error}</div>
      )}

      {/* {analysisData && ( */}
      {/*   <div className="p-4 bg-gray-50 border rounded-xl mt-4"> */}
      {/*     <h3 className="text-md font-semibold text-gray-800 mb-2"> */}
      {/*       Analysis Result */}
      {/*     </h3> */}
      {/*     <pre className="text-xs bg-white p-3 rounded border overflow-x-auto"> */}
      {/*       {JSON.stringify(analysisData, null, 2)} */}
      {/*     </pre> */}
      {/*   </div> */}
      {/* )} */}

      {!analysisData && !error && selectedMonth && !loading && (
        <div className="text-sm text-gray-900 bg-gray-100 p-3 rounded">
          Showing data for <strong>{selectedMonth}</strong>
        </div>
      )}
      <div>
        <ResourceAllocationTable data={analysisData} />
      </div>
    </div>
  );
};

export default ResourceAllocationAnalysis;
