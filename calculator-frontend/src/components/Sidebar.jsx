import {
  ChartBarIcon,
  FolderIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CalculatorIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { FaChartBar } from "react-icons/fa";
import { FiDatabase } from "react-icons/fi";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CiSettings } from "react-icons/ci";

const navItems = [
  // { name: "Analysis", icon: CalculatorIcon, path: "/" },
  { name: "Dashboard", icon: ChartBarIcon, path: "/" },
  { name: "Projects", icon: FolderIcon, path: "/projects" },
  { name: "Resources", icon: UsersIcon, path: "/resources" },
  { name: "Productivity", icon: FaChartBar, path: "/productivity" },
  { name: "Costing", icon: CurrencyDollarIcon, path: "/costing" },
  { name: "Invoices", icon: Cog6ToothIcon, path: "/invoices" },
  { name: "Master Database", icon: FiDatabase, path: "/masterdatabase" },
  { name: "Settings", icon: CiSettings, path: "/settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    // ✅ Clear session data (adjust as needed)
    localStorage.removeItem("user");
    localStorage.removeItem("token");

    // Redirect to login page
    navigate("/login");
  };

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 p-4 flex flex-col justify-between">
      {/* Top Section */}
      <div>
        {/* Logo & Title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold">
              Billing Management System
            </h1>
          </div>
          <p className="text-xs text-gray-400 ml-8">v1.0.0</p>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                  ? "bg-blue-100 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
                  }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Logout Button */}
      <div className="mt-6 border-t pt-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-700 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors"
        >
          <ArrowLeftOnRectangleIcon className="h-5 w-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
