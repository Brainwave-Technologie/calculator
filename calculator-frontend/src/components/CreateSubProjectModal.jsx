// components/CreateSubProjectModal.jsx - UPDATED
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";

const CreateSubProjectModal = ({ isOpen, onClose, refreshProjects }) => {
  const apiUrl = import.meta.env.VITE_BACKEND_URL;
  
  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [flatrate, setFlatrate] = useState(0);
  
  // Hierarchy
  const [geographyId, setGeographyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  
  // Request types
  const [newRequestRate, setNewRequestRate] = useState(0);
  const [keyRate, setKeyRate] = useState(0);
  const [duplicateRate, setDuplicateRate] = useState(0);
  
  // Data
  const [geographies, setGeographies] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [fetchingGeographies, setFetchingGeographies] = useState(false);
  const [fetchingClients, setFetchingClients] = useState(false);
  const [fetchingProjects, setFetchingProjects] = useState(false);

  // Fetch geographies
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

  // Fetch clients by geography
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

  // Fetch projects by client
  const fetchProjects = async (cliId) => {
    if (!cliId) {
      setProjects([]);
      return;
    }

    setFetchingProjects(true);
    try {
      const response = await axios.get(`${apiUrl}/project/client/${cliId}`, {
        params: { page: 1, limit: 1000 },
      });
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast.error("Failed to fetch projects");
      setProjects([]);
    } finally {
      setFetchingProjects(false);
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
      setClientId("");
      setProjectId("");
      setProjects([]);
    }
  }, [geographyId]);

  useEffect(() => {
    if (clientId) {
      fetchProjects(clientId);
      setProjectId("");
    }
  }, [clientId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Location name is required");
    if (!geographyId) return toast.error("Please select a geography");
    if (!clientId) return toast.error("Please select a client");
    if (!projectId) return toast.error("Please select a project");

    setLoading(true);
    try {
      // Create subproject
      const subprojectResponse = await axios.post(`${apiUrl}/project/subproject`, {
        name: name.trim(),
        description: description.trim(),
        status,
        project_id: projectId,
        client_id: clientId,
        geography_id: geographyId,
        flatrate: parseFloat(flatrate) || 0,
      });

      if (subprojectResponse.status === 201) {
        const subprojectId = subprojectResponse.data._id;

        // Create request types
        const requestTypes = [
          { name: "New Request", rate: parseFloat(newRequestRate) || 0 },
          { name: "Key", rate: parseFloat(keyRate) || 0 },
          { name: "Duplicate", rate: parseFloat(duplicateRate) || 0 },
        ];

        // Create request types in parallel
        const requestTypePromises = requestTypes.map((rt) =>
          axios.post(`${apiUrl}/project/subproject/${subprojectId}/request-type`, {
            name: rt.name,
            rate: rt.rate,
            project_id: projectId,
            client_id: clientId,
            geography_id: geographyId,
          })
        );

        await Promise.all(requestTypePromises);

        toast.success("Location created successfully");
        resetForm();
        refreshProjects();
        onClose();
      }
    } catch (error) {
      console.error("Error creating location:", error);
      if (error.response?.status === 409) {
        toast.error("Location name already exists in this project");
      } else {
        toast.error(error.response?.data?.error || "Failed to create location");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setStatus("active");
    setFlatrate(0);
    setGeographyId("");
    setClientId("");
    setProjectId("");
    setNewRequestRate(0);
    setKeyRate(0);
    setDuplicateRate(0);
    setClients([]);
    setProjects([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 relative max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2 border-b">
          <h2 className="text-xl font-semibold">
            Create New <span className="text-blue-700">Location</span>
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
          {/* Hierarchy Selection */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Hierarchy Selection</h3>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Geography <span className="text-red-500">*</span>
                </label>
                <select
                  value={geographyId}
                  onChange={(e) => setGeographyId(e.target.value)}
                  disabled={loading || fetchingGeographies}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70 text-sm"
                  required
                >
                  <option value="">
                    {fetchingGeographies ? "Loading..." : "Select"}
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70 text-sm"
                  required
                >
                  <option value="">
                    {!geographyId
                      ? "Select geography first"
                      : fetchingClients
                      ? "Loading..."
                      : "Select"}
                  </option>
                  {clients.map((client) => (
                    <option key={client._id} value={client._id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project <span className="text-red-500">*</span>
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={loading || fetchingProjects || !clientId}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70 text-sm"
                  required
                >
                  <option value="">
                    {!clientId
                      ? "Select client first"
                      : fetchingProjects
                      ? "Loading..."
                      : "Select"}
                  </option>
                  {projects.map((project) => (
                    <option key={project._id} value={project._id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Location Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., New York Office, Atlanta Clinic"
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Request Type Rates */}
          <div className="bg-blue-50 p-4 rounded-lg space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Request Type Rates</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-700 mb-1">
                  New Request Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newRequestRate}
                  onChange={(e) => setNewRequestRate(e.target.value)}
                  placeholder="0.00"
                  disabled={loading}
                  className="w-full border border-blue-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-purple-700 mb-1">
                  Key Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={keyRate}
                  onChange={(e) => setKeyRate(e.target.value)}
                  placeholder="0.00"
                  disabled={loading}
                  className="w-full border border-purple-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-orange-700 mb-1">
                  Duplicate Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={duplicateRate}
                  onChange={(e) => setDuplicateRate(e.target.value)}
                  placeholder="0.00"
                  disabled={loading}
                  className="w-full border border-orange-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-orange-500 disabled:opacity-70"
                />
              </div>
            </div>
          </div>

          {/* Flat Rate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Flat Rate ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={flatrate}
              onChange={(e) => setFlatrate(e.target.value)}
              placeholder="0.00"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
            />
            <p className="text-xs text-gray-500 mt-1">
              Optional: Additional fixed rate for this location
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(Optional) Brief description about this location"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
            />
          </div>

          {/* Summary */}
          <div className="bg-gray-100 p-3 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>Total Rate:</strong> $
              {(
                parseFloat(newRequestRate || 0) +
                parseFloat(keyRate || 0) +
                parseFloat(duplicateRate || 0)
              ).toFixed(2)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
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
              disabled={loading || !projectId}
              className={`px-4 py-2 rounded-md text-white transition-all ${
                loading || !projectId
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Creating..." : "Create Location"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <span className="text-sm text-gray-600">Creating location...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateSubProjectModal;