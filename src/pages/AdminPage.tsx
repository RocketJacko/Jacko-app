import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AdminDashboardView } from "../components/views/AdminDashboardView";

export function AdminPage() {
  const { session, isSuperAdmin } = useAuth();
  const navigate = useNavigate();

  if (!session) return null;

  return (
    <AdminDashboardView
      userId={session.user.id}
      userEmail={session.user.email || ""}
      isSuperAdmin={isSuperAdmin}
      onNavigate={(view) => {
        if (view === "landing") {
          navigate("/");
        } else {
          navigate(`/${view}`);
        }
      }}
    />
  );
}
export default AdminPage;
