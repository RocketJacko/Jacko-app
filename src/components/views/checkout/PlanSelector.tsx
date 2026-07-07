import type { PricingPlan } from './types';

interface PlanSelectorProps {
  plans: PricingPlan[];
  selectedPlan: PricingPlan | null;
  onSelectPlan: (plan: PricingPlan) => void;
}

export function PlanSelector({ plans, selectedPlan, onSelectPlan }: PlanSelectorProps) {
  if (!plans || plans.length === 0) return null;

  return (
    <div className="checkout-plans-selector-tabs">
      {plans.map((plan) => {
        const isSelected = selectedPlan?.id === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            className={`checkout-plan-tab${isSelected ? ' active' : ''}`}
            onClick={() => onSelectPlan(plan)}
          >
            <span className="plan-tab-name">{plan.name}</span>
            <span className="plan-tab-desc">{plan.short_description}</span>
          </button>
        );
      })}
    </div>
  );
}