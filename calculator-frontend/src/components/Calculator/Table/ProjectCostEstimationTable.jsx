import React from "react";

const ProjectCostEstimationTable = ({ data = {} }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center text-gray-500 py-10">
        No data available.
      </div>
    );
  }

  const {
    project_id = "—",
    project_name = "—",
    total_records = 0,
    total_resources = 0,
    total_hours = 0,
    total_cost = 0,
    breakdown = [],
  } = data;

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white shadow-md rounded-2xl space-y-6">
      {/* Summary Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
          <p className="text-sm text-gray-500">Project ID</p>
          <p className="font-semibold text-gray-800 truncate">{project_id}</p>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
          <p className="text-sm text-gray-500">Project Name</p>
          <p className="font-semibold text-gray-800">{project_name}</p>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
          <p className="text-sm text-gray-500">Total Records</p>
          <p className="font-semibold text-gray-800">{total_records}</p>
        </div>

        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
          <p className="text-sm text-gray-500">Total Resources</p>
          <p className="font-semibold text-gray-800">{total_resources}</p>
        </div>

        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
          <p className="text-sm text-gray-500">Total Hours</p>
          <p className="font-semibold text-gray-800">{total_hours}</p>
        </div>

        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
          <p className="text-sm text-gray-500">Total Cost</p>
          <p className="font-semibold text-gray-800">
            ₹{Number(total_cost).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Breakdown Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="py-3 px-4 text-left">Resource Name</th>
              <th className="py-3 px-4 text-left">Role</th>
              <th className="py-3 px-4 text-left">Subproject</th>
              <th className="py-3 px-4 text-left">Productivity</th>
              <th className="py-3 px-4 text-center">Hours</th>
              <th className="py-3 px-4 text-center">Rate</th>
              <th className="py-3 px-4 text-center">Cost</th>
              <th className="py-3 px-4 text-center">Billable</th>
              <th className="py-3 px-4 text-center">Month</th>
              <th className="py-3 px-4 text-center">Year</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.length > 0 ? (
              breakdown.map((item) => (
                <tr
                  key={item.billing_id}
                  className="border-t hover:bg-gray-50 transition"
                >
                  <td className="py-3 px-4">{item.resource_name || "—"}</td>
                  <td className="py-3 px-4">{item.resource_role || "—"}</td>
                  <td className="py-3 px-4">{item.subproject_name || "—"}</td>
                  <td className="py-3 px-4">{item.productivity_level || "—"}</td>
                  <td className="py-3 px-4 text-center">{item.hours || 0}</td>
                  <td className="py-3 px-4 text-center">
                    ₹{Number(item.rate || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    ₹{Number(item.cost || 0).toLocaleString()}
                  </td>
                  <td
                    className={`py-3 px-4 text-center font-medium ${item.billable_status === "Billable"
                        ? "text-green-600"
                        : "text-gray-600"
                      }`}
                  >
                    {item.billable_status || "—"}
                  </td>
                  <td className="py-3 px-4 text-center">{item.month || "—"}</td>
                  <td className="py-3 px-4 text-center">{item.year || "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="10"
                  className="text-center py-6 text-gray-500 italic"
                >
                  No detailed records available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProjectCostEstimationTable;
