import { Brain, Sparkles, X } from 'lucide-react';

interface OnboardingHintProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    title: 'Crie uma ideia central',
    text: 'Digite um problema, meta ou projeto que quer organizar.'
  },
  {
    title: 'Conecte os balões',
    text: 'Ligue ideias relacionadas para formar seu mapa.'
  },
  {
    title: 'Use a IA',
    text: 'Peça causas, riscos ou próximos passos a partir de qualquer balão.'
  }
];

export function OnboardingHint({
  isOpen,
  onClose
}: OnboardingHintProps) {
  if (!isOpen) return null;

  return (
    <aside className="onboarding-hint" aria-label="Como usar o Synapse IA">
      <div className="onboarding-hint__card">
        <button
          type="button"
          className="onboarding-hint__close"
          onClick={onClose}
          aria-label="Fechar tutorial"
        >
          <X size={16} />
        </button>

        <div className="onboarding-hint__header">
          <span className="onboarding-hint__icon" aria-hidden="true">
            <Brain size={18} />
          </span>
          <div className="onboarding-hint__title-wrap">
            <span className="onboarding-hint__eyebrow">
              <Sparkles size={12} />
              Primeiros passos
            </span>
            <h2>Como usar o Synapse IA</h2>
          </div>
        </div>

        <ol className="onboarding-hint__steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="onboarding-hint__step">
              <span className="onboarding-hint__step-number">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="onboarding-hint__footer">
          <button
            type="button"
            className="onboarding-hint__primary"
            onClick={onClose}
          >
            Começar agora
          </button>
        </div>
      </div>
    </aside>
  );
}
