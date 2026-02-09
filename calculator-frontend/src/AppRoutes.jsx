import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Auth pages
import LoginPage from "./pages/LoginPage";
import ResourceLogin from "./pages/resources/ResourceLogin";

// Admin pages with Layout
import Layout from "./Layout";
import ProjectPage from "./pages/Project";
import Productivity from "./pages/Productivity";
import Costing from "./pages/Costing";
import ResourcesPage from "./pages/Resources";
import MasterDatabase from "./pages/MasterDatabase";
import Invoices from "./pages/Invoices";
import SettingsPage from "./pages/Settings";
import BillingDashboard from "./pages/Dashboard";

// Resource pages
import ResourceDashboard from "./pages/resources/ResourceDashboard";

// Protected route components
import { AdminRoute, HomeRedirect } from "./components/ProtectedRoute";
import ResourceRoute from "./components/ResourceRoute"; // Use the new one with session timeout
import PreviousLoggedCases from "./pages/resources/PreviousLoggedCases";
// import ResourceManagement from "./pages/admin/ResourceManagement";
import ResourceLoginActivity from "./pages/admin/ResourceLoginActivity";
import AdminPreviousCases from "./pages/admin/AdminPreviousCases";
import AdminDeleteRequests from "./pages/admin/AdminDeleteRequests";
import AdminResourceCases from "./pages/admin/AdminResourceCases";

const AppRoutes = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/resource-login" element={<ResourceLogin />} />

      {/* Home redirect based on role */}
      <Route path="/" element={<HomeRedirect />} />

      {/* Admin routes with Layout */}
      <Route
        element={
          <AdminRoute>
            <Layout />
          </AdminRoute>
        }
      >
        <Route path="/dashboard" element={<BillingDashboard />} />
        <Route path="/projects" element={<ProjectPage />} />
        <Route path="/productivity" element={<Productivity />} />
        <Route path="/costing" element={<Costing />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/masterdatabase" element={<MasterDatabase />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin-delete-requests" element={<AdminDeleteRequests />} />
        <Route path="/admin-resource-cases" element={<AdminResourceCases />} />

      </Route>

      {/* Resource routes - ResourceRoute handles everything internally */}
      <Route
        path="/resource/dashboard"
        element={
          <ResourceRoute>
            <ResourceDashboard />
          </ResourceRoute>
        }
      />
      <Route 
          path="/previous-logged-cases" 
          element={
            <ResourceRoute>
              <PreviousLoggedCases />
            </ResourceRoute>
          } 
        />

      {/* 404 - Redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;