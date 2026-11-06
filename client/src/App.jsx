import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import CustomerShopPage from './pages/CustomerShopPage';
import OwnerLoginPage from './pages/owner/OwnerLoginPage';
import OwnerRegisterPage from './pages/owner/OwnerRegisterPage';
import OwnerDashboardPage from './pages/owner/OwnerDashboardPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#0f172a',
              color: '#ffffff',
              fontSize: '13px',
              borderRadius: '12px',
              padding: '12px 16px',
              fontWeight: 500,
            },
          }}
        />
        <Routes>
          {/* Public customer routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/s/:slug" element={<CustomerShopPage />} />

          {/* Owner authentication */}
          <Route path="/owner/login" element={<OwnerLoginPage />} />
          <Route path="/owner/register" element={<OwnerRegisterPage />} />

          {/* Protected owner dashboard */}
          <Route
            path="/owner/*"
            element={
              <ProtectedRoute>
                <OwnerDashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Protected super-admin portal */}
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/s/quickcopy-central" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
