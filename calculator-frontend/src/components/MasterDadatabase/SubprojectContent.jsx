import React, { useEffect, useState, useCallback, useRef } from "react";
import { ChevronDown, ChevronRight, Search, Loader2 } from "lucide-react";

const BackendUrl = import.meta.env.VITE_BACKEND_URL  ;

const SubprojectsContent = () => {
  // Projects state
  const [projects, setProjects] = useState([]);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsTotalPages, setProjectsTotalPages] = useState(1);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  // Expanded projects and their subprojects
  const [expanded, setExpanded] = useState({});
  const [subprojectsData, setSubprojectsData] = useState({}); // { projectId: { data: [], page: 1, totalPages: 1, total: 0, loading: false, hasMore: true } }
  
  // Search
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Error state
  const [error, setError] = useState(null);
  
  const projectsLimit = 20;
  const subprojectsLimit = 30;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when search changes
  useEffect(() => {
    setProjectsPage(1);
  }, [debouncedSearch]);

  // Fetch projects
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        page: projectsPage.toString(),
        limit: projectsLimit.toString()
      });
      
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }

      const res = await fetch(`${BackendUrl}/project?${params}`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      
      const data = await res.json();
      
      // Handle both array and paginated response
      if (Array.isArray(data)) {
        setProjects(data);
        setProjectsTotal(data.length);
        setProjectsTotalPages(1);
      } else {
        setProjects(data.data || []);
        setProjectsTotal(data.total || 0);
        setProjectsTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      setError(err.message);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  }, [projectsPage, debouncedSearch]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch subprojects for a specific project
  const fetchSubprojects = useCallback(async (projectId, page = 1, append = false) => {
    // Update loading state
    setSubprojectsData(prev => ({
      ...prev,
      [projectId]: {
        ...prev[projectId],
        loading: true
      }
    }));

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: subprojectsLimit.toString()
      });

      const res = await fetch(`${BackendUrl}/project/${projectId}/subproject?${params}`);
      if (!res.ok) throw new Error("Failed to fetch subprojects");
      
      const data = await res.json();
      
      let subprojects, total, totalPages, hasMore;
      
      if (Array.isArray(data)) {
        subprojects = data;
        total = data.length;
        totalPages = 1;
        hasMore = false;
      } else {
        subprojects = data.data || [];
        total = data.total || 0;
        totalPages = data.totalPages || 1;
        hasMore = data.hasMore || page < totalPages;
      }

      setSubprojectsData(prev => ({
        ...prev,
        [projectId]: {
          data: append ? [...(prev[projectId]?.data || []), ...subprojects] : subprojects,
          page,
          totalPages,
          total,
          loading: false,
          hasMore
        }
      }));
    } catch (err) {
      console.error(`Error fetching subprojects for project ${projectId}:`, err);
      setSubprojectsData(prev => ({
        ...prev,
        [projectId]: {
          ...prev[projectId],
          loading: false,
          error: err.message
        }
      }));
    }
  }, []);

  // Toggle expand/collapse project
  const toggleExpand = (projectId) => {
    const isExpanding = !expanded[projectId];
    
    setExpanded(prev => ({ ...prev, [projectId]: isExpanding }));
    
    // Fetch subprojects if expanding and not already loaded
    if (isExpanding && !subprojectsData[projectId]?.data) {
      fetchSubprojects(projectId, 1, false);
    }
  };

  // Load more subprojects
  const loadMoreSubprojects = (projectId) => {
    const current = subprojectsData[projectId];
    if (current && !current.loading && current.hasMore) {
      fetchSubprojects(projectId, current.page + 1, true);
    }
  };

  // Calculate total flatrate for a project's loaded subprojects
  const calculateTotalFlatrate = (projectId) => {
    const data = subprojectsData[projectId]?.data || [];
    return data.reduce((total, sp) => total + (sp.flatrate || 0), 0);
  };

  // Get subproject count (either from loaded data or show "...")
  const getSubprojectCount = (projectId) => {
    const data = subprojectsData[projectId];
    if (data) {
      return data.total;
    }
    return '...';
  };

  if (error && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600">
        <div className="text-center">
          <p className="font-medium">Error: {error}</p>
          <button 
            onClick={fetchProjects}
            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold text-gray-800">
          Project → Subprojects Overview
        </h1>
        <div className="text-sm text-gray-500">
          {projectsTotal} projects total
        </div>
      </div>

      {/* Search Input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Search projects..."
          className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Loading State */}
      {loadingProjects && projects.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={20} />
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          {debouncedSearch ? `No projects found for "${debouncedSearch}"` : "No projects available."}
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-200 bg-white">
            <table className="min-w-full text-sm text-left text-gray-700">
              <thead className="bg-gray-100 text-gray-900 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-6 py-3">Project</th>
                  <th className="px-6 py-3">Visibility</th>
                  <th className="px-6 py-3">Created On</th>
                  <th className="px-6 py-3">Updated At</th>
                  <th className="px-6 py-3 text-center">Subprojects</th>
                  <th className="px-6 py-3 text-right">Total Flatrate</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project, index) => {
                  const isExpanded = expanded[project._id];
                  const spData = subprojectsData[project._id];
                  const subprojects = spData?.data || [];
                  const isLoadingSp = spData?.loading;
                  
                  return (
                    <React.Fragment key={project._id}>
                      {/* Project Row */}
                      <tr
                        className={`${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } hover:bg-blue-50 transition cursor-pointer`}
                        onClick={() => toggleExpand(project._id)}
                      >
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-blue-500" />
                            ) : (
                              <ChevronRight size={16} className="text-gray-400" />
                            )}
                            <span>{project.name}</span>
                            {isLoadingSp && (
                              <Loader2 className="animate-spin text-blue-500" size={14} />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            project.visibility === 'public' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {project.visibility || 'private'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {project.created_on || project.createdAt 
                            ? new Date(project.created_on || project.createdAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {project.updated_at || project.updatedAt
                            ? new Date(project.updated_at || project.updatedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                            {spData ? spData.total : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-green-600">
                          {spData ? `$${calculateTotalFlatrate(project._id).toFixed(2)}` : '—'}
                        </td>
                      </tr>

                      {/* Expanded Subprojects */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="6" className="bg-gray-50 px-0 py-0">
                            <div className="px-10 py-4">
                              {isLoadingSp && subprojects.length === 0 ? (
                                <div className="flex items-center justify-center py-8 text-gray-500">
                                  <Loader2 className="animate-spin mr-2" size={16} />
                                  Loading subprojects...
                                </div>
                              ) : subprojects.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                  No subprojects found for this project.
                                </div>
                              ) : (
                                <>
                                  <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100 text-gray-900 text-xs uppercase tracking-wider">
                                      <tr>
                                        <th className="px-4 py-2 text-left">Name</th>
                                        <th className="px-4 py-2 text-left">Description</th>
                                        <th className="px-4 py-2 text-center">Status</th>
                                        <th className="px-4 py-2 text-right">Flatrate</th>
                                        <th className="px-4 py-2 text-left">Created On</th>
                                        <th className="px-4 py-2 text-left">Updated At</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {subprojects.map((sp, spIndex) => (
                                        <tr
                                          key={sp._id}
                                          className={`${
                                            spIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                          } hover:bg-blue-50 transition`}
                                        >
                                          <td className="px-4 py-2 font-medium text-gray-900">
                                            {sp.name}
                                          </td>
                                          <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                                            {sp.description || "—"}
                                          </td>
                                          <td className="px-4 py-2 text-center">
                                            <span
                                              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                sp.status === "active"
                                                  ? "bg-green-100 text-green-700"
                                                  : sp.status === "inactive"
                                                  ? "bg-red-100 text-red-700"
                                                  : "bg-gray-100 text-gray-600"
                                              }`}
                                            >
                                              {sp.status || 'active'}
                                            </span>
                                          </td>
                                          <td className="px-4 py-2 text-right font-semibold text-green-600">
                                            ${(sp.flatrate || 0).toFixed(2)}
                                          </td>
                                          <td className="px-4 py-2 text-gray-600">
                                            {sp.created_on || sp.createdAt
                                              ? new Date(sp.created_on || sp.createdAt).toLocaleDateString()
                                              : '—'}
                                          </td>
                                          <td className="px-4 py-2 text-gray-600">
                                            {sp.updated_at || sp.updatedAt
                                              ? new Date(sp.updated_at || sp.updatedAt).toLocaleDateString()
                                              : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>

                                  {/* Load More Button */}
                                  {spData?.hasMore && (
                                    <div className="flex justify-center mt-4">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          loadMoreSubprojects(project._id);
                                        }}
                                        disabled={isLoadingSp}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                                      >
                                        {isLoadingSp ? (
                                          <>
                                            <Loader2 className="animate-spin" size={14} />
                                            Loading...
                                          </>
                                        ) : (
                                          <>
                                            Load More ({subprojects.length} of {spData.total})
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}

                                  {/* Subprojects Count */}
                                  <div className="text-center mt-3 text-sm text-gray-500">
                                    Showing {subprojects.length} of {spData?.total || 0} subprojects
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Projects Pagination */}
          <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
            <span>
              Showing {projects.length} of {projectsTotal} projects
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setProjectsPage(p => Math.max(1, p - 1))}
                disabled={projectsPage === 1 || loadingProjects}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              <span className="px-4 py-2 bg-gray-100 rounded-lg">
                Page {projectsPage} of {projectsTotalPages}
              </span>
              <button
                onClick={() => setProjectsPage(p => Math.min(projectsTotalPages, p + 1))}
                disabled={projectsPage === projectsTotalPages || loadingProjects}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SubprojectsContent;