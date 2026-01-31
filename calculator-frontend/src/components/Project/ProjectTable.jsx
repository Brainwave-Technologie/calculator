import React, { useState } from 'react';
import { Trash2, Edit } from 'lucide-react';
import { deleteProject, deleteSubProject } from '../../services/projectService';
import toast from 'react-hot-toast';
import ConfirmDeleteProjectModal from './ConfirmDeleteProjectModal';
import ConfirmDeleteSubProjectModal from './ConfirmDeleteSubProjectModal';
import EditProjectModal from './EditProjectModal';
import EditSubProjectModal from './EditSubProjectModal';

const ProjectTable = ({ refreshProjects, data = [] }) => {
  const [loading, setLoading] = useState(null);
  const [isConfirmDeleteProjectModalOpen, setIsConfirmDeleteProjectModalOpen] = useState(false);
  const [isConfirmDeleteSubProjectModalOpen, setIsConfirmDeleteSubProjectModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState({});
  const [selectedSubProject, setSelectedSubProject] = useState({});
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [isEditSubProjectModalOpen, setIsEditSubProjectModalOpen] = useState(false);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDeleteProject = async (projectId) => {
    setLoading(`project-${projectId}`);
    try {
      const { status } = await deleteProject(projectId);
      if (status === 200) {
        toast.success('Project deleted successfully');
        await refreshProjects();
        setIsConfirmDeleteProjectModalOpen(false);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Failed to delete project');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteSubProject = async () => {
    setLoading(`subproject-${selectedSubProject._id}`);
    try {
      const { status } = await deleteSubProject(selectedSubProject._id);
      if (status === 200) {
        toast.success('Subproject deleted successfully');
        setIsConfirmDeleteSubProjectModalOpen(false);
        await refreshProjects();
      }
    } catch (error) {
      console.error('Error deleting subproject:', error);
      toast.error('Failed to delete subproject');
    } finally {
      setLoading(null);
    }
  };

  const handleEditProject = (project) => {
    setSelectedProject(project);
    setIsEditProjectModalOpen(true);
  };

  const handleEditSubproject = (project, subproject) => {
    setSelectedProject(project);
    setSelectedSubProject(subproject);
    setIsEditSubProjectModalOpen(true);
  };

  return (
    <div className="w-full overflow-x-auto p-6">
      <table className="min-w-full bg-white border border-gray-200 rounded-lg shadow-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Project</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Visibility</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Subprojects</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Created On</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Updated At</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase border-b">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((project) => (
            <tr key={project._id} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {project.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                  ${project.visibility === 'visible'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'}`}
                >
                  {project.visibility}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-600">
                {project.subprojects.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {project.subprojects.map((sub) => (
                      <div
                        key={sub._id}
                        className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg border border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-800">
                            {sub.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            ${sub.flatrate ?? 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditSubproject(project, sub)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                            title="Edit subproject"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedProject(project);
                              setSelectedSubProject(sub);
                              setIsConfirmDeleteSubProjectModalOpen(true);
                            }}
                            disabled={loading === `subproject-${sub._id}`}
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                            title="Delete subproject"
                          >
                            {loading === `subproject-${sub._id}` ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">No subprojects</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {formatDate(project.created_on)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {formatDate(project.updated_at)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditProject(project)}
                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                    title="Edit project"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProject(project);
                      setIsConfirmDeleteProjectModalOpen(true);
                    }}
                    disabled={loading === `project-${project._id}`}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
                    title="Delete project"
                  >
                    {loading === `project-${project._id}` ? (
                      <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Project delete confirmation */}
      <ConfirmDeleteProjectModal
        isOpen={isConfirmDeleteProjectModalOpen}
        onClose={() => setIsConfirmDeleteProjectModalOpen(false)}
        projectName={selectedProject.name}
        onConfirm={() => handleDeleteProject(selectedProject._id)}
      />

      {/* Subproject delete confirmation */}
      <ConfirmDeleteSubProjectModal
        isOpen={isConfirmDeleteSubProjectModalOpen}
        onClose={() => setIsConfirmDeleteSubProjectModalOpen(false)}
        projectName={selectedProject.name}
        subProjectName={selectedSubProject.name}
        onConfirm={handleDeleteSubProject}
      />

      {/* Edit Modals */}
      <EditProjectModal
        isOpen={isEditProjectModalOpen}
        onClose={() => setIsEditProjectModalOpen(false)}
        project={selectedProject}
        refreshProjects={refreshProjects}
      />
      <EditSubProjectModal
        isOpen={isEditSubProjectModalOpen}
        onClose={() => setIsEditSubProjectModalOpen(false)}
        project={selectedProject}
        subProject={selectedSubProject}
        refreshProjects={refreshProjects}
        allProjects={data}
      />
    </div>
  );
};

export default ProjectTable;
