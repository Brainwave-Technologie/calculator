
import React from "react";

const ConfirmDeleteProjectModal = ({ isOpen, onClose, onConfirm, projectName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg text-center w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Delete Project
        </h2>
        <p className="text-gray-600 mb-6 text-center ">
          Are you sure you want to delete <span className="font-semibold text-red-600">{projectName}</span>?<br />
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-gray-700 border border-gray-300 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteProjectModal;
