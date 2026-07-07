import type { VisibilityStrategy, UserContext } from './VisibilityStrategy';

export class FreeVisibilityStrategy implements VisibilityStrategy {
  isVisible(user?: UserContext): boolean {
    // Free products are visible to all users (and visitors)
    return !!user || true;
  }
}
