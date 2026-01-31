import React from "react";
import { Navigate, Outlet } from "react-router-dom";

// Helper function to check admin authentication
const isAdminAuthenticated = () => {
  const token = localStorage.getItem("token");
  const userType = localStorage.getItem("userType");
  return token && userType === "admin";
};

// Helper function to check resource authentication
const isResourceAuthenticated = () => {
  const token = localStorage.getItem("token");
  const userType = localStorage.getItem("userType");
  return token && userType === "resource";
};

// Admin route protection
export const AdminRoute = ({ children }) => {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children ? children : <Outlet />;
};

// Resource route protection
export const ResourceRoute = ({ children }) => {
  if (!isResourceAuthenticated()) {
    return <Navigate to="/resource-login" replace />;
  }
  return children ? children : <Outlet />;
};

// Home redirect based on role
export const HomeRedirect = () => {
  if (isAdminAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isResourceAuthenticated()) {
    return <Navigate to="/resource/dashboard" replace />;
  }

  // Default: redirect to admin login
  return <Navigate to="/login" replace />;
};

// Default export for backward compatibility
const ProtectedRoute = () => {
  return isAdminAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;