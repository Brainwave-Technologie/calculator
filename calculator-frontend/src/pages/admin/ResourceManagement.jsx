// src/pages/admin/ResourceManagement.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AsyncSelect from 'react-select/async';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const ResourceManagement = () => {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'associate',
    employee_id: '',
    status: 'active',
    assignments: []
  });

  // For assignment selection
  const [geographies, setGeographies] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [subprojects, setSubprojects] = useState([]);
  const [selectedGeo, setSelectedGeo] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedSubprojects, setSelectedSubprojects] = useState([]);

  useEffect(() => {
    fetchResources();
    fetchGeographies();
  }, []);

  const getAuthHeaders = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });

  const fetchResources = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/resources`, getAuthHeaders());
      setResources(response.data.resources);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGeographies = async () => {
    try {
      const response = await axios.get(`${API_URL}/geographies`, getAuthHeaders());
      setGeographies(response.data);
    } catch (error) {
      console.error('Error fetching geographies:', error);
    }
  };

  const fetchClients = async (geoId) => {
    try {
      const response = await axios.get(`${API_URL}/clients?geography_id=${geoId}`, getAuthHeaders());
      setClients(response.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchProjects = async (clientId) => {
    try {
      const response = await axios.get(`${API_URL}/projects?client_id=${clientId}`, getAuthHeaders());
      setProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchSubprojects = async (projectId) => {
    try {
      const response = await axios.get(`${API_URL}/subprojects?project_id=${projectId}`, getAuthHeaders());
      setSubprojects(response.data);
    } catch (error) {
      console.error('Error fetching subprojects:', error);
    }
  };

  const handleGeoChange = (geo) => {
    setSelectedGeo(geo);
    setSelectedClient(null);
    setSelectedProject(null);
    setSelectedSubprojects([]);
    setClients([]);
    setProjects([]);
    setSubprojects([]);
    if (geo) fetchClients(geo._id);
  };

  const handleClientChange = (client) => {
    setSelectedClient(client);
    setSelectedProject(null);
    setSelectedSubprojects([]);
    setProjects([]);
    setSubprojects([]);
    if (client) fetchProjects(client._id);
  };

  const handleProjectChange = (project) => {
    setSelectedProject(project);
    setSelectedSubprojects([]);
    setSubprojects([]);
    if (project) fetchSubprojects(project._id);
  };

  const handleAddAssignment = () => {
    if (!selectedGeo || !selectedClient || !selectedProject || selectedSubprojects.length === 0) {
      alert('Please select geography, client, project and at least one location');
      return;
    }

    const newAssignment = {
      geography_id: selectedGeo._id,
      geography_name: selectedGeo.name,
      client_id: selectedClient._id,
      client_name: selectedClient.name,
      project_id: selectedProject._id,
      project_name: selectedProject.name,
      subprojects: selectedSubprojects.map(sp => ({
        subproject_id: sp._id,
        subproject_name: sp.name
      }))
    };

    // Check if assignment already exists
    const existingIndex = formData.assignments.findIndex(
      a => a.client_id === newAssignment.client_id && a.project_id === newAssignment.project_id
    );

    if (existingIndex >= 0) {
      // Merge subprojects
      const updated = [...formData.assignments];
      const existingSubIds = updated[existingIndex].subprojects.map(s => s.subproject_id);
      newAssignment.subprojects.forEach(sp => {
        if (!existingSubIds.includes(sp.subproject_id)) {
          updated[existingIndex].subprojects.push(sp);
        }
      });
      setFormData({ ...formData, assignments: updated });
    } else {
      setFormData({
        ...formData,
        assignments: [...formData.assignments, newAssignment]
      });
    }

    // Reset selection
    setSelectedGeo(null);
    setSelectedClient(null);
    setSelectedProject(null);
    setSelectedSubprojects([]);
  };

  const handleRemoveAssignment = (index) => {
    const updated = formData.assignments.filter((_, i) => i !== index);
    setFormData({ ...formData, assignments: updated });
  };

  const handleRemoveSubproject = (assignmentIndex, subprojectIndex) => {
    const updated = [...formData.assignments];
    updated[assignmentIndex].subprojects.splice(subprojectIndex, 1);
    if (updated[assignmentIndex].subprojects.length === 0) {
      updated.splice(assignmentIndex, 1);
    }
    setFormData({ ...formData, assignments: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingResource) {
        await axios.put(
          `${API_URL}/resources/${editingResource._id}`,
          formData,
          getAuthHeaders()
        );
      } else {
        await axios.post(`${API_URL}/resources`, formData, getAuthHeaders());
      }
      
      fetchResources();
      closeModal();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save resource');
    }
  };

  const handleEdit = (resource) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      email: resource.email,
      role: resource.role || 'associate',
      employee_id: resource.employee_id || '',
      status: resource.status || 'active',
      assignments: resource.assignments || []
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this resource?')) return;
    
    try {
      await axios.delete(`${API_URL}/resources/${id}`, getAuthHeaders());
      fetchResources();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete resource');
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingResource(null);
    setFormData({
      name: '',
      email: '',
      role: 'associate',
      employee_id: '',
      status: 'active',
      assignments: []
    });
    setSelectedGeo(null);
    setSelectedClient(null);
    setSelectedProject(null);
    setSelectedSubprojects([]);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Resource Management</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add New Resource
        </button>
      </div>

      {/* Resources Table */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assignments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {resources.map(resource => (
                <tr key={resource._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{resource.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{resource.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 capitalize">{resource.role}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      resource.status === 'active' ? 'bg-green-100 text-green-800' :
                      resource.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {resource.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {resource.assignments?.length || 0} assignments
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => handleEdit(resource)}
                      className="text-blue-600 hover:text-blue-800 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(resource._id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {editingResource ? 'Edit Resource' : 'Add New Resource'}
              </h2>
              
              <form onSubmit={handleSubmit}>
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Resources login via OTP sent to this email</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                    <input
                      type="text"
                      value={formData.employee_id}
                      onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="associate">Associate</option>
                      <option value="team_lead">Team Lead</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Assignment Section */}
                <div className="border-t pt-4 mb-4">
                  <h3 className="text-lg font-medium mb-4">Location Assignments</h3>
                  
                  {/* Assignment Selector */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <select
                      value={selectedGeo?._id || ''}
                      onChange={(e) => {
                        const geo = geographies.find(g => g._id === e.target.value);
                        handleGeoChange(geo);
                      }}
                      className="px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select Geography</option>
                      {geographies.map(g => (
                        <option key={g._id} value={g._id}>{g.name}</option>
                      ))}
                    </select>

                    <select
                      value={selectedClient?._id || ''}
                      onChange={(e) => {
                        const client = clients.find(c => c._id === e.target.value);
                        handleClientChange(client);
                      }}
                      className="px-3 py-2 border rounded-lg"
                      disabled={!selectedGeo}
                    >
                      <option value="">Select Client</option>
                      {clients.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                      ))}
                    </select>

                    <select
                      value={selectedProject?._id || ''}
                      onChange={(e) => {
                        const project = projects.find(p => p._id === e.target.value);
                        handleProjectChange(project);
                      }}
                      className="px-3 py-2 border rounded-lg"
                      disabled={!selectedClient}
                    >
                      <option value="">Select Project</option>
                      {projects.map(p => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleAddAssignment}
                      disabled={!selectedProject || selectedSubprojects.length === 0}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300"
                    >
                      Add Assignment
                    </button>
                  </div>

                  {/* Subproject Selection */}
                  {subprojects.length > 0 && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Locations (Subprojects)
                      </label>
                      <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                        {subprojects.map(sp => (
                          <label key={sp._id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selectedSubprojects.some(s => s._id === sp._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSubprojects([...selectedSubprojects, sp]);
                                } else {
                                  setSelectedSubprojects(selectedSubprojects.filter(s => s._id !== sp._id));
                                }
                              }}
                            />
                            {sp.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Current Assignments */}
                  <div className="space-y-2">
                    {formData.assignments.map((assignment, aIdx) => (
                      <div key={aIdx} className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium text-sm">
                            {assignment.geography_name} → {assignment.client_name} → {assignment.project_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignment(aIdx)}
                            className="text-red-500 hover:text-red-700 text-sm"
                          >
                            Remove All
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {assignment.subprojects.map((sp, spIdx) => (
                            <span
                              key={spIdx}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white rounded text-sm"
                            >
                              {sp.subproject_name}
                              <button
                                type="button"
                                onClick={() => handleRemoveSubproject(aIdx, spIdx)}
                                className="text-red-500 hover:text-red-700"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    {formData.assignments.length === 0 && (
                      <p className="text-gray-500 text-sm text-center py-4">
                        No assignments added yet. Select geography, client, project and locations above.
                      </p>
                    )}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingResource ? 'Update Resource' : 'Create Resource'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceManagement;
