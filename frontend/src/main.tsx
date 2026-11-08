import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import { SessionProvider } from "./app/providers/SessionProvider";
import { ToastProvider } from "./app/providers/ToastProvider";
import { AppRouter } from "./app/router/AppRouter";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SessionProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </SessionProvider>
  </StrictMode>,
);
