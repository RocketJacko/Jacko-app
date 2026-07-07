import React, { useState } from "react";

interface ViewSlotProps {
  isActive: boolean;
  children: React.ReactNode;
}

export function ViewSlot({ isActive, children }: ViewSlotProps) {
  // Montamos el slot en el primer render activo; después permanece montado.
  // Inicializamos a false para evitar copiar directamente el prop en useState (Bugs: Prop derived into useState).
  const [hasBeenActivated, setHasBeenActivated] = useState(false);

  const active = isActive || hasBeenActivated;

  if (isActive && !hasBeenActivated) {
    setHasBeenActivated(true);
  }

  // Antes de la primera activación no renderizamos nada.
  // Esto evita cargar chunks lazy de vistas que el usuario nunca visitó.
  if (!active) return null;

  return (
    <div
      className={
        isActive ? "view-slot view-slot--active" : "view-slot view-slot--hidden"
      }
    >
      {children}
    </div>
  );
}
