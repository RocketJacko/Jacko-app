import type { VisibilityStrategy } from './VisibilityStrategy';
import { FreeVisibilityStrategy } from './FreeVisibilityStrategy';
import { RegisteredVisibilityStrategy } from './RegisteredVisibilityStrategy';

export class VisibilityStrategyFactory {
  static getStrategy(visibility?: string | null): VisibilityStrategy {
    if (visibility === 'registered') {
      return new RegisteredVisibilityStrategy();
    }
    return new FreeVisibilityStrategy();
  }
}

