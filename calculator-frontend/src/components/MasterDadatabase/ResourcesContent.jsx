import React, { useEffect, useState, useMemo } from "react";


const BackendUrl = import.meta.env.VITE_BACKEND_URL;
const API_URL = `${BackendUrl}/resource`;

const ResourcesContent = () => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Failed to fetch resources");
        const data = await res.json();
        setResources(data.resources);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchResources();
  }, []);

  // Filtered resources based on search
  const filteredResources = useMemo(() => {
    if (!search) return resources;
    return resources.filter((res) =>
      res.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, resources]);

  if (loading)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading resources...
      </div>
    );

  if (error)
    return (
      <div className="flex items-center justify-center h-64 text-red-600">
        Error: {error}
      </div>
    );

  if (!resources.length)
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No resources found.
      </div>
    );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">
        Resource Directory
      </h1>

      {/* Search Input */}
      <input
        type="text"
        placeholder="Search by resource name..."
        className="mb-4 p-2 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200 bg-white">
        <table className="min-w-full text-sm text-left text-gray-700">
          <thead className="bg-gray-100 text-gray-900 uppercase text-xs tracking-wider">
            <tr>
              <th className="px-6 py-3">Resource</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Assigned Projects/Process</th>
              {/* <th className="px-6 py-3">Assigned Subprojects</th> */}
              <th className="px-6 py-3">Created</th>
              <th className="px-6 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredResources.map((res, index) => (
              <tr
                key={res._id}
                className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } hover:bg-gray-100 transition`}
              >
                {/* Resource Info */}
                <td className="px-6 py-4 flex items-center gap-3">
                  <img
                    src={res.avatar_url}
                    alt={res.name}
                    className="w-10 h-10 rounded-full object-cover border"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{res.name}</div>
                    <div className="text-xs text-gray-500">
                      ID: {res._id.slice(-6)}
                    </div>
                  </div>
                </td>

                {/* Role */}
                <td className="px-6 py-4">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                    {res.role}
                  </span>
                </td>

                {/* Email */}
                <td className="px-6 py-4 text-gray-600">{res.email}</td>

                {/* Assigned Projects */}
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    {res.assigned_projects.length > 0 ? (
                      res.assigned_projects.map((p) => (
                        <span
                          key={p._id}
                          className="bg-gray-100 text-gray-800 text-xs px-3 py-1 rounded-full border"
                        >
                          {p.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>
                </td>

                {/* Assigned Subprojects */}
                {/* <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    {res.assigned_subprojects.length > 0 ? (
                      res.assigned_subprojects.map((sp) => (
                        <span
                          key={sp._id}
                          className="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full border border-green-200"
                        >
                          {sp.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>
                </td> */}

                {/* Dates */}
                <td className="px-6 py-4 text-gray-500">
                  {new Date(res.createdAt).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(res.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResourcesContent;
