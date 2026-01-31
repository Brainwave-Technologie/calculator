// components/ResourceProtectedRoute.jsx - Protected route wrapper for resource pages
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useResourceSession } from '../contexts/ResourceSessionContext';
import SessionTimeoutWarning from './SessionTimeoutWarning';

const ResourceProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useResourceSession();
  const location = useLocation();

  // Show loading spinner while checking session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/resource/login" state={{ from: location }} replace />;
  }

  // Render protected content with timeout warning
  return (
    <>
      <SessionTimeoutWarning />
      {children}
    </>
  );
};

export default ResourceProtectedRoute;