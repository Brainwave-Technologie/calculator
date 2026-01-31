import { useState } from "react";
import axios from "axios";
import {
  LockClosedIcon,
  EnvelopeIcon,
  UserPlusIcon
} from "@heroicons/react/24/outline";

import {FiEye,FiEyeOff} from "react-icons/fi";

const SettingsPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  // 👇 base URL (reads from .env for clean config)
  const BASE_URL = import.meta.env.VITE_BACKEND_URL 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(`${BASE_URL}/auth/register`, {
        email,
        password,
      });

      if (response.status === 201 || response.status === 200) {
        setMessage({ type: "success", text: "User created successfully!" });
        setEmail("");
        setPassword("");
        setConfirmPassword("");
      } else {
        setMessage({
          type: "error",
          text: "Unexpected response from server.",
        });
      }
    } catch (error) {
      const errMsg =
        error.response?.data?.message ||
        error.message ||
        "Failed to create user. Please try again.";

      setMessage({ type: "error", text: errMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full mb-3">
            <UserPlusIcon className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">
            Create New User
          </h2>
          <p className="text-sm text-gray-500 text-center">
            Add new team members securely. Use a valid email and a strong password.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <div className="relative">
              <EnvelopeIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter email"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <LockClosedIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter password"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              {showPassword ? <FiEye
                              className="absolute right-3 top-3 text-gray-400 cursor-pointer"
                              onClick={() => setShowPassword(!showPassword)}
                            /> :
                            <FiEyeOff
                              className="absolute right-3 top-3 text-gray-400 cursor-pointer"
                              onClick={() => setShowPassword(!showPassword)}
                            />}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <LockClosedIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Re-enter password"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />{showPassword ? <FiEye
                              className="absolute right-3 top-3 text-gray-400 cursor-pointer"
                              onClick={() => setShowPassword(!showPassword)}
                            /> :
                            <FiEyeOff
                              className="absolute right-3 top-3 text-gray-400 cursor-pointer"
                              onClick={() => setShowPassword(!showPassword)}
                            />}
            </div>
          </div>

          {/* Alert */}
          {message && (
            <div
              className={`text-sm rounded-md px-3 py-2 ${message.type === "success"
                ? "bg-green-100 text-green-700 border border-green-300"
                : "bg-red-100 text-red-700 border border-red-300"
                }`}
            >
              {message.text}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 flex justify-center items-center gap-2 text-white font-medium rounded-lg transition ${loading
              ? "bg-blue-300 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            <UserPlusIcon className="h-5 w-5" />
            {loading ? "Creating..." : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;
