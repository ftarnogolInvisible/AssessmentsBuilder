import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Disable React StrictMode to prevent double renders that might cause issues
ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);

