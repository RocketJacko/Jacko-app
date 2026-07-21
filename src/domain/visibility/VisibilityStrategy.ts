export interface UserContext {
  userId?: string;
  isSuperAdmin: boolean;
  subscriptionTier: 'free' | 'mensual' | 'anual';
  isInvited?: boolean;
}

export interface VisibilityStrategy {
  isVisible(user: UserContext): boolean;
}
