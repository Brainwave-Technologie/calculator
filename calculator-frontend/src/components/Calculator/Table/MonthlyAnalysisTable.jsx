
import React from "react";

const MonthlyAnalysisTable = ({ data }) => {
  if (!data) {
    return (
      <div className="text-gray-500 italic text-center py-6">
        No budget data available.
      </div>
    );
  }

  const {
    month,
    total_budget,
    billable_amount,
    non_billable_amount,
    project_breakdown = [],
  } = data;

  const kpiCards = [
    {
      label: "Total Budget",
      value: `$${total_budget?.toLocaleString() || 0}`,
      color: "bg-blue-100 text-blue-800 border-blue-300",
    },
    {
      label: "Billable Amount",
      value: `$${billable_amount?.toLocaleString() || 0}`,
      color: "bg-green-100 text-green-800 border-green-300",
    },
    {
      label: "Non-Billable Amount",
      value: `$${non_billable_amount?.toLocaleString() || 0}`,
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    },
    {
      label: "No. of Projects",
      value: project_breakdown.length,
      color: "bg-purple-100 text-purple-800 border-purple-300",
    },
  ];

  return (
    <div className=" w-full space-y-6 mt-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Monthly Budget Overview
        </h3>
        <p className="text-sm text-gray-600">
          {month ? `Month: ${month}` : "All Months Combined"}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => (
          <div
            key={idx}
            className={`border rounded-xl p-4 shadow-sm ${card.color}`}
          >
            <p className="text-sm font-medium">{card.label}</p>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Project Breakdown Table */}
      <div className="overflow-x-auto border rounded-xl shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">
                Project Name
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Total Cost ($)
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Billable ($)
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Non-Billable ($)
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Resources
              </th>
            </tr>
          </thead>

          <tbody>
            {project_breakdown.map((proj, idx) => (
              <tr
                key={proj.project_id || idx}
                className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-blue-50 transition`}
              >
                <td className="px-4 py-2 border-b text-left font-medium text-gray-900">
                  {proj.project_name}
                </td>
                <td className="px-4 py-2 border-b text-center">
                  ${proj.total_cost.toLocaleString()}
                </td>
                <td className="px-4 py-2 border-b text-center text-green-700">
                  ${proj.billable_cost.toLocaleString()}
                </td>
                <td className="px-4 py-2 border-b text-center text-yellow-700">
                  ${proj.non_billable_cost.toLocaleString()}
                </td>
                <td className="px-4 py-2 border-b text-center">
                  {proj.resource_count}
                </td>
              </tr>
            ))}

            {project_breakdown.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="text-center py-4 text-gray-500 italic"
                >
                  No project data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyAnalysisTable;
