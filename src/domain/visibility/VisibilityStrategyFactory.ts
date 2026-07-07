import type { VisibilityStrategy } from './VisibilityStrategy';
import { FreeVisibilityStrategy } from './FreeVisibilityStrategy';

export class VisibilityStrategyFactory {
  static getStrategy(visibility?: string): VisibilityStrategy {
    if (visibility) {
      // Keep signature compatibility
    }
    return new FreeVisibilityStrategy();
  }
}

