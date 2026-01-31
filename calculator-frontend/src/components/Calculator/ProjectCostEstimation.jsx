import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import FancyDropdown from "../FancyDropdown";
import ProjectCostEstimationTable from "./Table/ProjectCostEstimationTable";

const ProjectCostEstimation = () => {
  const [projects, setProjects] = useState([]);
  const [tableData, setTableData] = useState({});
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [selectedSubprojectName, setSelectedSubprojectName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const apiUrl = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await axios.get(`${apiUrl}/project/project-subproject`);
        
        // Handle both paginated and non-paginated responses
        const projectData = res.data.data || res.data;
        
        // Ensure it's an array
        if (Array.isArray(projectData)) {
          setProjects(projectData);
        } else {
          console.error("Expected array but got:", projectData);
          setProjects([]);
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        setProjects([]);
      }
    };
    fetchProjects();
  }, [apiUrl]);

  // Selected project object
  const selectedProject = projects.find((p) => p.name === selectedProjectName);
  const subprojects = selectedProject ? selectedProject.subprojects : [];

  // Build month list
  const months = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseMonths = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ].map((m) => `${m} ${currentYear}`);

    // Add "All Months" at top
    return ["All Months", ...baseMonths];
  }, []);

  // Helpers to get IDs
  const getProjectIdByName = (name) =>
    projects.find((p) => p.name === name)?._id || "";
  const getSubprojectIdByName = (name) =>
    subprojects.find((s) => s.name === name)?._id || "";

  const handleSubmit = async () => {
    if (!selectedProjectName || !selectedSubprojectName || !selectedMonth) {
      alert("Please select all fields.");
      return;
    }

    const payload = {
      project_id: getProjectIdByName(selectedProjectName),
      subproject_id: getSubprojectIdByName(selectedSubprojectName),
      month: selectedMonth,
    };

    try {
      setLoading(true);
      setSubmitMessage("");
      const response = await axios.post(`${apiUrl}/calculator/calculate`, payload);
      setTableData(response.data);

      setSubmitMessage("Submitted successfully!");
    } catch (error) {
      console.error("Submit error:", error);
      setSubmitMessage("Failed to submit.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedProjectName("");
    setSelectedSubprojectName("");
    setSelectedMonth("");
    setSubmitMessage("");
  };

  // Button disable condition
  const isSubmitDisabled =
    !selectedProjectName || !selectedMonth || loading;

  return (
    <div className="max-w-7xl mx-auto px-8 space-y-6 w-full">
      <h2 className="text-lg font-semibold text-gray-900">
        Project Cost Estimation
      </h2>

      <FancyDropdown
        label="Select Project"
        options={projects.map((p) => p.name)}
        value={selectedProjectName}
        onChange={(val) => {
          setSelectedProjectName(val);
          setSelectedSubprojectName("");
        }}
      />

      <FancyDropdown
        label="Select Sub-Project"
        options={subprojects.map((s) => s.name)}
        value={selectedSubprojectName}
        onChange={setSelectedSubprojectName}
      />

      <FancyDropdown
        label="Select Month"
        options={months}
        value={selectedMonth}
        onChange={setSelectedMonth}
      />

      <div className="flex gap-x-4">
        <button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`w-1/2 bg-blue-500 text-white px-4 py-2 rounded-xl transition 
            ${isSubmitDisabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-blue-600"
            }`}
        >
          {loading ? "Calculating..." : "Calculate"}
        </button>

        <button
          onClick={handleReset}
          className="w-1/2 bg-gray-200 text-gray-800 px-4 py-2 rounded-xl hover:bg-gray-300 transition"
        >
          Reset
        </button>
      </div>

      {submitMessage && (
        <div className="text-sm text-gray-900 bg-gray-100 p-3 rounded">
          {submitMessage}
        </div>
      )}
      <div>
        <ProjectCostEstimationTable data={tableData} />
      </div>
    </div>
  );
};

export default ProjectCostEstimation;