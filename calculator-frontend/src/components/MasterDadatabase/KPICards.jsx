
import React, { useEffect, useState } from "react";
import {
  FolderKanban,
  FolderOpen,
  Users,
  Zap,
  BadgeDollarSign,
  RefreshCcw,
} from "lucide-react";
import axios from "axios";


const backendUrl = import.meta.env.VITE_BACKEND_URL;

const API_URL = `${backendUrl}/masterdb/dashboard-stats`;

const KPICards = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await axios.get(API_URL);
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="text-gray-500 text-center py-6 animate-pulse">
        Loading dashboard stats...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-red-500 text-center py-6">
        Unable to load dashboard data.
      </div>
    );
  }

  const cards = [
    {
      icon: <FolderKanban className="w-6 h-6 text-orange-500" />,
      title: "Total Projects",
      value: stats.projects?.total || 0,
      // subtitle: `${stats.projects?.visible || 0} visible`,
    },
    {
      icon: <FolderOpen className="w-6 h-6 text-yellow-500" />,
      title: "Sub-Projects",
      value: stats.sub_projects?.total || 0,
      // subtitle: `${stats.sub_projects?.active || 0} active`,
    },
    {
      icon: <Users className="w-6 h-6 text-blue-600" />,
      title: "Resources",
      value: stats.resources?.total || 0,
      // subtitle: `${stats.resources?.billable || 0} billable`,
    },
    {
      icon: <Zap className="w-6 h-6 text-yellow-500" />,
      title: "Productivity Tiers",
      value: stats.productivity_tiers?.total || 0,
      // subtitle: stats.productivity_tiers?.label || "",
    },
    {
      icon: <BadgeDollarSign className="w-6 h-6 text-green-600" />,
      title: "Billing Records",
      value: stats.billing_records?.total || 0,
      // subtitle: stats.billing_records?.label || "",
    },
    // {
    //   icon: <RefreshCcw className="w-6 h-6 text-cyan-600" />,
    //   title: "Updates Today",
    //   value: stats.updates_today?.total || 0,
    //   // subtitle: `Last sync: ${stats.updates_today?.last_sync || "N/A"}`,
    // },
  ];

  return (
    <div className="bg-gray-50 p-4 m-5 rounded-xl shadow-sm border">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 ">
        {cards.map((card, index) => (
          <div
            key={index}
            className="flex flex-col items-start p-4 bg-white border rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 mb-3">
              {card.icon}
            </div>
            <div className="flex items-baseline space-x-2">
              <h3 className="text-2xl font-bold text-gray-900">{card.value}</h3>
              <p className="text-sm font-medium text-gray-700">{card.title}</p>
            </div>
            <p className="text-sm text-gray-500 mt-1">{card.subtitle}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KPICards;
