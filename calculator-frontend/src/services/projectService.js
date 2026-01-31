import api from "../api";

export const createProject = async (projectName, projectPrice, isVisible, desc) => {
  const response = await api.post("/project", { name: projectName, projectPrice, visibility: isVisible, description: desc });
  return {
    data: response.data,
    status: response.status
  };
};

export const createSubProject = async (subProjectName, subProjectPrice, parentProjectId, desc) => {
  const response = await api.post("/project/sub-project", { name: subProjectName, subProjectPrice, project_id: parentProjectId, description: desc });
  // console.log("This is the parentprojectId", parentProjectId);
  return {
    data: response.data,
    status: response.status
  };
};


export const fetchProjects = async () => {
  const response = await api.get("/project");
  return {
    data: response.data,
    status: response.status
  };
};

export const fetchProjectsWithSubProjects = async (page = 1, limit = 10) => {
  const response = await api.get("/project/project-subproject", {
    params: { page, limit }
  });

  return {
    data: response.data.data,
    pagination: response.data.pagination,
    status: response.status
  };
};

export const deleteProject = async (projectId) => {
  const response = await api.delete(`/project/${projectId}`);
  // console.log("thi is the log of the response: ", response.data);

  return {
    data: response.data,
    status: response.status
  };
};

export const deleteSubProject = async (subProjectId) => {
  const response = await api.delete(`/project/subproject/${subProjectId}`);
  // console.log("thi is the log of the response: ", response.data);

  return {
    data: response.data,
    status: response.status
  };
};

export const updateProject = async (projectId, body) => {
  const response = await api.put(`/project/${projectId}`, body);
  // console.log("thi is the log of the response: ", response.data);

  return {
    data: response.data,
    status: response.status
  };
};

export const updateSubProject = async (subProjectId, body) => {
  const response = await api.put(`/project/subproject/${subProjectId}`, body);
  return {
    data: response.data,
    status: response.status
  };
};

