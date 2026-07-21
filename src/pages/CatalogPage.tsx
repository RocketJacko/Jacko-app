import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { CatalogView } from "../components/views/CatalogView";

export function CatalogPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  if (!session) return null;

  return (
    <CatalogView
      userId={session.user.id}
      onRedeemSuccess={() => {
        // Puede usarse para disparar recargas cruzadas en el futuro si es necesario
      }}
      onNavigateToDashboard={() => navigate("/dashboard")}
    />
  );
}
export default CatalogPage;
