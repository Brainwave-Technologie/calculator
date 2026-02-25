// pages/ResourcesPage.jsx - With Add Resource and Assign Locations functionality
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  ChevronDownIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  FolderIcon,
  UserPlusIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import ConfirmDeleteProjectModal from "../components/Project/ConfirmDeleteProjectModal";
import toast from "react-hot-toast";

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL;

// --- API SERVICE ---
const apiService = {
  getResources: (params) => axios.get(`${apiBaseUrl}/resource`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
  addResource: (resourceData) => axios.post(`${apiBaseUrl}/resource`, resourceData, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  updateResource: (id, resourceData) => axios.put(`${apiBaseUrl}/resource/${id}`, resourceData, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  updateAssignments: (id, assignments) => axios.put(`${apiBaseUrl}/resource/${id}/assignments`, { assignments }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  deleteResource: (id) => axios.delete(`${apiBaseUrl}/resource/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  uploadResourceCSV: (formData) => axios.post(`${apiBaseUrl}/upload-resource/bulk`, formData, { headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  uploadResourceCSVReplace: (formData) => axios.post(`${apiBaseUrl}/upload-resource/bulk-replace`, formData, { headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  getGeographies: (params) => axios.get(`${apiBaseUrl}/geography`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
  getClients: (geoId, params) => axios.get(`${apiBaseUrl}/client/geography/${geoId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
  getProjects: (clientId, params) => axios.get(`${apiBaseUrl}/project/client/${clientId}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
  getSubprojects: (projectId, params) => axios.get(`${apiBaseUrl}/project/${projectId}/subproject`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
  assignQC: (data) => axios.post(`${apiBaseUrl}/qc-assignments`, data, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  getQCResourcesList: () => axios.get(`${apiBaseUrl}/qc-assignments/resources-list`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }),
  getLoggedResources: (params) => axios.get(`${apiBaseUrl}/qc-assignments/logged-resources`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, params }),
};

// --- DEBOUNCE HOOK ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// --- FILTER SELECT COMPONENT ---
const FilterSelect = React.memo(({ placeholder, value, onChange, options = [], disabled = false, loading = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const found = options.find(o => o.value === value);
    return found?.label || value;
  }, [value, options]);

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between border border-gray-300 rounded-xl px-4 py-2 bg-white cursor-pointer min-h-[42px] ${disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-gray-400"}`}
      >
        <span className={`text-sm truncate ${value ? "text-gray-900" : "text-gray-500"}`}>
          {loading ? "Loading..." : (selectedLabel || placeholder)}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-blue-400" autoFocus />
          </div>
          <div className="max-h-48 overflow-auto">
            <div onClick={() => { onChange(""); setIsOpen(false); setSearch(""); }} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 cursor-pointer">{placeholder}</div>
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">No results</div>
            ) : (
              filteredOptions.map((option) => (
                <div key={option.value} onClick={() => { onChange(option.value); setIsOpen(false); setSearch(""); }} className={`px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer ${value === option.value ? "bg-blue-50 text-blue-700" : ""}`}>{option.label}</div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
FilterSelect.displayName = "FilterSelect";

// --- MULTI-SELECT DROPDOWN FOR LOCATIONS ---
const MultiSelectDropdown = React.memo(({ placeholder, selectedValues = [], onChange, options = [], disabled = false, loading = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    return options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const handleToggle = (optionValue) => {
    if (selectedValues.includes(optionValue)) {
      onChange(selectedValues.filter(v => v !== optionValue));
    } else {
      onChange([...selectedValues, optionValue]);
    }
  };

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div onClick={() => !disabled && setIsOpen(!isOpen)} className={`flex items-center justify-between border border-gray-300 rounded-xl px-4 py-2 bg-white cursor-pointer min-h-[42px] ${disabled ? "bg-gray-100 cursor-not-allowed" : "hover:border-gray-400"}`}>
        <span className={`text-sm truncate ${selectedValues.length > 0 ? "text-gray-900" : "text-gray-500"}`}>
          {loading ? "Loading..." : (selectedValues.length > 0 ? `${selectedValues.length} selected` : placeholder)}
        </span>
        <ChevronDownIcon className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search locations..." className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md outline-none focus:border-blue-400" autoFocus />
          </div>
          {options.length > 0 && (
            <div onClick={handleSelectAll} className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 cursor-pointer border-b flex items-center gap-2">
              <input type="checkbox" checked={selectedValues.length === options.length && options.length > 0} onChange={() => {}} className="w-4 h-4 text-blue-600 rounded" />
              <span className="font-medium">Select All ({options.length})</span>
            </div>
          )}
          <div className="max-h-48 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">No locations found</div>
            ) : (
              filteredOptions.map((option) => (
                <div key={option.value} onClick={() => handleToggle(option.value)} className={`px-4 py-2 text-sm hover:bg-gray-100 cursor-pointer flex items-center gap-2 ${selectedValues.includes(option.value) ? "bg-green-50" : ""}`}>
                  <input type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => {}} className="w-4 h-4 text-green-600 rounded" />
                  <span>{option.label}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
});
MultiSelectDropdown.displayName = "MultiSelectDropdown";

// --- ASSIGNMENT COUNT BADGE ---
const AssignmentBadge = React.memo(({ assignments, onClick }) => {
  const counts = useMemo(() => {
    if (!assignments || !Array.isArray(assignments)) return { projects: 0, locations: 0 };
    let locationCount = 0;
    const projectCount = assignments.length;
    for (const assignment of assignments) {
      if (assignment.subprojects && Array.isArray(assignment.subprojects)) {
        locationCount += assignment.subprojects.length;
      }
    }
    return { projects: projectCount, locations: locationCount };
  }, [assignments]);

  if (counts.locations === 0) {
    return <span className="text-gray-400 text-sm">No assignments</span>;
  }

  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition text-sm font-medium">
      <span>{counts.projects} Project{counts.projects !== 1 ? 's' : ''}</span>
      <span className="text-blue-400">•</span>
      <span>{counts.locations} Location{counts.locations !== 1 ? 's' : ''}</span>
      <EyeIcon className="w-4 h-4 ml-1" />
    </button>
  );
});
AssignmentBadge.displayName = "AssignmentBadge";

// --- VIEW ASSIGNMENTS MODAL ---
const ViewAssignmentsModal = React.memo(({ isOpen, onClose, resource }) => {
  if (!isOpen || !resource) return null;
  const assignments = resource.assignments || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(resource.name)}&background=3b82f6&color=fff`} alt={resource.name} className="w-10 h-10 rounded-full" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{resource.name}</h2>
              <p className="text-sm text-gray-500">{resource.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-lg transition"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {assignments.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <MapPinIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No assignments found</p>
              <p className="text-sm mt-1">Use the assign button to add locations</p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment, idx) => (
                <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-6 text-sm flex-wrap">
                      <div className="flex items-center gap-2"><span className="text-gray-500">Geography:</span><span className="font-medium text-gray-900">{assignment.geography_name || '—'}</span></div>
                      <div className="flex items-center gap-2"><BuildingOfficeIcon className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Client:</span><span className="font-medium text-gray-900">{assignment.client_name || '—'}</span></div>
                      <div className="flex items-center gap-2"><FolderIcon className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Process Type:</span><span className="font-medium text-blue-600">{assignment.project_name || '—'}</span></div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3"><MapPinIcon className="w-4 h-4 text-green-600" /><span className="text-sm font-medium text-gray-700">{assignment.client_name?.toLowerCase() === 'datavant' ? 'Process Types' : 'Locations'} ({assignment.subprojects?.length || 0})</span></div>
                    {assignment.subprojects && assignment.subprojects.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {assignment.subprojects.map((sp, spIdx) => (<span key={spIdx} className="inline-flex items-center px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">{sp.subproject_name}</span>))}
                      </div>
                    ) : (<p className="text-sm text-gray-400">{assignment.client_name?.toLowerCase() === 'datavant' ? 'No process types assigned' : 'No locations assigned'}</p>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">Total: {assignments.length} Project{assignments.length !== 1 ? 's' : ''}, {assignments.reduce((acc, a) => acc + (a.subprojects?.length || 0), 0)} Locations</div>
            <button onClick={onClose} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
});
ViewAssignmentsModal.displayName = "ViewAssignmentsModal";

// --- EDIT RESOURCE DETAILS MODAL ---
const EditResourceDetailsModal = React.memo(({ isOpen, onClose, resource, onSave }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('associate');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && resource) {
      setName(resource.name || '');
      setEmail(resource.email || '');
      setRole(resource.role || 'associate');
      setErrors({});
    }
  }, [isOpen, resource]);

  const handleSubmit = async () => {
    const newErrors = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email format';
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setIsSubmitting(true);
    try {
      await onSave({ name: name.trim(), email: email.trim(), role });
      onClose();
    } catch (error) { /* handled in onSave */ }
    finally { setIsSubmitting(false); }
  };

  if (!isOpen || !resource) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><PencilSquareIcon className="w-6 h-6 text-blue-600" /></div>
            <div><h2 className="text-lg font-bold text-gray-900">Edit Resource Details</h2><p className="text-sm text-gray-500">{resource.name} • {resource.email}</p></div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-lg transition"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: '' })); }} placeholder="Full name" className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: '' })); }} placeholder="Email address" className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white">
              <option value="associate">Associate</option>
              <option value="senior_associate">Senior Associate</option>
              <option value="team_lead">Team Lead</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} disabled={isSubmitting} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 font-medium transition disabled:opacity-50">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition flex items-center gap-2 disabled:opacity-50">
            {isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Saving...</span></>) : (<><PencilSquareIcon className="w-4 h-4" /><span>Save Details</span></>)}
          </button>
        </div>
      </div>
    </div>
  );
});
EditResourceDetailsModal.displayName = "EditResourceDetailsModal";

// --- ASSIGN LOCATIONS MODAL ---
const AssignLocationsModal = React.memo(({ isOpen, onClose, resource, onSave }) => {
  const [assignments, setAssignments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [geographies, setGeographies] = useState([]);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [dropdownData, setDropdownData] = useState({});
  const [loadingStates, setLoadingStates] = useState({});

  const createEmptyAssignment = useCallback(() => ({
    id: `new-${Date.now()}-${Math.random()}`,
    geography_id: '', geography_name: '',
    client_id: '', client_name: '',
    project_id: '', project_name: '',
    selectedLocations: [], subprojects: []
  }), []);

  const fetchGeographies = useCallback(async () => {
    setLoadingGeo(true);
    try {
      const res = await apiService.getGeographies({ limit: 100 });
      setGeographies((res.data.geographies || []).map(g => ({ value: g._id, label: g.name })));
    } catch (err) { console.error("Failed to fetch geographies:", err); }
    finally { setLoadingGeo(false); }
  }, []);

  const loadClients = useCallback(async (assignmentId, geographyId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-client`]: true }));
    try {
      const res = await apiService.getClients(geographyId, { limit: 100 });
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-clients`]: (res.data.clients || []).map(c => ({ value: c._id, label: c.name })) }));
    } catch (err) { console.error("Failed to fetch clients:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-client`]: false })); }
  }, []);

  const loadProjects = useCallback(async (assignmentId, clientId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-project`]: true }));
    try {
      const res = await apiService.getProjects(clientId, { limit: 100 });
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-projects`]: (res.data.projects || []).map(p => ({ value: p._id, label: p.name })) }));
    } catch (err) { console.error("Failed to fetch projects:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-project`]: false })); }
  }, []);

  const loadLocations = useCallback(async (assignmentId, projectId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-location`]: true }));
    try {
      const res = await apiService.getSubprojects(projectId, { limit: 200 });
      const locationsData = res.data.data || res.data.subprojects || res.data || [];
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-locations`]: locationsData.map(l => ({ value: l._id, label: l.name })) }));
    } catch (err) { console.error("Failed to fetch locations:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-location`]: false })); }
  }, []);

  useEffect(() => {
    if (isOpen && resource) {
      const existingAssignments = resource.assignments || [];
      if (existingAssignments.length > 0) {
        const mapped = existingAssignments.map((a, idx) => ({
          id: `existing-${idx}`,
          geography_id: a.geography_id?.toString() || a.geography_id || '',
          geography_name: a.geography_name || '',
          client_id: a.client_id?.toString() || a.client_id || '',
          client_name: a.client_name || '',
          project_id: a.project_id?.toString() || a.project_id || '',
          project_name: a.project_name || '',
          selectedLocations: a.subprojects?.map(sp => sp.subproject_id?.toString() || sp.subproject_id) || [],
          subprojects: a.subprojects || []
        }));
        setAssignments(mapped);
        mapped.forEach(async (a) => {
          if (a.geography_id) await loadClients(a.id, a.geography_id);
          if (a.client_id) await loadProjects(a.id, a.client_id);
          if (a.project_id) await loadLocations(a.id, a.project_id);
        });
      } else {
        setAssignments([createEmptyAssignment()]);
      }
      fetchGeographies();
    }
  }, [isOpen, resource, createEmptyAssignment, fetchGeographies, loadClients, loadProjects, loadLocations]);

  const handleGeographyChange = async (assignmentId, geographyId) => {
    const geoOption = geographies.find(g => g.value === geographyId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, geography_id: geographyId, geography_name: geoOption?.label || '', client_id: '', client_name: '', project_id: '', project_name: '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-clients`]: [], [`${assignmentId}-projects`]: [], [`${assignmentId}-locations`]: [] }));
    if (geographyId) await loadClients(assignmentId, geographyId);
  };

  const handleClientChange = async (assignmentId, clientId) => {
    const clients = dropdownData[`${assignmentId}-clients`] || [];
    const clientOption = clients.find(c => c.value === clientId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, client_id: clientId, client_name: clientOption?.label || '', project_id: '', project_name: '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-projects`]: [], [`${assignmentId}-locations`]: [] }));
    if (clientId) await loadProjects(assignmentId, clientId);
  };

  const handleProjectChange = async (assignmentId, projectId) => {
    const projects = dropdownData[`${assignmentId}-projects`] || [];
    const projectOption = projects.find(p => p.value === projectId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, project_id: projectId, project_name: projectOption?.label || '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-locations`]: [] }));
    if (projectId) await loadLocations(assignmentId, projectId);
  };

  const handleLocationsChange = (assignmentId, selectedIds) => {
    const locations = dropdownData[`${assignmentId}-locations`] || [];
    setAssignments(prev => prev.map(a => {
      if (a.id === assignmentId) {
        const subprojects = selectedIds.map(id => { const loc = locations.find(l => l.value === id); return { subproject_id: id, subproject_name: loc?.label || '' }; });
        return { ...a, selectedLocations: selectedIds, subprojects };
      }
      return a;
    }));
  };

  const addAssignmentRow = () => setAssignments(prev => [...prev, createEmptyAssignment()]);
  const removeAssignmentRow = (assignmentId) => {
    if (assignments.length === 1) { toast.error("At least one assignment row is required"); return; }
    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
  };

  const handleSubmit = async () => {
    const validAssignments = assignments.filter(a => a.geography_id && a.client_id && a.project_id && a.selectedLocations.length > 0);
    if (validAssignments.length === 0) { toast.error("Please complete at least one assignment with locations selected"); return; }
    setIsSubmitting(true);
    try {
      const formattedAssignments = validAssignments.map(a => ({ geography_id: a.geography_id, geography_name: a.geography_name, client_id: a.client_id, client_name: a.client_name, project_id: a.project_id, project_name: a.project_name, subprojects: a.subprojects }));
      await onSave(formattedAssignments);
      onClose();
    } catch (error) { /* handled in onSave */ }
    finally { setIsSubmitting(false); }
  };

  if (!isOpen || !resource) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100"><PencilSquareIcon className="w-6 h-6 text-green-600" /></div>
            <div><h2 className="text-lg font-bold text-gray-900">Edit Assignments</h2><p className="text-sm text-gray-500">{resource.name} • {resource.email}</p></div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-lg transition"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {assignments.map((assignment, index) => (
              <div key={assignment.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-gray-700">Assignment #{index + 1}</span>
                  {assignments.length > 1 && (<button onClick={() => removeAssignmentRow(assignment.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition"><TrashIcon className="w-5 h-5" /></button>)}
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Geography *</label><FilterSelect placeholder="Select Geography" value={assignment.geography_id} onChange={(value) => handleGeographyChange(assignment.id, value)} options={geographies} loading={loadingGeo} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Client *</label><FilterSelect placeholder="Select Client" value={assignment.client_id} onChange={(value) => handleClientChange(assignment.id, value)} options={dropdownData[`${assignment.id}-clients`] || []} disabled={!assignment.geography_id} loading={loadingStates[`${assignment.id}-client`]} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">Process Type *</label><FilterSelect placeholder="Select Process Type" value={assignment.project_id} onChange={(value) => handleProjectChange(assignment.id, value)} options={dropdownData[`${assignment.id}-projects`] || []} disabled={!assignment.client_id} loading={loadingStates[`${assignment.id}-project`]} /></div>
                  <div><label className="block text-xs font-medium text-gray-600 mb-1">{assignment.client_name?.toLowerCase() === 'datavant' ? 'Process Types *' : 'Locations *'}</label><MultiSelectDropdown placeholder={assignment.client_name?.toLowerCase() === 'datavant' ? 'Select Process Types' : 'Select Locations'} selectedValues={assignment.selectedLocations} onChange={(values) => handleLocationsChange(assignment.id, values)} options={dropdownData[`${assignment.id}-locations`] || []} disabled={!assignment.project_id} loading={loadingStates[`${assignment.id}-location`]} /></div>
                </div>
                {assignment.subprojects.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-2"><MapPinIcon className="w-4 h-4 text-green-600" /><span className="text-xs font-medium text-gray-600">{assignment.client_name?.toLowerCase() === 'datavant' ? 'Selected Process Types' : 'Selected Locations'} ({assignment.subprojects.length})</span></div>
                    <div className="flex flex-wrap gap-1.5">{assignment.subprojects.map((sp, spIdx) => (<span key={spIdx} className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">{sp.subproject_name}</span>))}</div>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addAssignmentRow} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition flex items-center justify-center gap-2"><PlusIcon className="w-5 h-5" /><span>Add Another Assignment</span></button>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">{assignments.filter(a => a.selectedLocations.length > 0).length} assignment(s) with locations selected</div>
            <div className="flex items-center gap-3">
              <button onClick={onClose} disabled={isSubmitting} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 font-medium transition disabled:opacity-50">Cancel</button>
              <button onClick={handleSubmit} disabled={isSubmitting} className="px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition flex items-center gap-2 disabled:opacity-50">
                {isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Saving...</span></>) : (<><PencilSquareIcon className="w-5 h-5" /><span>Save Changes</span></>)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
AssignLocationsModal.displayName = "AssignLocationsModal";

// --- QC ASSIGN MODAL ---
// Flow: 1. Select Client -> 2. Select Date -> 3. Pick from resources who logged on that date/client
const QCAssignModal = React.memo(({ isOpen, onClose, targetResource }) => {
  const [clientType, setClientType] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sourceResourceEmail, setSourceResourceEmail] = useState('');
  const [loggedResources, setLoggedResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Reset everything when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientType('');
      setDate(new Date().toISOString().split('T')[0]);
      setSourceResourceEmail('');
      setLoggedResources([]);
      setResult(null);
      setSearchTerm('');
    }
  }, [isOpen]);

  // Fetch resources who logged cases when both client and date are selected
  useEffect(() => {
    if (!clientType || !date) {
      setLoggedResources([]);
      setSourceResourceEmail('');
      return;
    }
    setLoadingResources(true);
    setSourceResourceEmail('');
    setResult(null);
    apiService.getLoggedResources({ client_type: clientType, date })
      .then(res => {
        const resources = (res.data?.resources || []).filter(r => r.email !== targetResource?.email);
        setLoggedResources(resources);
      })
      .catch(err => {
        console.error('Error fetching logged resources:', err);
        setLoggedResources([]);
      })
      .finally(() => setLoadingResources(false));
  }, [clientType, date, targetResource]);

  const filteredResources = useMemo(() => {
    if (!searchTerm) return loggedResources;
    const lower = searchTerm.toLowerCase();
    return loggedResources.filter(r => r.name?.toLowerCase().includes(lower) || r.email?.toLowerCase().includes(lower));
  }, [loggedResources, searchTerm]);

  const handleClientChange = (ct) => {
    setClientType(ct);
    setSourceResourceEmail('');
    setResult(null);
  };

  const handleDateChange = (newDate) => {
    setDate(newDate);
    setSourceResourceEmail('');
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!clientType) { toast.error('Please select a client'); return; }
    if (!date) { toast.error('Please select a date'); return; }
    if (!sourceResourceEmail) { toast.error('Please select a source resource'); return; }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiService.assignQC({
        target_resource_id: targetResource._id,
        source_resource_email: sourceResourceEmail,
        date,
        client_type: clientType
      });
      setResult(res.data);
      toast.success(res.data.message);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to assign QC';
      toast.error(msg);
      setResult({ error: true, message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !targetResource) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">QC</div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Assign QC Tasks</h2>
              <p className="text-sm text-gray-500">To: {targetResource.name} ({targetResource.email})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-lg transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Client */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold mr-2 ${clientType ? 'bg-green-500' : 'bg-purple-600'}`}>1</span>
              Select Client
            </label>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {['MRO', 'Verisma', 'Datavant'].map(ct => (
                <button
                  key={ct}
                  onClick={() => handleClientChange(ct)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-xl border-2 transition ${
                    clientType === ct
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400 hover:bg-purple-50'
                  }`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Date */}
          <div className={!clientType ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold mr-2 ${clientType && date ? 'bg-green-500' : 'bg-purple-600'}`}>2</span>
              Date of Logged Cases
            </label>
            <input
              type="date"
              value={date}
              onChange={e => handleDateChange(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              disabled={!clientType}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          {/* Step 3: Source resource dropdown */}
          <div className={!clientType || !date ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold mr-2 ${sourceResourceEmail ? 'bg-green-500' : 'bg-purple-600'}`}>3</span>
              Source Resource
            </label>
            <select
              value={sourceResourceEmail}
              onChange={e => setSourceResourceEmail(e.target.value)}
              disabled={!clientType || !date || loadingResources}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">
                {loadingResources ? 'Loading...' : loggedResources.length === 0 && clientType && date ? 'No resources logged on this date' : 'Select resource...'}
              </option>
              {loggedResources.map(r => (
                <option key={r.email} value={r.email}>
                  {r.name} ({r.email}) - {r.case_count} case{r.case_count !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-4 text-sm border ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <p className="font-semibold">{result.message}</p>
              {!result.error && (
                <div className="mt-2 flex gap-4 text-xs">
                  <span>Assigned: <strong>{result.assigned_count}</strong></span>
                  <span>Skipped: <strong>{result.skipped_count}</strong></span>
                  <span>Total Source: <strong>{result.total_source_cases}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition">
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !clientType || !date || !sourceResourceEmail}
            className="px-5 py-2.5 text-sm bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Assigning...' : 'Assign QC'}
          </button>
        </div>
      </div>
    </div>
  );
});
QCAssignModal.displayName = "QCAssignModal";

// --- ADD RESOURCE MODAL ---
const AddResourceModal = React.memo(({ isOpen, onClose, onSave }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({ name: '', email: '', role: 'associate', employee_id: '' });
  const [assignments, setAssignments] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [geographies, setGeographies] = useState([]);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [dropdownData, setDropdownData] = useState({});
  const [loadingStates, setLoadingStates] = useState({});

  const createEmptyAssignment = useCallback(() => ({
    id: `new-${Date.now()}-${Math.random()}`,
    geography_id: '', geography_name: '',
    client_id: '', client_name: '',
    project_id: '', project_name: '',
    selectedLocations: [], subprojects: []
  }), []);

  const fetchGeographies = useCallback(async () => {
    setLoadingGeo(true);
    try {
      const res = await apiService.getGeographies({ limit: 100 });
      setGeographies((res.data.geographies || []).map(g => ({ value: g._id, label: g.name })));
    } catch (err) { console.error("Failed to fetch geographies:", err); }
    finally { setLoadingGeo(false); }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormData({ name: '', email: '', role: 'associate', employee_id: '' });
      setAssignments([createEmptyAssignment()]);
      setErrors({});
      setDropdownData({});
      fetchGeographies();
    }
  }, [isOpen, createEmptyAssignment, fetchGeographies]);

  const loadClients = async (assignmentId, geographyId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-client`]: true }));
    try {
      const res = await apiService.getClients(geographyId, { limit: 100 });
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-clients`]: (res.data.clients || []).map(c => ({ value: c._id, label: c.name })) }));
    } catch (err) { console.error("Failed to fetch clients:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-client`]: false })); }
  };

  const loadProjects = async (assignmentId, clientId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-project`]: true }));
    try {
      const res = await apiService.getProjects(clientId, { limit: 100 });
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-projects`]: (res.data.projects || []).map(p => ({ value: p._id, label: p.name })) }));
    } catch (err) { console.error("Failed to fetch projects:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-project`]: false })); }
  };

  const loadLocations = async (assignmentId, projectId) => {
    setLoadingStates(prev => ({ ...prev, [`${assignmentId}-location`]: true }));
    try {
      const res = await apiService.getSubprojects(projectId, { limit: 200 });
      const locationsData = res.data.data || res.data.subprojects || res.data || [];
      setDropdownData(prev => ({ ...prev, [`${assignmentId}-locations`]: locationsData.map(l => ({ value: l._id, label: l.name })) }));
    } catch (err) { console.error("Failed to fetch locations:", err); }
    finally { setLoadingStates(prev => ({ ...prev, [`${assignmentId}-location`]: false })); }
  };

  const handleGeographyChange = async (assignmentId, geographyId) => {
    const geoOption = geographies.find(g => g.value === geographyId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, geography_id: geographyId, geography_name: geoOption?.label || '', client_id: '', client_name: '', project_id: '', project_name: '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-clients`]: [], [`${assignmentId}-projects`]: [], [`${assignmentId}-locations`]: [] }));
    if (geographyId) await loadClients(assignmentId, geographyId);
  };

  const handleClientChange = async (assignmentId, clientId) => {
    const clients = dropdownData[`${assignmentId}-clients`] || [];
    const clientOption = clients.find(c => c.value === clientId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, client_id: clientId, client_name: clientOption?.label || '', project_id: '', project_name: '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-projects`]: [], [`${assignmentId}-locations`]: [] }));
    if (clientId) await loadProjects(assignmentId, clientId);
  };

  const handleProjectChange = async (assignmentId, projectId) => {
    const projects = dropdownData[`${assignmentId}-projects`] || [];
    const projectOption = projects.find(p => p.value === projectId);
    setAssignments(prev => prev.map(a => a.id === assignmentId ? { ...a, project_id: projectId, project_name: projectOption?.label || '', selectedLocations: [], subprojects: [] } : a));
    setDropdownData(prev => ({ ...prev, [`${assignmentId}-locations`]: [] }));
    if (projectId) await loadLocations(assignmentId, projectId);
  };

  const handleLocationsChange = (assignmentId, selectedIds) => {
    const locations = dropdownData[`${assignmentId}-locations`] || [];
    setAssignments(prev => prev.map(a => {
      if (a.id === assignmentId) {
        const subprojects = selectedIds.map(id => { const loc = locations.find(l => l.value === id); return { subproject_id: id, subproject_name: loc?.label || '' }; });
        return { ...a, selectedLocations: selectedIds, subprojects };
      }
      return a;
    }));
  };

  const addAssignmentRow = () => setAssignments(prev => [...prev, createEmptyAssignment()]);
  const removeAssignmentRow = (assignmentId) => {
    setAssignments(prev => {
      const filtered = prev.filter(a => a.id !== assignmentId);
      return filtered.length === 0 ? [createEmptyAssignment()] : filtered;
    });
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => { if (validateStep1()) setStep(2); };
  const handleBack = () => setStep(1);
  const handleChange = (e) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' })); };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const validAssignments = assignments.filter(a => a.geography_id && a.client_id && a.project_id && a.selectedLocations.length > 0).map(a => ({ geography_id: a.geography_id, geography_name: a.geography_name, client_id: a.client_id, client_name: a.client_name, project_id: a.project_id, project_name: a.project_name, subprojects: a.subprojects }));
      await onSave({ ...formData, assignments: validAssignments });
      onClose();
    } catch (error) { /* handled in onSave */ }
    finally { setIsSubmitting(false); }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100"><UserPlusIcon className="w-6 h-6 text-blue-600" /></div>
            <div><h2 className="text-lg font-bold text-gray-900">Add New Resource</h2><p className="text-sm text-gray-500">Step {step} of 2: {step === 1 ? 'Basic Information' : 'Assign Locations'}</p></div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-white rounded-lg transition"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-b">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>1</div><span className="font-medium">Basic Info</span></div>
            <div className="flex-1 h-1 bg-gray-200 rounded"><div className={`h-full bg-blue-600 rounded transition-all ${step >= 2 ? 'w-full' : 'w-0'}`}></div></div>
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>2</div><span className="font-medium">Assignments</span></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 ? (
            <div className="max-w-xl mx-auto space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label><input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Enter full name" className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.name ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />{errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label><input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter email address" className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${errors.email ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />{errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}</div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Role</label><select name="role" value={formData.role} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition bg-white"><option value="associate">Associate</option><option value="senior_associate">Senior Associate</option><option value="team_lead">Team Lead</option><option value="manager">Manager</option></select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Employee ID <span className="text-gray-400 text-xs">(Optional)</span></label><input type="text" name="employee_id" value={formData.employee_id} onChange={handleChange} placeholder="Enter employee ID" className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition" /></div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3"><p className="text-xs text-blue-700"><strong>Note:</strong> Resources use OTP-based login. No password required. You can assign locations in the next step.</p></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4"><p className="text-sm text-green-700"><strong>Assign Locations:</strong> Select Geography → Client → Process Type → Locations for <strong>{formData.name}</strong>. You can add multiple assignments or skip this step.</p></div>
              {assignments.map((assignment, index) => (
                <div key={assignment.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-700">Assignment #{index + 1}</span>
                    <button onClick={() => removeAssignmentRow(assignment.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded transition"><TrashIcon className="w-5 h-5" /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Geography</label><FilterSelect placeholder="Select Geography" value={assignment.geography_id} onChange={(value) => handleGeographyChange(assignment.id, value)} options={geographies} loading={loadingGeo} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Client</label><FilterSelect placeholder="Select Client" value={assignment.client_id} onChange={(value) => handleClientChange(assignment.id, value)} options={dropdownData[`${assignment.id}-clients`] || []} disabled={!assignment.geography_id} loading={loadingStates[`${assignment.id}-client`]} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label><FilterSelect placeholder="Select Process Type" value={assignment.project_id} onChange={(value) => handleProjectChange(assignment.id, value)} options={dropdownData[`${assignment.id}-projects`] || []} disabled={!assignment.client_id} loading={loadingStates[`${assignment.id}-project`]} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">{assignment.client_name?.toLowerCase() === 'datavant' ? 'Process Types' : 'Locations'}</label><MultiSelectDropdown placeholder={assignment.client_name?.toLowerCase() === 'datavant' ? 'Select Process Types' : 'Select Locations'} selectedValues={assignment.selectedLocations} onChange={(values) => handleLocationsChange(assignment.id, values)} options={dropdownData[`${assignment.id}-locations`] || []} disabled={!assignment.project_id} loading={loadingStates[`${assignment.id}-location`]} /></div>
                  </div>
                  {assignment.subprojects.length > 0 && (<div className="mt-3 pt-3 border-t border-gray-200"><div className="flex items-center gap-2 mb-2"><MapPinIcon className="w-4 h-4 text-green-600" /><span className="text-xs font-medium text-gray-600">Selected ({assignment.subprojects.length})</span></div><div className="flex flex-wrap gap-1.5">{assignment.subprojects.map((sp, spIdx) => (<span key={spIdx} className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">{sp.subproject_name}</span>))}</div></div>)}
                </div>
              ))}
              <button onClick={addAssignmentRow} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition flex items-center justify-center gap-2"><PlusIcon className="w-5 h-5" /><span>Add Another Assignment</span></button>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">{step === 2 && `${assignments.filter(a => a.selectedLocations.length > 0).length} assignment(s) configured`}</div>
            <div className="flex items-center gap-3">
              {step === 1 ? (<><button onClick={onClose} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 font-medium transition">Cancel</button><button onClick={handleNext} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium transition">Next: Assign Locations</button></>) : (<><button onClick={handleBack} disabled={isSubmitting} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 font-medium transition disabled:opacity-50">Back</button><button onClick={handleSubmit} disabled={isSubmitting} className="px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium transition flex items-center gap-2 disabled:opacity-50">{isSubmitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Creating...</span></>) : (<><UserPlusIcon className="w-5 h-5" /><span>Create Resource</span></>)}</button></>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
AddResourceModal.displayName = "AddResourceModal";

// --- MAIN COMPONENT ---
export default function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [resourceId, setResourceId] = useState();
  const [confirmDeleteResource, setConfirmDeleteResource] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const [viewAssignmentsModal, setViewAssignmentsModal] = useState({ isOpen: false, resource: null });
  const [assignLocationsModal, setAssignLocationsModal] = useState({ isOpen: false, resource: null });
  const [qcAssignModal, setQcAssignModal] = useState({ isOpen: false, resource: null });
  const [editDetailsModal, setEditDetailsModal] = useState({ isOpen: false, resource: null });
  const [addResourceModal, setAddResourceModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [geographies, setGeographies] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loadingFilters, setLoadingFilters] = useState({ geo: false, client: false, project: false });
  const [filters, setFilters] = useState({ geography: "", client: "", project: "", search: "" });
  const debouncedSearch = useDebounce(filters.search, 400);
 
  useEffect(() => {
    const fetchGeographies = async () => {
      setLoadingFilters(prev => ({ ...prev, geo: true }));
      try { const res = await apiService.getGeographies({ limit: 100 }); setGeographies((res.data.geographies || []).map(g => ({ value: g._id, label: g.name }))); }
      catch (err) { console.error("Failed to fetch geographies:", err); }
      finally { setLoadingFilters(prev => ({ ...prev, geo: false })); }
    };
    fetchGeographies();
  }, []);

  useEffect(() => {
    if (!filters.geography) { setClients([]); return; }
    const fetchClients = async () => {
      setLoadingFilters(prev => ({ ...prev, client: true }));
      try { const res = await apiService.getClients(filters.geography, { limit: 100 }); setClients((res.data.clients || []).map(c => ({ value: c._id, label: c.name }))); }
      catch (err) { console.error("Failed to fetch clients:", err); }
      finally { setLoadingFilters(prev => ({ ...prev, client: false })); }
    };
    fetchClients();
  }, [filters.geography]);

  useEffect(() => {
    if (!filters.client) { setProjects([]); return; }
    const fetchProjects = async () => {
      setLoadingFilters(prev => ({ ...prev, project: true }));
      try { const res = await apiService.getProjects(filters.client, { limit: 100 }); setProjects((res.data.projects || []).map(p => ({ value: p._id, label: p.name }))); }
      catch (err) { console.error("Failed to fetch projects:", err); }
      finally { setLoadingFilters(prev => ({ ...prev, project: false })); }
    };
    fetchProjects();
  }, [filters.client]);

 
const fetchResources = useCallback(async () => {
  setIsLoading(true);
  try {
    // ✅ FIXED: Include all filter parameters
    const queryParams = { 
      page: currentPage, 
      limit: itemsPerPage, 
      search: debouncedSearch || undefined,
      geography: filters.geography || undefined,    // ← ADDED
      client: filters.client || undefined,          // ← ADDED
      project: filters.project || undefined         // ← ADDED
    };
    
    const res = await apiService.getResources(queryParams);
    
    if (res.data?.resources && res.data?.pagination) {
      const { resources, pagination } = res.data;
      
      const validTotal = Math.max(0, parseInt(pagination.total) || 0);
      const validPages = Math.max(1, parseInt(pagination.pages) || 1);
      const validPage = Math.max(1, parseInt(pagination.page) || 1);
      
      setResources(resources || []);
      setTotalItems(validTotal);
      setTotalPages(validPages);
      
      if (validPage > validPages && validTotal > 0) {
        setCurrentPage(1);
      }
    } else {
      console.warn('Unexpected pagination response:', res.data);
      setResources(res.data?.resources || []);
      setTotalItems(0);
      setTotalPages(1);
    }
  } catch (error) {
    console.error('Failed to fetch resources:', error);
    toast.error('Failed to load resources');
    setResources([]);
    setTotalItems(0);
    setTotalPages(1);
  } finally {
    setIsLoading(false);
  }
  // ✅ FIXED: Added filter dependencies
}, [currentPage, itemsPerPage, debouncedSearch, filters.geography, filters.client, filters.project]);

  useEffect(() => { fetchResources(); }, [fetchResources]);

  const getResourceName = useCallback((resourceId) => { const found = resources.find((r) => r._id === resourceId); return found ? found.name : "Unknown"; }, [resources]);

  const handleAddResource = useCallback(async (data) => {
    try { await apiService.addResource(data); toast.success("Resource created successfully"); fetchResources(); }
    catch (error) { console.error("Failed to add resource:", error); toast.error(error.response?.data?.message || "Failed to add resource"); throw error; }
  }, [fetchResources]);

  const handleSaveAssignments = useCallback(async (assignments) => {
    if (!assignLocationsModal.resource?._id) return;
    try { await apiService.updateAssignments(assignLocationsModal.resource._id, assignments); toast.success("Assignments updated successfully"); fetchResources(); }
    catch (error) { console.error("Failed to update assignments:", error); toast.error(error.response?.data?.message || "Failed to update assignments"); throw error; }
  }, [assignLocationsModal.resource, fetchResources]);

  const handleUpdateResourceDetails = useCallback(async (data) => {
    if (!editDetailsModal.resource?._id) return;
    try { await apiService.updateResource(editDetailsModal.resource._id, data); toast.success("Resource updated successfully"); fetchResources(); }
    catch (error) { console.error("Failed to update resource:", error); toast.error(error.response?.data?.message || "Failed to update resource"); throw error; }
  }, [editDetailsModal.resource, fetchResources]);

  const handleDeleteResource = useCallback(async (id) => {
    try { await apiService.deleteResource(id); toast.success("Resource deleted successfully"); fetchResources(); }
    catch (error) { console.error("Failed to delete resource:", error); toast.error("Failed to delete resource"); }
    setConfirmDeleteResource(false);
  }, [fetchResources]);

  const handleSearchChange = useCallback((e) => { setFilters((prev) => ({ ...prev, search: e.target.value })); setCurrentPage(1); }, []);

  const handleCSVUpload = useCallback(async (event, replaceMode = false) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) { toast.error("Please upload a valid CSV file"); return; }
    const formData = new FormData();
    formData.append("file", file);
    const toastId = toast.loading("Uploading CSV...");
    try {
      const uploadFn = replaceMode ? apiService.uploadResourceCSVReplace : apiService.uploadResourceCSV;
      const res = await uploadFn(formData);
      if (res.status === 207) {
        const blob = new Blob([res.data], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "resource-upload-errors.csv"; a.click(); URL.revokeObjectURL(url);
        const stats = JSON.parse(res.headers["x-stats"] || "{}");
        toast.error(`Some rows failed. Created: ${stats.created || 0}, Updated: ${stats.updated || 0}. Check downloaded CSV.`, { id: toastId, duration: 5000 });
      } else { const { stats } = res.data; toast.success(`Created: ${stats.created}, Updated: ${stats.updated}, Assignments: ${stats.assignments}`, { id: toastId }); }
      fetchResources();
    } catch (err) {
      console.error("CSV upload error:", err);
      if (err.response?.status === 207) { const blob = new Blob([err.response.data], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "resource-upload-errors.csv"; a.click(); URL.revokeObjectURL(url); toast.error("Some rows failed. Check downloaded CSV.", { id: toastId }); fetchResources(); }
      else { toast.error(err.response?.data?.error || "Error uploading CSV", { id: toastId }); }
    } finally { event.target.value = ""; }
  }, [fetchResources]);

  const handleDownloadTemplate = useCallback(() => {
    const csvContent = `Name,Location,Process Type,Client,Geography,Email ID
XYZ ,Christus Health,Complete logging,MRO,US,XYZ@valerionhealth.us
ABC,Banner Health,Complete logging,MRO,US,ABC@valerionhealth.us
DEF,Duke_Processing,Processing,MRO,US,DEF@valerionhealth.us
GHI,Banner Health_Processing,Processing,MRO,US,GHI@valerionhealth.us
JKL,Christus Health,Complete logging,MRO,US,JKL@valerionhealth.us`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "resource-upload-template.csv"; a.click(); URL.revokeObjectURL(url);
  }, []);

 
const handlePageChange = useCallback((newPage) => {
  if (newPage >= 1 && newPage <= totalPages) {
    setCurrentPage(newPage);
  } else if (newPage < 1) {
    setCurrentPage(1);
  } else if (newPage > totalPages) {
    setCurrentPage(totalPages);
  }
}, [totalPages]);

const handleItemsPerPageChange = useCallback((e) => {
  const newLimit = Math.max(1, Math.min(100, parseInt(e.target.value) || 10));
  setItemsPerPage(newLimit);
  setCurrentPage(1); // Reset to first page when changing items per page
}, []);
  const clearFilters = useCallback(() => { setFilters({ geography: "", client: "", project: "", search: "" }); setCurrentPage(1); }, []);

  return (
    <>
      <ViewAssignmentsModal isOpen={viewAssignmentsModal.isOpen} onClose={() => setViewAssignmentsModal({ isOpen: false, resource: null })} resource={viewAssignmentsModal.resource} />
      <EditResourceDetailsModal isOpen={editDetailsModal.isOpen} onClose={() => setEditDetailsModal({ isOpen: false, resource: null })} resource={editDetailsModal.resource} onSave={handleUpdateResourceDetails} />
      <AssignLocationsModal isOpen={assignLocationsModal.isOpen} onClose={() => setAssignLocationsModal({ isOpen: false, resource: null })} resource={assignLocationsModal.resource} onSave={handleSaveAssignments} />
      <QCAssignModal isOpen={qcAssignModal.isOpen} onClose={() => setQcAssignModal({ isOpen: false, resource: null })} targetResource={qcAssignModal.resource} />
      <AddResourceModal isOpen={addResourceModal} onClose={() => setAddResourceModal(false)} onSave={handleAddResource} />
      
      <div id="main-content" className="flex-1 p-4">
        <header id="header" className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold text-gray-900">Resource Assignment</h1><p className="text-gray-500">Assign resources to projects and locations</p></div>
            <div className="flex items-center space-x-3">
              <button onClick={() => setAddResourceModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-blue-700 text-sm font-medium transition"><UserPlusIcon className="w-5 h-5" /><span>Add Resource</span></button>
              <button onClick={handleDownloadTemplate} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-gray-200 text-sm"><ArrowDownTrayIcon className="w-5 h-5" /><span>Template</span></button>
              <label className="cursor-pointer bg-green-100 text-green-700 px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-green-200 text-sm"><ArrowUpTrayIcon className="w-5 h-5" /><span>Upload CSV</span><input type="file" accept=".csv" onChange={(e) => handleCSVUpload(e, false)} className="hidden" /></label>
              <label className="cursor-pointer bg-orange-100 text-orange-700 px-4 py-2 rounded-xl flex items-center space-x-2 hover:bg-orange-200 text-sm" title="Replaces existing assignments"><ArrowUpTrayIcon className="w-5 h-5" /><span>Replace CSV</span><input type="file" accept=".csv" onChange={(e) => handleCSVUpload(e, true)} className="hidden" /></label>
            </div>
          </div>
        </header>

        <div id="filters-section" className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
            {(filters.geography || filters.client || filters.project || filters.search) && (<button onClick={clearFilters} className="text-sm text-blue-600 hover:text-blue-800">Clear All</button>)}
          </div>
          <div className="grid grid-cols-5 gap-4">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Geography</label><FilterSelect placeholder="All Geographies" value={filters.geography} onChange={(value) => { setFilters(prev => ({ ...prev, geography: value, client: "", project: "" })); setCurrentPage(1); }} options={geographies} loading={loadingFilters.geo} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Client</label><FilterSelect placeholder="All Clients" value={filters.client} onChange={(value) => { setFilters(prev => ({ ...prev, client: value, project: "" })); setCurrentPage(1); }} options={clients} disabled={!filters.geography} loading={loadingFilters.client} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Process Type</label><FilterSelect placeholder="All Process Types" value={filters.project} onChange={(value) => { setFilters(prev => ({ ...prev, project: value })); setCurrentPage(1); }} options={projects} disabled={!filters.client} loading={loadingFilters.project} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Search Resource</label><input type="text" name="search" value={filters.search} onChange={handleSearchChange} placeholder="Name or email..." className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" /></div>
            <div className="flex items-end"><span className="inline-flex items-center px-4 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700">{totalItems} Resource{totalItems !== 1 ? 's' : ''}</span></div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-green-800">📋 CSV Upload Format</h3>
            <button onClick={() => setShowFormatInfo(!showFormatInfo)} className="text-sm text-green-700 hover:text-green-900">{showFormatInfo ? "Hide Details" : "Show Details"}</button>
          </div>
          <div className="grid grid-cols-6 gap-2 text-xs mt-3">
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Name</div>
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Location</div>
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Process Type</div>
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Client</div>
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Geography</div>
            <div className="bg-white rounded px-2 py-1.5 text-center font-medium border border-green-200">Email ID</div>
          </div>
          {showFormatInfo && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-green-200 text-xs text-gray-700">
              <p className="mb-2"><strong>Example rows:</strong></p>
              <code className="block bg-gray-100 p-2 rounded text-xs overflow-x-auto">Rashmi Kottachery,Christus Health,Complete logging,MRO,US,rashmi@valerionhealth.us<br/>Farheen Hasham,Banner Health_Processing,Processing,MRO,US,farheen@valerionhealth.us</code>
              <ul className="mt-3 space-y-1">
                <li>• <strong>Process Type:</strong> "Complete logging" maps to "Logging", "Processing" maps to "Processing"</li>
                <li>• <strong>Location:</strong> Must match exact subproject name in the system</li>
                <li>• <strong>Upload CSV:</strong> Merges with existing assignments</li>
                <li>• <strong>Replace CSV:</strong> Replaces all existing assignments for each resource</li>
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-md overflow-hidden max-h-[55vh] flex flex-col border">
          <div className="overflow-y-auto flex-1">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Assignments</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr><td colSpan="5" className="text-center py-8 text-gray-500"><div className="flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div><span className="ml-3">Loading resources...</span></div></td></tr>
                ) : resources.length > 0 ? (
                  resources.map((res) => (
                    <tr key={res._id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 whitespace-nowrap"><div className="flex items-center"><img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(res.name)}&background=random`} alt={res.name} className="w-9 h-9 rounded-full mr-3" /><span className="text-sm font-medium text-gray-900">{res.name}</span></div></td>
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-600">{res.email}</td>
                      <td className="px-6 py-3 whitespace-nowrap"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 capitalize">{res.role?.replace('_', ' ') || "associate"}</span></td>
                      <td className="px-6 py-3 whitespace-nowrap"><AssignmentBadge assignments={res.assignments} onClick={() => setViewAssignmentsModal({ isOpen: true, resource: res })} /></td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1">
                          <button onClick={() => setEditDetailsModal({ isOpen: true, resource: res })} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Edit Details"><PencilSquareIcon className="w-5 h-5" /></button>
                          <button onClick={() => setAssignLocationsModal({ isOpen: true, resource: res })} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition" title="Edit Assignments"><MapPinIcon className="w-5 h-5" /></button>
                          <button onClick={() => setQcAssignModal({ isOpen: true, resource: res })} className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition" title="Assign QC"><ClipboardDocumentCheckIcon className="w-5 h-5" /></button>
                          <button onClick={() => { setConfirmDeleteResource(true); setResourceId(res._id); }} className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition" title="Delete Resource"><TrashIcon className="w-5 h-5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5" className="text-center py-8 text-gray-500"><div className="flex flex-col items-center"><UserPlusIcon className="w-12 h-12 text-gray-300 mb-3" /><p className="font-medium">No resources found</p><p className="text-sm mt-1">Click "Add Resource" or upload a CSV to get started</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <ConfirmDeleteProjectModal isOpen={confirmDeleteResource} onClose={() => setConfirmDeleteResource(false)} projectName={getResourceName(resourceId)} onConfirm={() => handleDeleteResource(resourceId)} />
          
<div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
  <div className="flex items-center justify-between">
    <div className="text-sm text-gray-700">
      Showing{' '}
      <span className="font-medium">
        {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
      </span>{' '}
      to{' '}
      <span className="font-medium">
        {Math.min(currentPage * itemsPerPage, totalItems)}
      </span>{' '}
      of{' '}
      <span className="font-medium">{totalItems}</span>
    </div>
    
    <div className="flex items-center space-x-2">
      <select 
        value={itemsPerPage} 
        onChange={handleItemsPerPageChange} 
        className="border border-gray-300 rounded-md text-sm px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value={10}>10 / page</option>
        <option value={20}>20 / page</option>
        <option value={50}>50 / page</option>
      </select>
      
      <div className="flex rounded-md shadow-sm">
        {/* Previous Button */}
        <button 
          onClick={() => handlePageChange(currentPage - 1)} 
          disabled={currentPage === 1 || totalPages === 0 || isLoading}
          className={`inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-sm transition ${
            currentPage === 1 || totalPages === 0 || isLoading
              ? 'text-gray-300 cursor-not-allowed' 
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
          title={currentPage === 1 ? 'Already on first page' : 'Go to previous page'}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        
        {/* Page Info */}
        <span className="inline-flex items-center px-4 py-1.5 border-t border-b border-gray-300 bg-white text-sm text-gray-700 font-medium">
          {totalPages === 0 ? '0 / 0' : `${currentPage} / ${totalPages}`}
        </span>
        
        {/* Next Button - FIXED LOGIC */}
        <button 
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || totalPages === 0 || isLoading}
          className={`inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-sm transition ${
            currentPage >= totalPages || totalPages === 0 || isLoading
              ? 'text-gray-300 cursor-not-allowed' 
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
          title={currentPage >= totalPages ? 'Already on last page' : 'Go to next page'}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</div>
        </div>
      </div>
    </>
  );
}