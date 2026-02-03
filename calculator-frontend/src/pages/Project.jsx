// pages/ProjectPage.jsx - UPDATED with Location Table Pagination
import { useEffect, useState, useRef, useCallback } from "react";
import { ChevronDown, ChevronRight, ChevronLeft, Edit2, Trash2, Plus } from "lucide-react";
import CreateGeographyModal from "../components/Project/CreateGeographyModal";
import CreateClientModal from "../components/Project/CreateClientModal";
import CreateProjectModal from "../components/CreateProjectModal";
import CreateSubProjectModal from "../components/CreateSubProjectModal";
import EditGeographyModal from "../components/Project/EditGeographyModal";
import EditClientModal from "../components/Project/EditClientModal";
import EditProjectModal from "../components/Project/EditProjectModal";
import EditSubProjectModal from "../components/Project/EditSubProjectModal";
import PageHeader from "../components/PageHeader";
import { FaUpload, FaInfoCircle } from "react-icons/fa";
import toast from "react-hot-toast";
import axios from "axios";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import DeleteGeographyModal from '../components/DeleteGeographyModal';

const ProjectPage = () => {
  const apiUrl = import.meta.env.VITE_BACKEND_URL;

  // State for hierarchical structure
  const [geographies, setGeographies] = useState([]);
  const [expandedGeographies, setExpandedGeographies] = useState({});
  const [expandedClients, setExpandedClients] = useState({});
  const [expandedProjects, setExpandedProjects] = useState({});

  // Cache structures
  const [clientsCache, setClientsCache] = useState({});
  const [projectsCache, setProjectsCache] = useState({});
  const [subprojectsCache, setSubprojectsCache] = useState({});

  const [loading, setLoading] = useState(false);
  const [showCsvFormat, setShowCsvFormat] = useState(false);
  const [showMroCsvFormat, setShowMroCsvFormat] = useState(false);

  // Pagination for geographies
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreGeographies, setHasMoreGeographies] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalGeographies, setTotalGeographies] = useState(0);
  const itemsPerPage = 30;

  // Modal states
  const [isCreateGeographyModalOpen, setIsCreateGeographyModalOpen] = useState(false);
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isCreateSubProjectModalOpen, setIsCreateSubProjectModalOpen] = useState(false);

  const [isEditGeographyModalOpen, setIsEditGeographyModalOpen] = useState(false);
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [isEditSubProjectModalOpen, setIsEditSubProjectModalOpen] = useState(false);

  const [selectedGeography, setSelectedGeography] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedSubProject, setSelectedSubProject] = useState(null);
  
const [deleteGeographyModal, setDeleteGeographyModal] = useState({ isOpen: false, geography: null });
  const scrollContainerRef = useRef(null);
  const loadingRef = useRef(false);

  // Helper to get rate from request types array
  const getRequestTypeRate = (requestTypes, typeName) => {
    if (!Array.isArray(requestTypes)) return 0;
    const type = requestTypes.find(
      (t) => t.name?.toLowerCase() === typeName.toLowerCase()
    );
    return type ? type.rate : 0;
  };

  // Helper to get rate from requestor types array (MRO)
  const getRequestorTypeRate = (requestorTypes, typeName) => {
    if (!Array.isArray(requestorTypes)) return 0;
    const type = requestorTypes.find(
      (t) => t.name?.toLowerCase().includes(typeName.toLowerCase())
    );
    return type ? type.rate : 0;
  };

  // ==================== FETCH GEOGRAPHIES ====================
  const fetchGeographies = useCallback(async (page = 1, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    if (page === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const response = await axios.get(`${apiUrl}/geography`, {
        params: { page, limit: itemsPerPage },
      });

      const geographiesData = response.data.geographies || [];

      if (append) {
        setGeographies((prev) => [...prev, ...geographiesData]);
      } else {
        setGeographies(geographiesData);
      }

      const pagination = response.data.pagination || {};
      setCurrentPage(page);
      setTotalGeographies(pagination.totalItems || 0);
      setHasMoreGeographies(pagination.hasNextPage);
    } catch (error) {
      console.error("Error fetching geographies:", error);
      toast.error("Failed to fetch geographies");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [apiUrl, itemsPerPage]);

  // ==================== FETCH CLIENTS ====================
  const fetchClients = useCallback(async (geographyId, page = 1, append = false) => {
    const currentCache = clientsCache[geographyId];
    if (currentCache?.loading) return;

    setClientsCache((prev) => ({
      ...prev,
      [geographyId]: {
        ...prev[geographyId],
        data: prev[geographyId]?.data || [],
        loading: true,
        page: page,
        hasMore: prev[geographyId]?.hasMore ?? true,
      },
    }));

    try {
      const response = await axios.get(`${apiUrl}/client/geography/${geographyId}`, {
        params: { page, limit: 30 },
      });

      const clientsData = response.data.clients || [];
      const hasMore = response.data.pagination?.hasMore || false;

      setClientsCache((prev) => ({
        ...prev,
        [geographyId]: {
          data: append 
            ? [...(prev[geographyId]?.data || []), ...clientsData] 
            : clientsData,
          loading: false,
          page: page,
          hasMore: hasMore,
        },
      }));
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
    }
  }, [apiUrl, clientsCache]);

  // ==================== FETCH PROJECTS ====================
  const fetchProjects = useCallback(async (clientId, page = 1, append = false) => {
    const currentCache = projectsCache[clientId];
    if (currentCache?.loading) return;

    setProjectsCache((prev) => ({
      ...prev,
      [clientId]: {
        ...prev[clientId],
        data: prev[clientId]?.data || [],
        loading: true,
        page: page,
        hasMore: prev[clientId]?.hasMore ?? true,
      },
    }));

    try {
      const response = await axios.get(`${apiUrl}/project/client/${clientId}`, {
        params: { page, limit: 30 },
      });

      const projectsData = response.data.projects || [];
      const hasMore = response.data.pagination?.hasMore || false;

      setProjectsCache((prev) => ({
        ...prev,
        [clientId]: {
          data: append 
            ? [...(prev[clientId]?.data || []), ...projectsData] 
            : projectsData,
          loading: false,
          page: page,
          hasMore: hasMore,
        },
      }));
    } catch (error) {
      console.error("Error fetching projects:", error);
      toast.error("Failed to fetch projects");
    }
  }, [apiUrl, projectsCache]);

  // ==================== FETCH SUBPROJECTS ====================
  const fetchSubprojects = useCallback(async (projectId, page = 1, append = false) => {
    setSubprojectsCache((prev) => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        data: append ? (prev[projectId]?.data || []) : [],
        loading: true,
        page: page,
        hasMore: prev[projectId]?.hasMore ?? true,
        totalItems: prev[projectId]?.totalItems || 0,
        totalPages: prev[projectId]?.totalPages || 1,
      },
    }));

    try {
      const response = await axios.get(`${apiUrl}/project/${projectId}/subproject`, {
        params: { page, limit: 10 },
      });

      let subprojectsData = [];
      let hasMore = false;
      let totalItems = 0;
      let totalPages = 1;
      let currentPageNum = page;

      if (response.data.pagination) {
        subprojectsData = response.data.data || [];
        hasMore = response.data.pagination.hasMore || false;
        totalItems = response.data.pagination.totalItems || 0;
        totalPages = response.data.pagination.totalPages || 1;
        currentPageNum = response.data.pagination.currentPage || page;
      } else {
        subprojectsData = Array.isArray(response.data) ? response.data : [];
        hasMore = false;
        totalItems = subprojectsData.length;
        totalPages = 1;
      }

      setSubprojectsCache((prev) => ({
        ...prev,
        [projectId]: {
          data: append 
            ? [...(prev[projectId]?.data || []), ...subprojectsData] 
            : subprojectsData,
          loading: false,
          page: currentPageNum,
          hasMore: hasMore,
          totalItems: totalItems,
          totalPages: totalPages,
        },
      }));
    } catch (error) {
      console.error("Error fetching subprojects:", error);
      toast.error("Failed to fetch subprojects");
      setSubprojectsCache((prev) => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          loading: false,
        },
      }));
    }
  }, [apiUrl]);

  // ==================== SUBPROJECT PAGINATION HANDLERS ====================
  const handleSubprojectPageChange = async (projectId, newPage) => {
    await fetchSubprojects(projectId, newPage, false);
  };

  // ==================== TOGGLE EXPAND ====================
  const toggleGeography = async (geographyId) => {
    const isExpanding = !expandedGeographies[geographyId];
    setExpandedGeographies((prev) => ({ ...prev, [geographyId]: isExpanding }));

    if (isExpanding && !clientsCache[geographyId]) {
      await fetchClients(geographyId, 1, false);
    }
  };

  const toggleClient = async (clientId) => {
    const isExpanding = !expandedClients[clientId];
    setExpandedClients((prev) => ({ ...prev, [clientId]: isExpanding }));

    if (isExpanding && !projectsCache[clientId]) {
      await fetchProjects(clientId, 1, false);
    }
  };

  const toggleProject = async (projectId) => {
    const isExpanding = !expandedProjects[projectId];
    setExpandedProjects((prev) => ({ ...prev, [projectId]: isExpanding }));

    if (isExpanding && !subprojectsCache[projectId]) {
      await fetchSubprojects(projectId, 1, false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchGeographies(1, false);
  }, [fetchGeographies]);

  // ==================== SCROLL HANDLER ====================
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || loading || loadingMore || !hasMoreGeographies) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    if (scrollHeight - scrollTop <= clientHeight * 1.2) {
      fetchGeographies(currentPage + 1, true);
    }
  }, [currentPage, hasMoreGeographies, loading, loadingMore, fetchGeographies]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // ==================== CRUD HANDLERS ====================
  const handleEditGeography = (geography, e) => {
    e.stopPropagation();
    setSelectedGeography(geography);
    setIsEditGeographyModalOpen(true);
  };

  // Update your handleDeleteGeography function
const handleDeleteGeography = (geography, e) => {
  e.stopPropagation();
  setDeleteGeographyModal({ isOpen: true, geography });
};

  const handleEditClient = (client, geography, e) => {
    e.stopPropagation();
    setSelectedClient(client);
    setSelectedGeography(geography);
    setIsEditClientModalOpen(true);
  };

  const handleDeleteClient = async (clientId, geographyId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this client? This will affect all projects under it.")) return;

    try {
      await axios.delete(`${apiUrl}/client/${clientId}`);
      toast.success("Client deleted");

      setClientsCache((prev) => ({
        ...prev,
        [geographyId]: {
          ...prev[geographyId],
          data: prev[geographyId]?.data?.filter((c) => c._id !== clientId) || [],
        },
      }));

      setGeographies((prev) =>
        prev.map((g) =>
          g._id === geographyId 
            ? { ...g, clientCount: Math.max(0, (g.clientCount || 1) - 1) } 
            : g
        )
      );
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete client");
    }
  };

  const handleEditProject = (project, client, e) => {
    e.stopPropagation();
    setSelectedProject(project);
    setSelectedClient(client);
    setIsEditProjectModalOpen(true);
  };

  const handleDeleteProject = async (projectId, clientId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this project? This deletes everything under it.")) return;

    try {
      await axios.delete(`${apiUrl}/project/${projectId}`);
      toast.success("Project deleted");

      setProjectsCache((prev) => ({
        ...prev,
        [clientId]: {
          ...prev[clientId],
          data: prev[clientId]?.data?.filter((p) => p._id !== projectId) || [],
        },
      }));
    } catch (error) {
      toast.error("Failed to delete project");
    }
  };

  const handleEditSubProject = (subproject, project, e) => {
    e.stopPropagation();
    setSelectedSubProject(subproject);
    setSelectedProject(project);
    setIsEditSubProjectModalOpen(true);
  };

  const handleDeleteSubProject = async (subprojectId, projectId, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this location?")) return;

    try {
      await axios.delete(`${apiUrl}/project/subproject/${subprojectId}`);
      toast.success("Location deleted");

      setSubprojectsCache((prev) => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          data: prev[projectId]?.data?.filter((sp) => sp._id !== subprojectId) || [],
          totalItems: Math.max(0, (prev[projectId]?.totalItems || 1) - 1),
        },
      }));
    } catch (error) {
      toast.error("Failed to delete location");
    }
  };

  // ==================== CSV UPLOADS ====================
 const handleVerismaCSVUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
    toast.error("Invalid CSV file");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  toast.loading("Uploading Verisma data...");

  try {
    // FIXED: Use Verisma-specific endpoint instead of generic bulk-upload
    const res = await axios.post(`${apiUrl}/upload/verisma-bulk-upload-replace`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "blob",
    });

    const isJSON = res.headers["content-type"]?.includes("application/json");

    if (isJSON) {
      const text = await res.data.text();
      const json = JSON.parse(text);
      toast.dismiss();
      toast.success(json.message || "Verisma data uploaded successfully!");
      console.log("Upload summary:", json.summary);
      refreshAll();
      return;
    }
  } catch (err) {
    if (err?.response?.status === 400 && err.response.headers["content-type"]?.includes("text/csv")) {
      const blob = err.response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "verisma-upload-errors.csv";
      a.click();
      toast.dismiss();
      toast.error("Errors found. Check downloaded CSV.");
      return;
    }
    toast.dismiss();
    const errorMsg = err?.response?.data?.error || "Upload failed.";
    toast.error(errorMsg);
  } finally {
    event.target.value = "";
  }
};
  const handleMROCSVUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "text/csv") {
      toast.error("Invalid CSV file");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    toast.loading("Uploading MRO data...");

    try {
      const res = await axios.post(`${apiUrl}/mro-upload/mro-bulk-upload-replace`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        responseType: "blob",
      });

      const isJSON = res.headers["content-type"]?.includes("application/json");

      if (isJSON) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        toast.dismiss();
        toast.success(json.message || "MRO data uploaded successfully!");
        refreshAll();
        return;
      }
    } catch (err) {
      if (err?.response?.status === 400 && err.response.headers["content-type"]?.includes("text/csv")) {
        const blob = err.response.data;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mro-upload-errors.csv";
        a.click();
        toast.dismiss();
        toast.error("Errors found. Check downloaded CSV.");
        return;
      }
      toast.dismiss();
      toast.error("MRO upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const refreshAll = () => {
    setExpandedGeographies({});
    setExpandedClients({});
    setExpandedProjects({});
    setClientsCache({});
    setProjectsCache({});
    setSubprojectsCache({});
    setGeographies([]);
    setCurrentPage(1);
    setHasMoreGeographies(true);
    fetchGeographies(1, false);
  };

  // ==================== RENDER LOCATION TABLE ====================
  const renderLocationTable = (subprojects, isMRO, projectName, projectId, subprojectCache) => {
    const isProcessing = projectName?.toLowerCase() === 'processing';
    const isLogging = projectName?.toLowerCase() === 'logging';
    const isPayer = projectName?.toLowerCase().includes('payer');

    const currentPageNum = subprojectCache?.page || 1;
    const totalPages = subprojectCache?.totalPages || 1;
    const totalItems = subprojectCache?.totalItems || subprojects.length;
    const isLoadingPage = subprojectCache?.loading || false;

    // Generate page numbers to display
    const getPageNumbers = () => {
      const pages = [];
      const maxVisiblePages = 5;
      
      if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        if (currentPageNum <= 3) {
          for (let i = 1; i <= 4; i++) pages.push(i);
          pages.push('...');
          pages.push(totalPages);
        } else if (currentPageNum >= totalPages - 2) {
          pages.push(1);
          pages.push('...');
          for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
        } else {
          pages.push(1);
          pages.push('...');
          for (let i = currentPageNum - 1; i <= currentPageNum + 1; i++) pages.push(i);
          pages.push('...');
          pages.push(totalPages);
        }
      }
      return pages;
    };

    return (
      <div className="space-y-0">
        <table className="min-w-full text-xs bg-white">
          <thead className="bg-gray-200">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Location</th>
              
              {/* MRO Processing - Show Requestor Types */}
              {isMRO && isProcessing ? (
                <>
                  <th className="px-4 py-2 text-right font-semibold text-teal-600">NRS-NO Records</th>
                  <th className="px-4 py-2 text-right font-semibold text-blue-600">Manual</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">Other Processing</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">Processed</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-500">File Drop</th>
                </>
              ) : isMRO && (isLogging || isPayer) ? (
                /* MRO Logging/Payer - Show Rate */
                <th className="px-4 py-2 text-right font-semibold text-emerald-600">Rate</th>
              ) : (
                /* Verisma - Show Request Types */
                <>
                  <th className="px-4 py-2 text-right font-semibold text-blue-600">New Request</th>
                  <th className="px-4 py-2 text-right font-semibold text-purple-600">Key</th>
                  <th className="px-4 py-2 text-right font-semibold text-orange-600">Duplicate</th>
                  <th className="px-4 py-2 text-right font-semibold">Rate</th>
                </>
              )}
              
              <th className="px-4 py-2 text-center font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingPage ? (
              <tr>
                <td colSpan={isMRO && isProcessing ? 7 : isMRO && (isLogging || isPayer) ? 3 : 6} className="px-4 py-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : subprojects.map((sp, spIndex) => {
              // MRO Requestor Type rates
              const nrsRate = getRequestorTypeRate(sp.requestor_types, "nrs");
              const manualRate = getRequestorTypeRate(sp.requestor_types, "manual");
              const otherRate = getRequestorTypeRate(sp.requestor_types, "other");
              const processedRate = getRequestorTypeRate(sp.requestor_types, "processed");
              const fileDropRate = getRequestorTypeRate(sp.requestor_types, "file drop");
              
              // Verisma Request Type rates
              const newReqRate = getRequestTypeRate(sp.request_types, "New Request");
              const keyRate = getRequestTypeRate(sp.request_types, "Key");
              const dupRate = getRequestTypeRate(sp.request_types, "Duplicate");
              
              const flatRate = sp.rate || sp.flatrate || 0;

              return (
                <tr
                  key={sp._id}
                  className={`${spIndex % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 border-b border-gray-200`}
                >
                  <td className="px-4 py-2 font-medium">
                    {sp.name}
                    {/* {sp.description && (
                      <div className="text-xs text-gray-500 font-normal">{sp.description}</div>
                    )} */}
                  </td>

                  {/* MRO Processing columns */}
                  {isMRO && isProcessing ? (
                    <>
                      <td className="px-4 py-2 text-right text-teal-700 font-semibold">
                        {nrsRate > 0 ? `$${nrsRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-blue-700 font-semibold">
                        {manualRate > 0 ? `$${manualRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {otherRate > 0 ? `$${otherRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {processedRate > 0 ? `$${processedRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {fileDropRate > 0 ? `$${fileDropRate.toFixed(2)}` : "-"}
                      </td>
                    </>
                  ) : isMRO && (isLogging || isPayer) ? (
                    <td className="px-4 py-2 text-right text-emerald-700 font-semibold">
                      {flatRate > 0 ? `$${flatRate.toFixed(2)}` : "-"}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-right">
                        {newReqRate > 0 ? `$${newReqRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {keyRate > 0 ? `$${keyRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {dupRate > 0 ? `$${dupRate.toFixed(2)}` : "-"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {flatRate > 0 ? `$${flatRate.toFixed(2)}` : "-"}
                      </td>
                    </>
                  )}

                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={(e) => handleEditSubProject(sp, selectedProject, e)}
                        className="p-1 hover:bg-blue-100 rounded text-blue-600"
                        title="Edit location"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSubProject(sp._id, sp.project_id, e)}
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                        title="Delete location"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-t">
            {/* Left: Info */}
            <div className="text-xs text-gray-600">
              Showing <span className="font-semibold">{((currentPageNum - 1) * 10) + 1}</span> - <span className="font-semibold">{Math.min(currentPageNum * 10, totalItems)}</span> of <span className="font-semibold">{totalItems}</span> locations
            </div>

            {/* Right: Pagination Buttons */}
            <div className="flex items-center gap-1">
              {/* Previous Button */}
              <button
                onClick={() => handleSubprojectPageChange(projectId, currentPageNum - 1)}
                disabled={currentPageNum === 1 || isLoadingPage}
                className={`p-1.5 rounded border text-xs font-medium transition ${
                  currentPageNum === 1 || isLoadingPage
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
                }`}
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page Numbers */}
              {getPageNumbers().map((pageNum, index) => (
                pageNum === '...' ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-gray-400 text-xs">...</span>
                ) : (
                  <button
                    key={pageNum}
                    onClick={() => handleSubprojectPageChange(projectId, pageNum)}
                    disabled={isLoadingPage}
                    className={`px-2.5 py-1 rounded border text-xs font-medium transition ${
                      currentPageNum === pageNum
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
                    } ${isLoadingPage ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {pageNum}
                  </button>
                )
              ))}

              {/* Next Button */}
              <button
                onClick={() => handleSubprojectPageChange(projectId, currentPageNum + 1)}
                disabled={currentPageNum === totalPages || isLoadingPage}
                className={`p-1.5 rounded border text-xs font-medium transition ${
                  currentPageNum === totalPages || isLoadingPage
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400"
                }`}
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Single page info */}
        {totalPages === 1 && totalItems > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
            Showing all {totalItems} location{totalItems > 1 ? 's' : ''}
          </div>
        )}
      </div>
    );
  };

  // ==================== RENDER ====================
  return (
    <div className="flex flex-col h-screen">
      <PageHeader
        heading="Project Management"
        subHeading="Manage geographies, clients, projects (process types), and locations hierarchically."
      />

      {/* Action Buttons */}
      <div className="p-8 flex flex-col gap-4">
        {/* <div className="flex flex-wrap gap-4 items-center">
          <button
            onClick={() => setIsCreateGeographyModalOpen(true)}
            className="bg-blue-600 text-white inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            New Geography
          </button>

          <button
            onClick={() => setIsCreateClientModalOpen(true)}
            className="bg-purple-600 text-white inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-purple-700 transition"
          >
            <Plus size={20} />
            New Client
          </button>

          <button
            onClick={() => setIsCreateProjectModalOpen(true)}
            className="bg-green-600 text-white inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-green-700 transition"
          >
            <Plus size={20} />
            New Project
          </button>

          <button
            onClick={() => setIsCreateSubProjectModalOpen(true)}
            className="text-blue-700 border border-blue-700 inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-blue-50 transition"
          >
            <Plus size={20} />
            New Location
          </button>
        </div> */}

        {/* Upload Section */}
        <div className="flex flex-wrap gap-4 items-center p-4 bg-gray-50 rounded-xl border">
          <span className="text-sm font-semibold text-gray-700">Bulk Upload:</span>
          
          {/* Verisma Upload */}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer bg-indigo-600 text-white inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-indigo-700 transition">
              <FaUpload size={16} />
              Verisma CSV
              <input type="file" accept=".csv" onChange={handleVerismaCSVUpload} className="hidden" />
            </label>
            <button
              onClick={() => setShowCsvFormat(!showCsvFormat)}
              className="text-indigo-600 hover:text-indigo-800 transition"
              title="Verisma CSV Format"
            >
              <FaInfoCircle size={18} />
            </button>
          </div>

          {/* MRO Upload */}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer bg-green-600 text-white inline-flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-green-700 transition">
              <FaUpload size={16} />
              MRO CSV
              <input type="file" accept=".csv" onChange={handleMROCSVUpload} className="hidden" />
            </label>
            <button
              onClick={() => setShowMroCsvFormat(!showMroCsvFormat)}
              className="text-green-600 hover:text-green-800 transition"
              title="MRO CSV Format"
            >
              <FaInfoCircle size={18} />
            </button>
          </div>

          {/* Download Templates */}
          <div className="flex items-center gap-2 ml-4 border-l pl-4">
            <button
              onClick={() => {
                const csvContent = "geography,client,process type,location,request type,rate,flat rate\nUS,Verisma,Data Processing,Location A,New Request,3.00,0\nUS,Verisma,Data Processing,Location A,Key,2.50,0\nUS,Verisma,Data Processing,Location A,Duplicate,2.00,0\n";
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "verisma-template.csv";
                a.click();
              }}
              className="text-indigo-600 border border-indigo-300 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition text-sm"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Verisma Template
            </button>

            <button
              onClick={() => {
                const csvContent = "geography,location,process_type,nrs_rate,other_processing_rate,processed_rate,file_drop_rate,manual_rate,flatrate\nUS,Fairview Processing,Processing,2.25,0,0,0,3.00,0\nUS,Christus Health,Logging,0,0,0,0,0,1.08\nUS,Payer Location,MRO Payer Project,0,0,0,0,0,2.00\n";
                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mro-template.csv";
                a.click();
              }}
              className="text-green-600 border border-green-300 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-green-50 transition text-sm"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              MRO Template
            </button>
          </div>
        </div>

        {/* Verisma CSV Format Info */}
        {showCsvFormat && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm text-sm">
            <h3 className="font-semibold text-indigo-800 mb-2"> Verisma CSV Format</h3>
            <pre className="bg-white border rounded-lg p-3 overflow-x-auto text-xs">
geography,client,process type,location,request type,rate,flat rate</pre>
            <div className="mt-2 text-xs text-gray-600">
              <strong>Request Types:</strong> New Request, Key, Duplicate
            </div>
          </div>
        )}

        {/* MRO CSV Format Info */}
        {showMroCsvFormat && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm text-sm">
            <h3 className="font-semibold text-green-800 mb-2">MRO CSV Format</h3>
            <pre className="bg-white border rounded-lg p-3 overflow-x-auto text-xs">
geography,location,process_type,nrs_rate,other_processing_rate,processed_rate,file_drop_rate,manual_rate,flatrate</pre>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-teal-100 rounded p-2">
                <strong>Process Types:</strong><br/>Processing, Logging, MRO Payer Project
              </div>
              <div className="bg-blue-100 rounded p-2">
                <strong>Request Types:</strong><br/>Batch, DDS, E-link, E-Request, Follow up, New Request
              </div>
              <div className="bg-purple-100 rounded p-2">
                <strong>Requestor Types (Processing):</strong><br/>NRS-NO Records, Other Processing, Processed, File Drop, Manual
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="px-8 pb-4">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            Showing <span className="font-semibold">{geographies.length}</span> of <span className="font-semibold">{totalGeographies}</span> geographies
          </span>
          {loadingMore && (
            <span className="text-blue-600 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading more...
            </span>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="px-8 pb-8 flex-1 min-h-0">
        {loading && geographies.length === 0 ? (
          <div className="flex justify-center items-center p-12 bg-white rounded-xl border">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : geographies.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border">
            No geographies found. Create one to get started!
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            className="overflow-auto rounded-xl shadow-sm border bg-white"
            style={{ maxHeight: "calc(100vh - 420px)" }}
          >
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 sticky top-0 z-20">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">Name</th>
                  <th className="px-6 py-3 text-left font-semibold">Description</th>
                  <th className="px-6 py-3 text-center font-semibold">Status</th>
                  <th className="px-6 py-3 text-center font-semibold">Count</th>
                  <th className="px-6 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {geographies.map((geography, geoIndex) => {
                  const isGeoExpanded = expandedGeographies[geography._id];
                  const clientCache = clientsCache[geography._id];
                  const clients = clientCache?.data || [];

                  return (
                    <>
                      {/* GEOGRAPHY ROW */}
                      <tr
                        key={geography._id}
                        className={`${geoIndex % 2 === 0 ? "bg-blue-50" : "bg-blue-100"} hover:bg-blue-200 cursor-pointer border-b`}
                        onClick={() => toggleGeography(geography._id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isGeoExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            <span className="font-bold text-blue-900">{geography.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700">{geography.description || "—"}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${geography.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-200"}`}>
                            {geography.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-semibold">{geography.clientCount || 0} clients</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={(e) => handleEditGeography(geography, e)} className="p-2 hover:bg-blue-300 rounded"><Edit2 size={16} /></button>
                            <button onClick={(e) => handleDeleteGeography(geography._id, e)} className="p-2 hover:bg-red-200 rounded text-red-600"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>

                      {/* CLIENTS */}
                      {isGeoExpanded && clients.map((client, clientIndex) => {
                        const isClientExpanded = expandedClients[client._id];
                        const projectCache = projectsCache[client._id];
                        const projects = projectCache?.data || [];
                        const isMRO = client.name?.toLowerCase() === 'mro';

                        return (
                          <>
                            <tr
                              key={client._id}
                              className={`${isMRO ? "bg-green-50 hover:bg-green-100" : "bg-purple-50 hover:bg-purple-100"} cursor-pointer border-b`}
                              onClick={() => toggleClient(client._id)}
                            >
                              <td className="px-12 py-3">
                                <div className="flex items-center gap-2">
                                  {isClientExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  <span className="font-semibold">{isMRO && ""}{client.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-3">{client.description || "—"}</td>
                              <td className="px-6 py-3 text-center">
                                <span className={`px-2 py-1 rounded-full text-xs ${client.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-200"}`}>
                                  {client.status}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-center font-semibold">{client.projectCount || 0} projects</td>
                              <td className="px-6 py-3">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={(e) => handleEditClient(client, geography, e)} className="p-1.5 hover:bg-purple-300 rounded"><Edit2 size={14} /></button>
                                  <button onClick={(e) => handleDeleteClient(client._id, geography._id, e)} className="p-1.5 hover:bg-red-200 rounded text-red-600"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>

                            {/* PROJECTS */}
                            {isClientExpanded && projects.map((project, projectIndex) => {
                              const isProjectExpanded = expandedProjects[project._id];
                              const subprojectCache = subprojectsCache[project._id];
                              const subprojects = subprojectCache?.data || [];
                              const isProcessing = project.name?.toLowerCase() === 'processing';
                              const isLogging = project.name?.toLowerCase() === 'logging';
                              const isPayer = project.name?.toLowerCase().includes('payer');

                              return (
                                <>
                                  <tr
                                    key={project._id}
                                    className={`${isProcessing ? "bg-teal-50" : isLogging ? "bg-emerald-50" : isPayer ? "bg-amber-50" : "bg-green-50"} hover:bg-green-100 cursor-pointer border-b`}
                                    onClick={() => {
                                      toggleProject(project._id);
                                      setSelectedProject(project);
                                    }}
                                  >
                                    <td className="px-16 py-3">
                                      <div className="flex items-center gap-2">
                                        {isProjectExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <span className="font-medium">
                                          {isProcessing && ""}
                                          {isLogging && ""}
                                          {isPayer && ""}
                                          {project.name}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-3">{project.description || "—"}</td>
                                    <td className="px-6 py-3 text-center">
                                      <span className={`px-2 py-1 rounded-full text-xs ${project.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-200"}`}>
                                        {project.status}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 text-center font-semibold">{project.subprojectCount || subprojectCache?.totalItems || 0} locations</td>
                                    <td className="px-6 py-3">
                                      <div className="flex items-center justify-center gap-2">
                                        <button onClick={(e) => handleEditProject(project, client, e)} className="p-1.5 hover:bg-green-300 rounded"><Edit2 size={12} /></button>
                                        <button onClick={(e) => handleDeleteProject(project._id, client._id, e)} className="p-1.5 hover:bg-red-200 rounded text-red-600"><Trash2 size={12} /></button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* SUBPROJECTS/LOCATIONS */}
                                  {isProjectExpanded && (
                                    <tr>
                                      <td colSpan="5" className="px-20 py-4 bg-gray-50">
                                        {subprojectCache?.loading && subprojects.length === 0 ? (
                                          <div className="flex justify-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
                                          </div>
                                        ) : subprojects.length === 0 && !subprojectCache?.loading ? (
                                          <div className="text-center text-gray-500 py-4">No locations found</div>
                                        ) : (
                                          <div className="rounded-lg overflow-hidden border">
                                            {renderLocationTable(subprojects, isMRO, project.name, project._id, subprojectCache)}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
                          </>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateGeographyModal refreshGeographies={refreshAll} isOpen={isCreateGeographyModalOpen} onClose={() => setIsCreateGeographyModalOpen(false)} />
      <CreateClientModal refreshClients={refreshAll} isOpen={isCreateClientModalOpen} onClose={() => setIsCreateClientModalOpen(false)} />
      <CreateProjectModal refreshProjects={refreshAll} isOpen={isCreateProjectModalOpen} onClose={() => setIsCreateProjectModalOpen(false)} />
      <CreateSubProjectModal refreshProjects={refreshAll} isOpen={isCreateSubProjectModalOpen} onClose={() => setIsCreateSubProjectModalOpen(false)} />

      {isEditGeographyModalOpen && (
        <EditGeographyModal geography={selectedGeography} refreshGeographies={refreshAll} isOpen={isEditGeographyModalOpen} onClose={() => { setIsEditGeographyModalOpen(false); setSelectedGeography(null); }} />
      )}
      {isEditClientModalOpen && (
        <EditClientModal client={selectedClient} geography={selectedGeography} refreshClients={refreshAll} isOpen={isEditClientModalOpen} onClose={() => { setIsEditClientModalOpen(false); setSelectedClient(null); }} />
      )}
      {isEditProjectModalOpen && (
        <EditProjectModal project={selectedProject} client={selectedClient} refreshProjects={refreshAll} isOpen={isEditProjectModalOpen} onClose={() => { setIsEditProjectModalOpen(false); setSelectedProject(null); }} />
      )}
      {isEditSubProjectModalOpen && (
        <EditSubProjectModal subProject={selectedSubProject} project={selectedProject} refreshProjects={refreshAll} isOpen={isEditSubProjectModalOpen} onClose={() => { setIsEditSubProjectModalOpen(false); setSelectedSubProject(null); }} />
      )}
      <DeleteGeographyModal
  isOpen={deleteGeographyModal.isOpen}
  onClose={() => setDeleteGeographyModal({ isOpen: false, geography: null })}
  geography={deleteGeographyModal.geography}
  onDeleteSuccess={() => {
    refreshAll(); // Your existing refresh function
    setDeleteGeographyModal({ isOpen: false, geography: null });
  }}
/>
    </div>
  );
};

export default ProjectPage;