// components/Project/EditSubProjectModal.jsx - UPDATED for Verisma & MRO
import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import axios from "axios";

const EditSubProjectModal = ({ isOpen, onClose, subProject, project, refreshProjects }) => {
  const apiUrl = import.meta.env.VITE_BACKEND_URL;
  
  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [rate, setRate] = useState(0);  // Renamed from flatrate
  
  // Hierarchy
  const [geographyId, setGeographyId] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  
  // Client/Project info for conditional rendering
  const [isMRO, setIsMRO] = useState(false);
  const [projectName, setProjectName] = useState("");
  
  // ========== VERISMA Request Types ==========
  const [newRequestRate, setNewRequestRate] = useState(0);
  const [keyRate, setKeyRate] = useState(0);
  const [duplicateRate, setDuplicateRate] = useState(0);
  
  const [requestTypeIds, setRequestTypeIds] = useState({
    newRequest: null,
    key: null,
    duplicate: null,
  });
  
  // ========== MRO Requestor Types ==========
  const [nrsNoRecordsRate, setNrsNoRecordsRate] = useState(0);
  const [manualRate, setManualRate] = useState(0);
  const [otherProcessingRate, setOtherProcessingRate] = useState(0);
  const [processedRate, setProcessedRate] = useState(0);
  const [fileDropRate, setFileDropRate] = useState(0);
  const [payoutRate, setPayoutRate] = useState(0);
  
  const [requestorTypeIds, setRequestorTypeIds] = useState({
    nrsNoRecords: null,
    manual: null,
    otherProcessing: null,
    processed: null,
    fileDrop: null,
  });
  
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
    if (subProject) {
      setName(subProject.name || "");
      setDescription(subProject.description || "");
      setStatus(subProject.status || "active");
      setRate(subProject.rate || subProject.flatrate || 0);
      setPayoutRate(subProject.rate || subProject.flatrate || 0);
      setGeographyId(subProject.geography_id || project?.geography_id || "");
      setClientId(subProject.client_id || project?.client_id || "");
      setProjectId(subProject.project_id || project?._id || "");
      
      // Determine if MRO
      const clientIsMRO = subProject.client_name?.toLowerCase() === 'mro' || 
                          subProject.isMRO || 
                          project?.client_name?.toLowerCase() === 'mro';
      setIsMRO(clientIsMRO);
      setProjectName(subProject.project_name || project?.name || "");

      // ========== VERISMA: Extract request type rates ==========
      if (Array.isArray(subProject.request_types)) {
        const newReq = subProject.request_types.find(
          (rt) => rt.name === "New Request"
        );
        const key = subProject.request_types.find((rt) => rt.name === "Key");
        const dup = subProject.request_types.find(
          (rt) => rt.name === "Duplicate"
        );

        setNewRequestRate(newReq?.rate || 0);
        setKeyRate(key?.rate || 0);
        setDuplicateRate(dup?.rate || 0);

        setRequestTypeIds({
          newRequest: newReq?._id || null,
          key: key?._id || null,
          duplicate: dup?._id || null,
        });
      }
      
      // ========== MRO: Extract requestor type rates ==========
      if (Array.isArray(subProject.requestor_types)) {
        const nrs = subProject.requestor_types.find(
          (rt) => rt.name === "NRS-NO Records"
        );
        const manual = subProject.requestor_types.find(
          (rt) => rt.name === "Manual"
        );
        const other = subProject.requestor_types.find(
          (rt) => rt.name?.includes("Other Processing")
        );
        const processed = subProject.requestor_types.find(
          (rt) => rt.name === "Processed"
        );
        const fileDrop = subProject.requestor_types.find(
          (rt) => rt.name?.includes("File Drop")
        );

        setNrsNoRecordsRate(nrs?.rate || 0);
        setManualRate(manual?.rate || 0);
        setOtherProcessingRate(other?.rate || 0);
        setProcessedRate(processed?.rate || 0);
        setFileDropRate(fileDrop?.rate || 0);

        setRequestorTypeIds({
          nrsNoRecords: nrs?._id || null,
          manual: manual?._id || null,
          otherProcessing: other?._id || null,
          processed: processed?._id || null,
          fileDrop: fileDrop?._id || null,
        });
      }
    }
  }, [subProject, project]);

  useEffect(() => {
    if (geographyId) {
      fetchClients(geographyId);
    }
  }, [geographyId]);

  useEffect(() => {
    if (clientId) {
      fetchProjects(clientId);
      
      // Update isMRO when client changes
      const selectedClient = clients.find(c => c._id === clientId);
      if (selectedClient) {
        setIsMRO(selectedClient.name?.toLowerCase() === 'mro');
      }
    }
  }, [clientId, clients]);

  useEffect(() => {
    if (projectId) {
      // Update project name when project changes
      const selectedProject = projects.find(p => p._id === projectId);
      if (selectedProject) {
        setProjectName(selectedProject.name || "");
      }
    }
  }, [projectId, projects]);

  // Helper: Is this MRO Processing project?
  const isMROProcessing = isMRO && projectName?.toLowerCase() === 'processing';
  // Helper: Is this MRO Logging or Payer project?
  const isMROLoggingOrPayer = isMRO && (
    projectName?.toLowerCase() === 'logging' || 
    projectName?.toLowerCase().includes('payer')
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Location name is required");
    if (!geographyId) return toast.error("Please select a geography");
    if (!clientId) return toast.error("Please select a client");
    if (!projectId) return toast.error("Please select a project");

    setLoading(true);
    try {
      // Update subproject
      const subprojectResponse = await axios.put(
        `${apiUrl}/project/subproject/${subProject._id}`,
        {
          name: name.trim(),
          status,
          project_id: projectId,
          client_id: clientId,
          geography_id: geographyId,
          rate: isMROProcessing ? (parseFloat(payoutRate) || 0) : (parseFloat(rate) || 0),
        }
      );

      if (subprojectResponse.status === 200) {
        const updatePromises = [];

        // ========== VERISMA: Update request types ==========
        if (!isMRO) {
          const requestTypes = [
            {
              id: requestTypeIds.newRequest,
              name: "New Request",
              rate: parseFloat(newRequestRate) || 0,
            },
            {
              id: requestTypeIds.key,
              name: "Key",
              rate: parseFloat(keyRate) || 0,
            },
            {
              id: requestTypeIds.duplicate,
              name: "Duplicate",
              rate: parseFloat(duplicateRate) || 0,
            },
          ];

          requestTypes.forEach((rt) => {
            if (rt.id) {
              updatePromises.push(
                axios.put(
                  `${apiUrl}/project/subproject/${subProject._id}/request-type/${rt.id}`,
                  { rate: rt.rate }
                )
              );
            } else {
              updatePromises.push(
                axios.post(
                  `${apiUrl}/project/subproject/${subProject._id}/request-type`,
                  {
                    name: rt.name,
                    rate: rt.rate,
                    project_id: projectId,
                    client_id: clientId,
                    geography_id: geographyId,
                  }
                )
              );
            }
          });
        }

        // ========== MRO Processing: Update requestor types ==========
        if (isMROProcessing) {
          const requestorTypes = [
            {
              id: requestorTypeIds.nrsNoRecords,
              name: "NRS-NO Records",
              rate: parseFloat(nrsNoRecordsRate) || 0,
            },
            {
              id: requestorTypeIds.manual,
              name: "Manual",
              rate: parseFloat(manualRate) || 0,
            },
            {
              id: requestorTypeIds.otherProcessing,
              name: "Other Processing (Canceled/Released By Other)",
              rate: parseFloat(otherProcessingRate) || 0,
            },
            {
              id: requestorTypeIds.processed,
              name: "Processed",
              rate: parseFloat(processedRate) || 0,
            },
            {
              id: requestorTypeIds.fileDrop,
              name: "Processed through File Drop",
              rate: parseFloat(fileDropRate) || 0,
            },
          ];

          requestorTypes.forEach((rt) => {
            if (rt.id) {
              updatePromises.push(
                axios.put(
                  `${apiUrl}/project/subproject/${subProject._id}/requestor-type/${rt.id}`,
                  { rate: rt.rate }
                )
              );
            } else {
              updatePromises.push(
                axios.post(
                  `${apiUrl}/project/subproject/${subProject._id}/requestor-type`,
                  {
                    name: rt.name,
                    rate: rt.rate,
                    project_id: projectId,
                    client_id: clientId,
                    geography_id: geographyId,
                  }
                )
              );
            }
          });
        }

        await Promise.all(updatePromises);

        toast.success("Location updated successfully");
        refreshProjects();
        onClose();
      }
    } catch (error) {
      console.error("Error updating location:", error);
      if (error.response?.status === 409) {
        toast.error("Location name already exists in this project");
      } else {
        toast.error(error.response?.data?.error || "Failed to update location");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !subProject) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl p-6 relative max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2 border-b">
          <h2 className="text-xl font-semibold">
            Edit <span className={isMRO ? "text-green-700" : "text-blue-700"}>
              {isMRO ? "MRO " : ""}Location
            </span>
            {isMRO && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({projectName})
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
            disabled={loading}
          >
            &times;
          </button>
        </div>

        {/* Client Type Badge */}
        {isMRO && (
          <div className="mb-4 flex items-center gap-2">
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              🏥 MRO Client
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              isMROProcessing 
                ? "bg-teal-100 text-teal-700" 
                : isMROLoggingOrPayer 
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-700"
            }`}>
              {isMROProcessing && "📊 Processing"}
              {projectName?.toLowerCase() === 'logging' && "📝 Logging"}
              {projectName?.toLowerCase().includes('payer') && "💰 Payer Project"}
            </span>
          </div>
        )}

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
                  {projects.map((proj) => (
                    <option key={proj._id} value={proj._id}>
                      {proj.name}
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

          {/* ========== VERISMA: Request Type Payout Rates ========== */}
          {!isMRO && (
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Payout Rate by Request Type <span className="text-xs font-normal text-gray-400">(optional)</span>
              </h3>
              
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
          )}

          {/* ========== MRO Processing: Requestor Type Rates ========== */}
          {isMROProcessing && (
            <div className="bg-green-50 p-4 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Requestor Type Rates (MRO Processing)
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-teal-700 mb-1">
                    NRS-NO Records Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={nrsNoRecordsRate}
                    onChange={(e) => setNrsNoRecordsRate(e.target.value)}
                    placeholder="2.25"
                    disabled={loading}
                    className="w-full border border-teal-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-teal-500 disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-blue-700 mb-1">
                    Manual Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    placeholder="3.00"
                    disabled={loading}
                    className="w-full border border-blue-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Other Processing Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={otherProcessingRate}
                    onChange={(e) => setOtherProcessingRate(e.target.value)}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-gray-500 disabled:opacity-70"
                  />
                  <p className="text-xs text-gray-400 mt-1">Canceled/Released By Other</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Processed Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={processedRate}
                    onChange={(e) => setProcessedRate(e.target.value)}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-gray-500 disabled:opacity-70"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Processed through File Drop Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fileDropRate}
                    onChange={(e) => setFileDropRate(e.target.value)}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-gray-500 disabled:opacity-70"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-purple-700 mb-1">
                    Payout Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={payoutRate}
                    onChange={(e) => setPayoutRate(e.target.value)}
                    placeholder="0.00"
                    disabled={loading}
                    className="w-full border border-purple-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 disabled:opacity-70"
                  />
                  <p className="text-xs text-gray-500 mt-1">Payout rate per case paid to resource</p>
                </div>
              </div>
            </div>
          )}

          {/* ========== MRO Logging/Payer: Billing Rate ========== */}
          {isMROLoggingOrPayer && (
            <div className="bg-emerald-50 p-4 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Billing Rate (MRO {projectName})
              </h3>

              <div>
                <label className="block text-sm font-medium text-emerald-700 mb-1">
                  Billing Rate ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="1.08"
                  disabled={loading}
                  className="w-full border border-emerald-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-emerald-500 disabled:opacity-70"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {projectName?.toLowerCase() === 'logging'
                    ? "Billing rate per case for logging work"
                    : "Billing rate per case for payer project"}
                </p>
              </div>
            </div>
          )}

          {/* Verisma Payout Rate */}
          {!isMRO && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payout Rate ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                disabled={loading}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Payout rate for this location
              </p>
            </div>
          )}

          {/* Summary */}
          <div className={`p-3 rounded-lg ${isMRO ? 'bg-green-100' : 'bg-gray-100'}`}>
            {!isMRO && (
              <p className="text-xs text-gray-600">
                <strong>Request Type Total:</strong> $
                {(
                  parseFloat(newRequestRate || 0) +
                  parseFloat(keyRate || 0) +
                  parseFloat(duplicateRate || 0)
                ).toFixed(2)}
                {parseFloat(rate || 0) > 0 && (
                  <span> | <strong>Payout Rate:</strong> ${parseFloat(rate || 0).toFixed(2)}</span>
                )}
              </p>
            )}
            {isMROProcessing && (
              <p className="text-xs text-green-700">
                <strong>Billing Rates:</strong> NRS-NO Records: ${parseFloat(nrsNoRecordsRate || 0).toFixed(2)} | Manual: ${parseFloat(manualRate || 0).toFixed(2)}
                {parseFloat(payoutRate || 0) > 0 && (
                  <span> | <strong>Payout Rate:</strong> ${parseFloat(payoutRate || 0).toFixed(2)}</span>
                )}
              </p>
            )}
            {isMROLoggingOrPayer && (
              <p className="text-xs text-emerald-700">
                <strong>Billing Rate:</strong> ${parseFloat(rate || 0).toFixed(2)}
              </p>
            )}
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
              disabled={loading}
              className={`px-4 py-2 rounded-md text-white transition-all ${
                loading 
                  ? "bg-gray-400 cursor-not-allowed" 
                  : isMRO 
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading ? "Updating..." : "Update Location"}
            </button>
          </div>
        </form>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-lg">
            <div className="flex flex-col items-center gap-2">
              <div className={`animate-spin rounded-full h-10 w-10 border-4 border-t-transparent ${
                isMRO ? 'border-green-500' : 'border-blue-500'
              }`}></div>
              <span className="text-sm text-gray-600">Updating location...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EditSubProjectModal;