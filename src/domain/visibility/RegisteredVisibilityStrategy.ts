import type { VisibilityStrategy, UserContext } from './VisibilityStrategy';

export class RegisteredVisibilityStrategy implements VisibilityStrategy {
  isVisible(user: UserContext): boolean {
    // Si es super admin, tiene bypass automático
    if (user.isSuperAdmin) {
      return true;
    }
    // Es visible si el usuario está registrado (es decir, no es guest y tiene un userId válido)
    return !!user.userId && user.userId !== 'guest';
  }
}
