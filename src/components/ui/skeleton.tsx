import type { HTMLAttributes, CSSProperties } from 'react';
import './skeleton.css';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  borderRadius,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const customStyle: CSSProperties = {
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(borderRadius !== undefined && { borderRadius }),
    ...style,
  };

  const variantClass = `skeleton-${variant}`;

  return (
    <div
      className={`skeleton-base ${variantClass} ${className}`.trim()}
      style={customStyle}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * Esqueleto prediseñado para la tarjeta de producto en el catálogo.
 */
export function ProductCardSkeleton() {
  return (
    <div className="product-card product-card-skeleton">
      <Skeleton variant="rectangular" className="skeleton-thumb" />
      <Skeleton variant="text" className="skeleton-title" />
      <Skeleton variant="text" className="skeleton-subtitle" />
      <Skeleton variant="rectangular" className="skeleton-button" />
    </div>
  );
}

/**
 * Esqueleto prediseñado para las filas de tablas de historial o datos.
 */
export function TableRowSkeleton() {
  return (
    <div className="table-row-skeleton">
      <Skeleton variant="circular" width={28} height={28} />
      <div style={{ flex: 1 }}>
        <Skeleton variant="text" width="60%" height={16} />
        <Skeleton variant="text" width="40%" height={12} />
      </div>
      <Skeleton variant="rectangular" width={80} height={24} />
    </div>
  );
}
