// components/CreateProjectModal.jsx - UPDATED
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";

const CreateProjectModal = ({ isOpen, onClose, refreshProjects }) => {
  const apiUrl = import.meta.env.VITE_BACKEND_URL;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const [status, setStatus] = useState("active");
  const [geographyId, setGeographyId] = useState("");
  const [clientId, setClientId] = useState("");
  
  const [geographies, setGeographies] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingGeographies, setFetchingGeographies] = useState(false);
  const [fetchingClients, setFetchingClients] = useState(false);

  const fetchGeographies = async () => {
    setFetchingGeographies(true);
    try {
      const response = await axios.get(`${apiUrl}/geography`, {
        params: { page: 1, limit: 1000 },
      });
      setGeographies(response.data.geographies || []);
    } catch (error) {
      console.error("Error fetching geographies:", error);
      toast.error("Failed to fetch geographies");
    } finally {
      setFetchingGeographies(false);
    }
  };

  const fetchClients = async (geoId) => {
    if (!geoId) {
      setClients([]);
      return;
    }

    setFetchingClients(true);
    try {
      const response = await axios.get(`${apiUrl}/client/geography/${geoId}`, {
        params: { page: 1, limit: 1000 },
      });
      setClients(response.data.clients || []);
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
      setClients([]);
    } finally {
      setFetchingClients(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGeographies();
    }
  }, [isOpen]);

  useEffect(() => {
    if (geographyId) {
      fetchClients(geographyId);
      setClientId(""); // Reset client selection when geography changes
    }
  }, [geographyId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Project name is required");
    if (!geographyId) return toast.error("Please select a geography");
    if (!clientId) return toast.error("Please select a client");

    setLoading(true);
    try {
      const response = await axios.post(`${apiUrl}/project`, {
        name: name.trim(),
        description: description.trim(),
        visibility,
        status,
        geography_id: geographyId,
        client_id: clientId,
      });

      if (response.status === 201) {
        toast.success("Project created successfully");
        resetForm();
        refreshProjects();
        onClose();
      }
    } catch (error) {
      console.error("Error creating project:", error);
      if (error.response?.status === 409) {
        toast.error("Project name already exists for this client");
      } else {
        toast.error(error.response?.data?.error || "Failed to create project");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setVisibility("visible");
    setStatus("active");
    setGeographyId("");
    setClientId("");
    setClients([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Create New <span className="text-green-700">Project</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
            disabled={loading}
          >
            &times;
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Geography and Client Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Geography <span className="text-red-500">*</span>
              </label>
              <select
                value={geographyId}
                onChange={(e) => setGeographyId(e.target.value)}
                disabled={loading || fetchingGeographies}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
                required
              >
                <option value="">
                  {fetchingGeographies ? "Loading..." : "Select geography"}
                </option>
                {geographies.map((geo) => (
                  <option key={geo._id} value={geo._id}>
                    {geo.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={loading || fetchingClients || !geographyId}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
                required
              >
                <option value="">
                  {!geographyId
                    ? "Select geography first"
                    : fetchingClients
                    ? "Loading clients..."
                    : "Select client"}
                </option>
                {clients.map((client) => (
                  <option key={client._id} value={client._id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {geographyId && clients.length === 0 && !fetchingClients && (
                <p className="text-xs text-gray-500 mt-1">
                  No clients found for this geography. Please create a client first.
                </p>
              )}
            </div>
          </div>

          {/* Project Name and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Name (Process Type) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Data Processing, Medical Coding"
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
                required
              />
            </div>

            {/* <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div> */}
          </div>

          {/* Visibility */}
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
            >
              <option value="visible">Visible</option>
              <option value="hidden">Hidden</option>
            </select>
          </div> */}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(Optional) Brief description about the project"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-green-500 disabled:opacity-70"
            />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-70"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || geographies.length === 0}
              className={`px-4 py-2 rounded-md text-white transition-all ${
                loading || geographies.length === 0
                  ? "bg-green-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-green-500 border-t-transparent"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateProjectModal;