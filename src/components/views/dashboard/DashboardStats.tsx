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
    <div className="dashboard-stats-grid">
      {/* Puntos Disponibles */}
      <div className="dashboard-stat-card">
        <div className="stat-card-header">
          <span className="stat-card-title">Puntos Disponibles</span>
          <Coins className="stat-card-icon" size={20} />
        </div>
        <h3 className="stat-card-value">
          {points.toLocaleString("es-CO")}{" "}
          <span className="stat-card-unit">PTS</span>
        </h3>
        <button type="button" className="btn-stat-action" onClick={onNavigateToCatalog}>
          Canjear Puntos <ArrowRight size={14} className="btn-stat-arrow" />
        </button>
      </div>

      {/* Servicios Adquiridos */}
      <div className="dashboard-stat-card">
        <div className="stat-card-header">
          <span className="stat-card-title">Servicios Adquiridos</span>
          <ShoppingBag className="stat-card-icon" size={20} />
        </div>
        <h3 className="stat-card-value">
          {ordersCount}{" "}
          <span className="stat-card-unit">
            {ordersCount === 1 ? "ORDEN" : "ÓRDENES"}
          </span>
        </h3>
        <p className="stat-card-desc">
          Ver detalles y accesos en la pestaña Historial.
        </p>
      </div>

      {/* Soporte Técnico */}
      <div className="dashboard-stat-card">
        <div className="stat-card-header">
          <span className="stat-card-title">Acompañamiento</span>
          <HelpCircle className="stat-card-icon" size={20} />
        </div>
        <h3 className="stat-card-value text-success">Garantizado</h3>
        <p className="stat-card-desc">
          Soporte 24/7 para tus activaciones y credenciales.
        </p>
      </div>
    </div>
  );
}
