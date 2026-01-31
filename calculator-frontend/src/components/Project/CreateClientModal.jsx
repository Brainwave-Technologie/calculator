// components/Project/CreateClientModal.jsx
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";

const CreateClientModal = ({ isOpen, onClose, refreshClients }) => {
  const apiUrl = import.meta.env.VITE_BACKEND_URL;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [geographyId, setGeographyId] = useState("");
  const [geographies, setGeographies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingGeographies, setFetchingGeographies] = useState(false);

  const fetchGeographies = async () => {
    setFetchingGeographies(true);
    try {
      const response = await axios.get(`${apiUrl}/geography`, {
        params: { page: 1, limit: 1000 }, // Get all geographies
      });
      setGeographies(response.data.geographies || []);
    } catch (error) {
      console.error("Error fetching geographies:", error);
      toast.error("Failed to fetch geographies");
    } finally {
      setFetchingGeographies(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchGeographies();
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Client name is required");
    if (!geographyId) return toast.error("Please select a geography");

    setLoading(true);
    try {
      const response = await axios.post(`${apiUrl}/client`, {
        name: name.trim(),
        description: description.trim(),
        status,
        geography_id: geographyId,
      });

      if (response.status === 201) {
        toast.success("Client created successfully");
        setName("");
        setDescription("");
        setStatus("active");
        setGeographyId("");
        refreshClients();
        onClose();
      }
    } catch (error) {
      console.error("Error creating client:", error);
      if (error.response?.status === 409) {
        toast.error("Client name already exists in this geography");
      } else {
        toast.error(error.response?.data?.error || "Failed to create client");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Create New <span className="text-purple-700">Client</span>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Geography <span className="text-red-500">*</span>
            </label>
            <select
              value={geographyId}
              onChange={(e) => setGeographyId(e.target.value)}
              disabled={loading || fetchingGeographies}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
              required
            >
              <option value="">
                {fetchingGeographies ? "Loading geographies..." : "Select a geography"}
              </option>
              {geographies.map((geo) => (
                <option key={geo._id} value={geo._id}>
                  {geo.name}
                </option>
              ))}
            </select>
            {geographies.length === 0 && !fetchingGeographies && (
              <p className="text-xs text-gray-500 mt-1">
                No geographies found. Please create a geography first.
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client/Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ABC Corporation"
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
                required
              />
            </div>

            {/* <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div> */}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows="4"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(Optional) Brief description about the client"
              disabled={loading}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
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
                  ? "bg-purple-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {loading ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateClientModal;