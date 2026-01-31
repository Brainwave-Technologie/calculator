import React, { useState, useEffect } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL; // Adjust if needed

// --- Fetch Tiers from API ---
const fetchProductivityTiers = async () => {
  const res = await axios.get(`${apiBaseUrl}/level/tiers`);
  return res.data;
};

// --- Add Tier Modal ---
const AddTierModal = ({ isOpen, onClose, projects, onAddTiers, editProjectId, editSubProjectId }) => {
  const [selectedProject, setSelectedProject] = useState('');
  const [subProjects, setSubProjects] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSubProject, setSelectedSubProject] = useState('');
  const [rates, setRates] = useState({ low: '', medium: '', high: '', best: '' });
  // console.log(editProjectId, editSubProjectId);  
  // Pre-fill when editing
  useEffect(() => {
    if (editProjectId && editSubProjectId) {
      setSelectedProject(editProjectId);
      setSelectedSubProject(editSubProjectId);

      axios
        .get(`${apiBaseUrl}/level/tiers/${editSubProjectId}`)
        .then((res) => {
          const existingTiers = res.data;
          const updatedRates = { low: '', medium: '', high: '', best: '' };
          existingTiers.forEach((tier) => {
            if (tier.level.toLowerCase() in updatedRates) {
              updatedRates[tier.level.toLowerCase()] = tier.base_rate;
            }
          });
          setRates(updatedRates);
        })
        .catch((err) => console.error('Failed to fetch existing tiers:', err));
    }
  }, [editProjectId, editSubProjectId]);

  // Fetch subprojects when a project is selected
  useEffect(() => {
    if (!selectedProject) return;
    axios.get(`${apiBaseUrl}/project/${selectedProject}/subproject`)
      .then((res) => setSubProjects(res.data))
      .catch((err) => console.error('Failed to fetch subprojects:', err));
  }, [selectedProject]);

  const handleRateChange = (level, value) => {
    setRates((prev) => ({ ...prev, [level]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedProject || !selectedSubProject) {
      alert('Please select both project and subproject.');
      return;
    }
    setIsSubmitting(true);

    const payload = {
      project_id: selectedProject,
      subproject_id: selectedSubProject,
      tiers: rates,
    };

    try {
      await axios.post(`${apiBaseUrl}/level`, payload);
      onAddTiers();
      handleClose();
    } catch (error) {
      console.error('Failed to add tiers:', error);
      alert('Error adding tiers. Check console for details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedProject('');
    setSelectedSubProject('');
    setRates({ low: '', medium: '', high: '', best: '' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-800 mb-6">Add New Productivity Tier</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Project</option>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Sub-Project</label>
            <select
              value={selectedSubProject}
              onChange={(e) => setSelectedSubProject(e.target.value)}
              disabled={!selectedProject || subProjects.length === 0}
              className="w-full p-2 bg-gray-50 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200"
            >
              <option value="">Select Sub-Project</option>
              {subProjects.map((sp) => (
                <option key={sp._id} value={sp._id}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-600 mb-4">
            Productivity Levels
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {['Low', 'Medium', 'High', 'Best'].map((level) => (
              <div key={level}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{level}</label>
                <input
                  type="number"
                  placeholder="Base Rate ($)"
                  value={rates[level.toLowerCase()]}
                  onChange={(e) => handleRateChange(level.toLowerCase(), e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            onClick={handleClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isSubmitting ? 'Saving...' : 'Save Tier'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Level Badge ---
const ProductivityBadge = ({ level }) => {
  const base = 'px-3 py-1 text-xs font-medium rounded-full inline-block';
  const colors = {
    low: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-green-100 text-green-800',
    best: 'bg-sky-100 text-sky-800',
  };
  return <span className={`${base} ${colors[level.toLowerCase()] || 'bg-gray-100 text-gray-800'}`}>{level}</span>;
};

// --- Main Component ---
export default function Productivity() {
  const [tiers, setTiers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [subprojects, setSubProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSubProject, setSelectedSubProject] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);
  const [editSubProjectId, setEditSubProjectId] = useState(null);
  const [filteredTiers, setFilteredTiers] = useState([]);

  useEffect(() => {
    axios.get(`${apiBaseUrl}/project`).then((res) => setProjects(res.data));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    axios.get(`${apiBaseUrl}/project/${selectedProject}/subproject`)
      .then((res) => setSubProjects(res.data))
      .catch((err) => console.error('Failed to fetch subprojects:', err));
  }, [selectedProject]);

  const loadTiers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchProductivityTiers();
      setTiers(data);
    } catch (err) {
      console.error('Error loading tiers:', err);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTiers();
  }, []);

  useEffect(() => {
    let filtered = [...tiers];

    if (selectedProject) {
      filtered = filtered.filter(
        (t) => t.project_id === selectedProject
      );
    }

    if (selectedSubProject) {
      filtered = filtered.filter(
        (t) => t.subproject_id === selectedSubProject
      );
    }
    console.log(filtered)
    setFilteredTiers(filtered);
  }, [tiers, selectedProject, selectedSubProject]);

  return (
    <>
      <AddTierModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projects={projects}
        onAddTiers={loadTiers}
        editProjectId={editProjectId}
        editSubProjectId={editSubProjectId}
      />

      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">Productivity Mapping</h1>
          <p className="text-gray-500 mt-1">
            Configure productivity tiers and rates for projects and sub-projects.
          </p>
        </header>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
          <h3 className="text-md font-semibold text-gray-700 mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Select Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Project</option>
                {projects.map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Select Sub-Project
              </label>
              <select
                value={selectedSubProject}
                onChange={(e) => setSelectedSubProject(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Sub-Project</option>
                {subprojects.length > 0 ? (
                  subprojects.map((sp) => (
                    <option key={sp._id} value={sp._id}>
                      {sp.name}
                    </option>
                  ))
                ) : (
                  <option value="">No Sub-Projects</option>
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Productivity Tiers ({tiers.length})
            </h3>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Add Tier
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Sub-Project
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Level
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Base Rate ($)
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : (
                  filteredTiers.map((tier) => (
                    <tr key={tier._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-lg text-gray-800">
                        {tier.project || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-lg text-gray-800">
                        {tier.subProject || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <ProductivityBadge level={tier.level} />
                      </td>
                      <td className="px-6 py-4 text-lg text-gray-800">${tier.rate}</td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <div className="flex items-center gap-4">
                          <button
                            className="text-blue-600 hover:text-blue-800"
                            title="Edit"
                            onClick={() => {
                              setIsModalOpen(true);
                              setEditProjectId(tier.project_id);
                              setEditSubProjectId(tier.subproject_id);
                            }}
                          >
                            <PencilSquareIcon className="w-5 h-5" />
                          </button>
                          {/* <button className="text-red-600 hover:text-red-800" title="Delete"> <TrashIcon className="w-5 h-5" /> */}
                          {/* </button> */}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
