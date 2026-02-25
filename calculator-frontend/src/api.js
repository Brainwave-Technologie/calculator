import axios from "axios";
import toast from "react-hot-toast";

// ✅ Create Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ Request Interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available (optional)
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Response Interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      if (error.response.status === 401) {
        const isAuthRoute = error.config?.url?.includes('/auth/');
        if (isAuthRoute) {
          toast.error("Wrong Credentials. Please try again.");
        } else {
          toast.error("Session expired. Please login again.");
          localStorage.removeItem('token');
          localStorage.removeItem('userType');
          localStorage.removeItem('resourceInfo');
          window.location.href = '/login';
        }
      }
    } else {
      console.error("Network Error:", error.message);
    }

    return Promise.reject(error);
  }
);

// Also handle 401 on the default axios instance (used by pages like Resources.jsx)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAuthRoute = error.config?.url?.includes('/auth/');
      if (!isAuthRoute) {
        toast.error("Session expired. Please login again.");
        localStorage.removeItem('token');
        localStorage.removeItem('userType');
        localStorage.removeItem('resourceInfo');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
