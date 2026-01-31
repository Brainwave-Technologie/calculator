import React, { useEffect, useState, useMemo } from "react";
import FancyDropdown from "../FancyDropdown";
const BillingContent = () => {
  const [billingData, setBillingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().getMonth() + 1
  );
  const [year] = useState(new Date().getFullYear());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const apiUrl = import.meta.env.VITE_BACKEND_URL;
  const monthOptions = monthNames.map(
    (name, idx) => `${name} ${year}`
  );

  // Fetch data when month changes
  useEffect(() => {
    const fetchBillingData = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `${apiUrl}/billing?month=${selectedMonth}&year=${year}`
        );
        if (!response.ok) throw new Error("Failed to fetch billing data");
        const data = await response.json();
        setBillingData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBillingData();
  }, [selectedMonth, year]);

  // Handle month change via FancyDropdown
  const handleMonthChange = (selectedLabel) => {
    const monthIndex = monthOptions.findIndex((m) => m === selectedLabel);
    if (monthIndex >= 0) setSelectedMonth(monthIndex + 1);
  };

  // Filtered data
  const filteredData = useMemo(() => {
    if (!search.trim()) return billingData;
    const lower = search.toLowerCase();
    return billingData.filter(
      (item) =>
        item.project_name?.toLowerCase().includes(lower) ||
        item.subproject_name?.toLowerCase().includes(lower) ||
        item.resource_name?.toLowerCase().includes(lower) ||
        item.productivity_level?.toLowerCase().includes(lower)
    );
  }, [search, billingData]);

  if (loading)
    return (
      <div className="flex justify-center items-center py-10 text-gray-500">
        Loading billing data...
      </div>
    );

  if (error)
    return (
      <div className="text-center text-red-600 py-10">
        Error: {error}
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto mt-10 bg-white shadow-md rounded-2xl overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between gap-3 bg-gray-50">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Billing Summary
          </h2>
          <p className="text-sm text-gray-500">Filtered by month and year</p>
        </div>

        {/* Right Side Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          {/* Fancy Dropdown for Month */}
          <div className="w-full sm:w-52">
            <FancyDropdown
              label="Select Month"
              options={monthOptions}
              value={monthOptions[selectedMonth - 1]}
              onChange={handleMonthChange}
            />
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search project, resource, subproject..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
            />
            <span className="absolute right-3 top-2.5 text-gray-400">🔍</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3">Project</th>
              <th className="px-6 py-3">Subproject</th>
              <th className="px-6 py-3">Resource</th>
              <th className="px-6 py-3">Level</th>
              <th className="px-6 py-3 text-right">Hours</th>
              <th className="px-6 py-3 text-right">Rate</th>
              <th className="px-6 py-3 text-right">Amount</th>
              <th className="px-6 py-3 text-center">Billable</th>
              <th className="px-6 py-3">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="text-center py-6 text-gray-500 italic"
                >
                  No records found for {monthNames[selectedMonth - 1]} {year}
                </td>
              </tr>
            ) : (
              filteredData.map((bill) => (
                <tr
                  key={bill._id}
                  className="hover:bg-gray-50 transition-colors duration-150"
                >
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {bill.project_name || "-"}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {bill.subproject_name || "-"}
                  </td>
                  <td className="px-6 py-4 text-gray-700">
                    {bill.resource_name || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${bill.productivity_level === "High"
                        ? "bg-red-100 text-red-700"
                        : bill.productivity_level === "Medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : bill.productivity_level === "Low"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                    >
                      {bill.productivity_level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {bill.hours}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    ₹{bill.rate}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-gray-900">
                    ₹{bill.total_amount}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${bill.billable_status === "Billable"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {bill.billable_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">
                    {new Date(bill.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BillingContent;
