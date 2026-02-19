// AppRoutes.jsx - Updated with unified dashboards
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Auth pages
import LoginPage from "./pages/LoginPage";
import ResourceLogin from "./pages/resources/ResourceLogin";

// Admin pages with Layout
import Layout from "./Layout";
import ProjectPage from "./pages/Project";
import Productivity from "./pages/Productivity";
import ResourcesPage from "./pages/Resources";
import MasterDatabase from "./pages/MasterDatabase";
import Invoices from "./pages/Invoices";
import SettingsPage from "./pages/Settings";
import BillingDashboard from "./pages/Dashboard";

// Resource pages
import ResourceDashboard from "./pages/resources/ResourceDashboard";
import MRODetailedEntries from "./pages/payout/Detailedallocationentries";
import VerismaDetailedEntries from "./pages/payout/Detailedallocationentries";
// Protected route components
import { AdminRoute, HomeRedirect } from "./components/ProtectedRoute";
import ResourceRoute from "./components/ResourceRoute";
import PreviousLoggedCases from "./pages/resources/PreviousLoggedCases";
import ResourceLoginActivity from "./pages/admin/ResourceLoginActivity";
import AdminPreviousCases from "./pages/admin/AdminPreviousCases";
import AdminDeleteRequests from "./pages/admin/AdminDeleteRequests";
import AdminResourceCases from "./pages/admin/AdminResourceCases";

// ═══════════════════════════════════════════════════════════════
// NEW UNIFIED DASHBOARDS - Single page with client navigation
// ═══════════════════════════════════════════════════════════════
import PayrollDashboard from "./pages/payout/PayrollDashboard";       // Unified: Verisma/MRO/Datavant
import CostingDashboard from "./pages/Costing";              // Unified: Verisma/MRO/Datavant
import ProcessingPayoutDashboard from "./pages/payout/processingpayout/ProcessingPayoutDashboard";
     import ResourcePayoutCalculator from './pages/payout/ResourcePayoutCalculator';
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
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/masterdatabase" element={<MasterDatabase />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin-delete-requests" element={<AdminDeleteRequests />} />
        <Route path="/admin-resource-cases" element={<AdminResourceCases />} />

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* UNIFIED DASHBOARDS - Single page per feature               */}
        {/* ═══════════════════════════════════════════════════════════ */}
        
        {/* Payroll Dashboard - All clients in one page with buttons */}
        <Route path="/payroll" element={<PayrollDashboard />} />
        
        {/* Costing Dashboard - All clients in one page with buttons */}
        <Route path="/costing" element={<CostingDashboard />} />
        
        {/* Processing Payout Dashboard - Verisma/MRO combined */}
        <Route path="/processing-payout" element={<ProcessingPayoutDashboard />} />

        {/* Legacy routes redirect to unified dashboards */}
        <Route path="/payout-dashboard" element={<Navigate to="/payroll" replace />} />
        {/* <Route path ='/entries/verisma' element={<VerismaDetailedEntries clientName="Verisma" />} />
        <Route path ='/entries/mro' element={<MRODetailedEntries clientName="MRO" />} /> */}
   

<Route path="/payout/calculator" element={<ResourcePayoutCalculator />} />
      </Route>

      {/* Resource routes */}
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