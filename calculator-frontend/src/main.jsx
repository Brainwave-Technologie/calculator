import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// import { ApolloProvider } from '@apollo/client/react';
// import { client } from './apolloClient.js';
createRoot(document.getElementById('root')).render(
//  <ApolloProvider client={client}>
    <App />
  // </ApolloProvider>
  
)
