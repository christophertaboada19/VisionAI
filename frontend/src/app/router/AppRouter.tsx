import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { useSession } from "@/app/providers/SessionProvider";
import { AppShell } from "@/app/layout/AppShell";
import type { Role } from "@/core/domain/entities";
import { LoginPage } from "@/modules/auth/pages/LoginPage";
import { DashboardPage } from "@/modules/dashboard/pages/DashboardPage";
import { ActivityPage } from "@/modules/dashboard/pages/ActivityPage";
import { AnalysisPage } from "@/modules/analysis/pages/AnalysisPage";
import { AnalysisResultPage } from "@/modules/analysis/pages/AnalysisResultPage";
import { LivePage } from "@/modules/analysis/pages/LivePage";
import { ScenarioGalleryPage } from "@/modules/scenarios/pages/ScenarioGalleryPage";
import { VisionExplorerPage } from "@/modules/vision/pages/VisionExplorerPage";
import { AlertsPage } from "@/modules/alerts/pages/AlertsPage";
import { HistoryPage } from "@/modules/history/pages/HistoryPage";
import { ExportsPage } from "@/modules/history/pages/ExportsPage";
import { RulesPage } from "@/modules/patterns/pages/RulesPage";
import { ClassesPage } from "@/modules/settings/pages/ClassesPage";
import { UsersPage } from "@/modules/settings/pages/UsersPage";
import { SettingsPage } from "@/modules/settings/pages/SettingsPage";
import { NotFoundPage } from "@/modules/settings/pages/NotFoundPage";

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user } = useSession();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const admin = (el: ReactNode) => <RequireAuth roles={["admin"]}>{el}</RequireAuth>;

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "actividad", element: <ActivityPage /> },
      { path: "analisis", element: <AnalysisPage /> },
      { path: "analisis/escenarios", element: <ScenarioGalleryPage /> },
      { path: "analisis/en-vivo", element: <LivePage /> },
      { path: "analisis/:id", element: <AnalysisResultPage /> },
      { path: "vision/detecciones", element: <VisionExplorerPage kind="detections" /> },
      { path: "vision/segmentacion", element: <VisionExplorerPage kind="masks" /> },
      { path: "vision/patrones", element: <VisionExplorerPage kind="patterns" /> },
      { path: "operaciones/alertas", element: <AlertsPage /> },
      { path: "operaciones/historial", element: <HistoryPage /> },
      { path: "operaciones/exportaciones", element: <ExportsPage /> },
      { path: "admin/escenarios", element: admin(<ScenarioGalleryPage admin />) },
      { path: "admin/clases", element: admin(<ClassesPage />) },
      { path: "admin/reglas", element: admin(<RulesPage />) },
      { path: "admin/usuarios", element: admin(<UsersPage />) },
      { path: "admin/configuracion", element: admin(<SettingsPage />) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export const AppRouter = () => <RouterProvider router={router} />;
