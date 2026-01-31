import React from "react";

const ConfirmDeleteSubProjectModal = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
  subProjectName
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Confirm Deletion
        </h2>
        <p className="text-gray-700 mb-6">
          Are you sure you want to delete the subproject{" "}
          <span className="font-semibold text-red-600">"{subProjectName}"</span>{" "}
          under project{" "}
          <span className="font-semibold text-blue-700">"{projectName}"</span>?
          <br />
          This action <span className="font-bold">cannot</span> be undone.
        </p>
        <div className="flex justify-end gap-2">
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

export default ConfirmDeleteSubProjectModal;
