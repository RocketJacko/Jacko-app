export interface UserContext {
  isSuperAdmin: boolean;
  subscriptionTier: 'free' | 'mensual' | 'anual';
}

export interface VisibilityStrategy {
  isVisible(user: UserContext): boolean;
}
