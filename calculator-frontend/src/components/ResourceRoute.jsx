// components/ResourceRoute.jsx - Protected route for resources with session timeout
// This is a self-contained component - no external context provider needed
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const apiBaseUrl = import.meta.env.VITE_BACKEND_URL;

// Session configuration
const SESSION_CONFIG = {
  TIMEOUT_MINUTES: 10,
  WARNING_BEFORE_SECONDS: 60,
  CHECK_INTERVAL: 10000,
  PING_INTERVAL: 60000,
};

// Events that count as user activity
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

// Session Timeout Warning Modal
const SessionTimeoutWarning = ({ remainingTime, onStayLoggedIn, onLogout }) => {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Session Expiring!</h2>
          </div>
        </div>
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-amber-100 rounded-full mb-4">
              <svg className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-600 mb-2">Your session will expire due to inactivity in:</p>
            <div className="text-5xl font-bold text-amber-600 my-4">{formatTime(remainingTime)}</div>
            <p className="text-sm text-gray-500">{remainingTime <= 30 ? '⚠️ Act now to stay logged in!' : 'Click below to continue working'}</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-6 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-red-500 h-3 rounded-full transition-all duration-1000" style={{ width: `${Math.max(0, (remainingTime / SESSION_CONFIG.WARNING_BEFORE_SECONDS) * 100)}%` }} />
          </div>
          <div className="flex gap-3">
            <button onClick={onStayLoggedIn} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all">✓ Stay Logged In</button>
            <button onClick={onLogout} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition">Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Loading Spinner
const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600 font-medium">Verifying session...</p>
    </div>
  </div>
);

// Main ResourceRoute Component
const ResourceRoute = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [resource, setResource] = useState(null);
  const [remainingTime, setRemainingTime] = useState(SESSION_CONFIG.TIMEOUT_MINUTES * 60);
  const [showWarning, setShowWarning] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const countdownRef = useRef(null);
  const pingIntervalRef = useRef(null);

  const getToken = useCallback(() => localStorage.getItem('token'), []);
  const getUserType = useCallback(() => localStorage.getItem('userType'), []);
  
  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('resourceData');
  }, []);

  const handleSessionTimeout = useCallback((message = 'Session timed out due to inactivity') => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    clearSession();
    setIsAuthenticated(false);
    setResource(null);
    setShowWarning(false);
    toast.error(message, { duration: 5000, position: 'top-center' });
    navigate('/resource-login', { replace: true, state: { message: 'Your session has expired. Please login again.' } });
  }, [clearSession, navigate]);

  const logout = useCallback(async () => {
    const token = getToken();
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (token) {
      try {
        await axios.post(`${apiBaseUrl}/auth/resource-logout`, {}, { headers: { Authorization: `Bearer ${token}` } });
      } catch (err) { console.error('Logout API error:', err); }
    }
    clearSession();
    setIsAuthenticated(false);
    setResource(null);
    setShowWarning(false);
    toast.success('Logged out successfully');
    navigate('/resource-login', { replace: true });
  }, [getToken, clearSession, navigate]);

  const refreshSession = useCallback(async () => {
    const token = getToken();
    if (!token) return false;
    try {
      const response = await axios.post(`${apiBaseUrl}/auth/resource-session-refresh`, {}, { headers: { Authorization: `Bearer ${token}` } });
      if (response.data.success) {
        lastActivityRef.current = Date.now();
        setRemainingTime(SESSION_CONFIG.TIMEOUT_MINUTES * 60);
        setShowWarning(false);
        return true;
      }
      return false;
    } catch (err) {
      if (err.response?.status === 401) handleSessionTimeout(err.response.data?.message || 'Session expired');
      return false;
    }
  }, [getToken, handleSessionTimeout]);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setRemainingTime(SESSION_CONFIG.TIMEOUT_MINUTES * 60);
      refreshSession();
    }
  }, [showWarning, refreshSession]);

  // Initial auth check
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();
      const userType = getUserType();
      
      if (!token || userType !== 'resource') {
        setIsLoading(false);
        setIsAuthenticated(false);
        return;
      }

      try {
        const response = await axios.get(`${apiBaseUrl}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
        if (response.data.valid && response.data.userType === 'resource') {
          setIsAuthenticated(true);
          setResource(response.data.resource);
          lastActivityRef.current = Date.now();
          if (response.data.session?.remaining_seconds) setRemainingTime(response.data.session.remaining_seconds);
        } else {
          clearSession();
          setIsAuthenticated(false);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          if (err.response.data?.code === 'SESSION_TIMEOUT') handleSessionTimeout('Session timed out due to inactivity');
          else { clearSession(); setIsAuthenticated(false); }
        } else {
          setIsAuthenticated(true); // Network error - try to continue
        }
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [getToken, getUserType, clearSession, handleSessionTimeout]);

  // Activity listeners
  useEffect(() => {
    if (!isAuthenticated) return;
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, handleActivity));
  }, [isAuthenticated, handleActivity]);

  // Countdown timer
  useEffect(() => {
    if (!isAuthenticated) return;
    countdownRef.current = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      const timeoutMs = SESSION_CONFIG.TIMEOUT_MINUTES * 60 * 1000;
      const remainingSecs = Math.max(0, Math.floor((timeoutMs - timeSinceActivity) / 1000));
      setRemainingTime(remainingSecs);
      if (remainingSecs <= SESSION_CONFIG.WARNING_BEFORE_SECONDS && remainingSecs > 0) setShowWarning(true);
      if (remainingSecs <= 0) handleSessionTimeout('Session timed out due to inactivity');
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [isAuthenticated, handleSessionTimeout]);

  // Server ping
  useEffect(() => {
    if (!isAuthenticated) return;
    pingIntervalRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current < 2 * 60 * 1000) refreshSession();
    }, SESSION_CONFIG.PING_INTERVAL);
    return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); };
  }, [isAuthenticated, refreshSession]);

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/resource-login" state={{ from: location }} replace />;

  return (
    <>
      {showWarning && <SessionTimeoutWarning remainingTime={remainingTime} onStayLoggedIn={() => { handleActivity(); refreshSession(); }} onLogout={logout} />}
      {React.isValidElement(children) ? React.cloneElement(children, { resource, sessionInfo: { remainingTime, refreshSession, logout } }) : children}
    </>
  );
};

export default ResourceRoute;