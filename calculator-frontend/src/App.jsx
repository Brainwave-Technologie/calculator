import { BrowserRouter } from 'react-router-dom'
import './App.css'
import AppRoutes from './AppRoutes'
import '@fontsource/inter'; // Defaults to weight 400
import { Toaster } from 'react-hot-toast';
import { fetchProjectsWithSubProjects } from './services/projectService';
import { useEffect } from 'react';



function App() {

  // useEffect(() => {
  //   fetchProjectsWithSubProjects();
  //
  // }, []);
  //
  return (
    <BrowserRouter>
      <Toaster position="top-right" reverseOrder={false} />

      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
