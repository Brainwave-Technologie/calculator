import React from "react";

const ResourceAllocationTable = ({ data }) => {
  if (!data) {
    return (
      <div className="text-gray-500 italic text-center py-6">
        No data available.
      </div>
    );
  }

  const {
    month,
    year,
    total_resources,
    available_resources,
    allocated_resources,
    allocation_percentage,
    resource_breakdown = [],
  } = data;

  const summaryCards = [
    {
      label: "Total Resources",
      value: total_resources,
      color: "bg-blue-100 text-blue-800 border-blue-300",
    },
    {
      label: "Available Resources",
      value: available_resources,
      color: "bg-green-100 text-green-800 border-green-300",
    },
    {
      label: "Allocated Resources",
      value: allocated_resources,
      color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    },
    {
      label: "Allocation %",
      value: `${(allocation_percentage).toFixed(2)}%`,
      color: "bg-purple-100 text-purple-800 border-purple-300",
    },
  ];

  return (
    <div className="space-y-6 mt-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Monthly Resource Summary
        </h3>
        <p className="text-sm text-gray-600">
          {month && year
            ? `Month: ${month}, Year: ${year}`
            : "All Months Combined"}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <div
            key={i}
            className={`border rounded-xl p-4 shadow-sm ${card.color}`}
          >
            <p className="text-sm font-medium">{card.label}</p>
            <p className="text-2xl font-bold mt-2">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-xl shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">
                Name
              </th>
              <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">
                Role
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Assigned Projects
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Assigned Subprojects
              </th>
              <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">
                Productivity
              </th>
            </tr>
          </thead>

          <tbody>
            {resource_breakdown.map((res, idx) => (
              <tr
                key={res.resource_id || idx}
                className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover: bg-blue - 50 transition`}
              >
                <td className="px-4 py-2 border-b">{res.name}</td>
                <td className="px-4 py-2 border-b">{res.role}</td>

                {/* Projects Grid */}
                <td className="px-4 py-2 border-b text-center">
                  {res.assigned_projects.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1 justify-items-center">
                      {res.assigned_projects.map((proj, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium truncate w-24"
                        >
                          {proj}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">None</span>
                  )}
                </td>

                {/* Subprojects Grid */}
                <td className="px-4 py-2 border-b text-center">
                  {res.assigned_subprojects.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1 justify-items-center">
                      {res.assigned_subprojects.map((sub, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-medium truncate w-24"
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">None</span>
                  )}
                </td>

                {/* Utilization */}
                <td
                  className={`px - 4 py - 2 border - b text - center font - medium ${res.utilization === "High"
                    ? "text-green-600"
                    : res.utilization === "Medium"
                      ? "text-yellow-600"
                      : "text-gray-600"
                    } `}
                >
                  {res.utilization}
                </td>
              </tr>
            ))}

            {resource_breakdown.length === 0 && (
              <tr>
                <td
                  colSpan="5"
                  className="text-center py-4 text-gray-500 italic"
                >
                  No resource data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResourceAllocationTable;
