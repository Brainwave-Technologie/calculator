// components/DeleteGeographyModal.jsx - Confirmation modal for deleting geography with all nested data
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  TrashIcon,
  GlobeAltIcon,
  BuildingOfficeIcon,
  FolderIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

const apiUrl = import.meta.env.VITE_BACKEND_URL;

const DeleteGeographyModal = ({ isOpen, onClose, geography, onDeleteSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stats, setStats] = useState({
    clients: 0,
    projects: 0,
    locations: 0,
  });
  const [confirmText, setConfirmText] = useState('');

  // Fetch counts when modal opens
  useEffect(() => {
    if (isOpen && geography) {
      fetchCounts();
      setConfirmText('');
    }
  }, [isOpen, geography]);

  const fetchCounts = async () => {
    setIsLoading(true);
    try {
      // Fetch clients for this geography
      const clientsRes = await axios.get(`${apiUrl}/client/geography/${geography}`, {
        params: { limit: 1000 }
      });
      const clients = clientsRes.data.clients || [];
      
      let totalProjects = 0;
      let totalLocations = 0;

      // Fetch projects and locations for each client
      for (const client of clients) {
        try {
          const projectsRes = await axios.get(`${apiUrl}/project/client/${client._id}`, {
            params: { limit: 1000 }
          });
          const projects = projectsRes.data.projects || [];
          totalProjects += projects.length;

          // Fetch locations for each project
          for (const project of projects) {
            try {
              const locationsRes = await axios.get(`${apiUrl}/project/${project._id}/subproject`, {
                params: { limit: 1000 }
              });
              const locations = locationsRes.data.data || locationsRes.data.subprojects || [];
              totalLocations += locations.length;
            } catch (err) {
              console.error('Error fetching locations:', err);
            }
          }
        } catch (err) {
          console.error('Error fetching projects:', err);
        }
      }

      setStats({
        clients: clients.length,
        projects: totalProjects,
        locations: totalLocations,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
      toast.error('Failed to load data counts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete geography (backend should cascade delete all nested data)
      await axios.delete(`${apiUrl}/geography/${geography}`, {
        params: { cascade: true }
      });
      
      toast.success(`Successfully deleted ${geography.name} and all its data`);
      onDeleteSuccess();
      onClose();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.error || 'Failed to delete geography');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !geography) return null;

  const totalItems = 1 + stats.clients + stats.projects + stats.locations;
  const hasData = stats.clients > 0 || stats.projects > 0 || stats.locations > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <ExclamationTriangleIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Delete Geography</h2>
                <p className="text-red-100 text-sm">This action cannot be undone</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Geography Info */}
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <GlobeAltIcon className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-red-600 font-medium">Deleting Geography:</p>
              <p className="text-xl font-bold text-gray-900">{geography.name}</p>
            </div>
          </div>

          {/* Warning Message */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-amber-800 text-sm">
              <strong>⚠️ Warning:</strong> This will permanently delete the geography and{' '}
              <strong>ALL data inside it</strong>, including clients, projects, and locations.
            </p>
          </div>

          {/* Data Summary */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">
              The following will be deleted:
            </p>
            
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
                <span className="ml-3 text-gray-500">Calculating...</span>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Geography */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <GlobeAltIcon className="w-5 h-5 text-blue-600" />
                    <span className="text-gray-700">Geography</span>
                  </div>
                  <span className="font-bold text-gray-900">1</span>
                </div>

                {/* Clients */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <BuildingOfficeIcon className="w-5 h-5 text-purple-600" />
                    <span className="text-gray-700">Clients</span>
                  </div>
                  <span className={`font-bold ${stats.clients > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stats.clients}
                  </span>
                </div>

                {/* Projects */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FolderIcon className="w-5 h-5 text-orange-600" />
                    <span className="text-gray-700">Projects</span>
                  </div>
                  <span className={`font-bold ${stats.projects > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stats.projects}
                  </span>
                </div>

                {/* Locations */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <MapPinIcon className="w-5 h-5 text-green-600" />
                    <span className="text-gray-700">Locations</span>
                  </div>
                  <span className={`font-bold ${stats.locations > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stats.locations}
                  </span>
                </div>

                {/* Total */}
                <div className="flex items-center justify-between p-3 bg-red-100 rounded-lg border border-red-200 mt-3">
                  <span className="text-red-800 font-medium">Total items to delete:</span>
                  <span className="font-bold text-red-700 text-lg">{totalItems}</span>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Input */}
         

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
               className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <TrashIcon className="w-5 h-5" />
                  <span>Delete All</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteGeographyModal;