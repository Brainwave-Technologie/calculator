import React, { useEffect, useState, useMemo } from "react";

const ProductivityContent = () => {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const apiUrl = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    const fetchTiers = async () => {
      try {
        const response = await fetch(
          `${apiUrl}/level/tiers`
        );
        if (!response.ok) throw new Error("No productivity tiers found");
        const data = await response.json();
        setTiers(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTiers();
  }, []);

  // Filter tiers by resource (subProject) or project name
  const filteredTiers = useMemo(() => {
    if (!search) return tiers;
    return tiers.filter(
      (tier) =>
        tier.project.toLowerCase().includes(search.toLowerCase()) ||
        tier.subProject.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, tiers]);

  if (loading)
    return (
      <div className="flex justify-center items-center py-10 text-gray-500">
        Loading productivity data...
      </div>
    );

  if (error)
    return (
     <div className="flex justify-center items-center py-10 text-gray-500">{error}</div>
    );
    if (!tiers.length)
    return (
      <div className="flex justify-center items-center py-10 text-gray-500">
        No productivity tiers available.
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto mt-10 bg-white shadow-md rounded-2xl overflow-hidden border border-gray-100">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-800">
          Productivity Tiers
        </h2>
        <p className="text-sm text-gray-500">Rate levels per project/subproject</p>
      </div>

      {/* Search Input */}
      <div className="p-4">
        <input
          type="text"
          placeholder="Search by project or subproject..."
          className="w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
            <tr>
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Project</th>
              <th className="px-6 py-3">Subproject</th>
              <th className="px-6 py-3">Level</th>
              <th className="px-6 py-3 text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredTiers.map((tier) => (
              <tr
                key={tier.id}
                className="hover:bg-gray-50 transition-colors duration-150"
              >
                <td className="px-6 py-4 text-gray-600">{tier.id}</td>
                <td className="px-6 py-4 font-medium text-gray-800">{tier.project}</td>
                <td className="px-6 py-4 text-gray-600">{tier.subProject}</td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${tier.level === "High"
                      ? "bg-red-100 text-red-700"
                      : tier.level === "Medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : tier.level === "Low"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                  >
                    {tier.level}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-semibold text-gray-900">
                  ₹{tier.rate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductivityContent;
