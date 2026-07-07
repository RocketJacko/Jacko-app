import { Coins, ShoppingBag, ArrowRight, HelpCircle } from "lucide-react";
import type { Profile } from "./types";
interface DashboardStatsProps {
  profile: Profile | null;
  ordersCount: number;
  onNavigateToCatalog: () => void;
}
export function DashboardStats({
  profile,
  ordersCount,
  onNavigateToCatalog,
}: DashboardStatsProps) {
  const points = profile?.points ?? 0;
  return (
    <div>
      {" "}
      <div>
        {" "}
        <div>
          {" "}
          <span>PUNTOS DISPONIBLES</span> <Coins size={24} />{" "}
        </div>{" "}
        <h3>
          {" "}
          {points.toLocaleString("es-CO")} <span>PTS</span>{" "}
        </h3>{" "}
        <button type="button" onClick={onNavigateToCatalog}>
          {" "}
          Canjear Puntos <ArrowRight size={14} />{" "}
        </button>{" "}
      </div>{" "}
      <div>
        {" "}
        <div>
          {" "}
          <span>SERVICIOS ADQUIRIDOS</span> <ShoppingBag size={24} />{" "}
        </div>{" "}
        <h3>
          {" "}
          {ordersCount}{" "}
          <span>{ordersCount === 1 ? "ORDEN" : "ÓRDENES"}</span>{" "}
        </h3>{" "}
        <p style={{ marginTop: "12px", fontSize: "0.85rem", opacity: 0.8 }}>
          {" "}
          Ver detalles y accesos en la pestaña Historial{" "}
        </p>{" "}
      </div>{" "}
      <div>
        {" "}
        <div>
          {" "}
          <span>SOPORTE TÉCNICO</span> <HelpCircle size={24} />{" "}
        </div>{" "}
        <h3> Garantizado </h3>{" "}
        <div style={{ fontSize: "0.8rem", opacity: 0.8 }}>
          {" "}
          Soporte 24/7 para tus activaciones y credenciales{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}
