export interface UserContext {
  userId?: string;
  isSuperAdmin: boolean;
  subscriptionTier: 'free' | 'mensual' | 'anual';
}

export interface VisibilityStrategy {
  isVisible(user: UserContext): boolean;
}
