import { useState, useCallback, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { Brain, UserCircle, LayoutGrid, Activity, Folder, Settings, Sparkles, HelpCircle } from 'lucide-react';
import { BrainstormBoard, resetAnimatedConnections, BALLOON_W, BALLOON_H } from './components/BrainstormBoard';
import { CanvasToolbar, type ExportBackgroundMode } from './components/CanvasToolbar';
import { InputBar } from './components/InputBar';
import { StatisticsModal } from './components/StatisticsModal';
import { ProjectsModal } from './components/ProjectsModal';
import { SettingsModal } from './components/SettingsModal';
import { PlansModal } from './components/PlansModal';
import { OnboardingHint } from './components/OnboardingHint';
import { pedirSugestaoIA, AiRequestError, type AiMode, type AiRateLimitInfo } from './lib/ia';
import {
  BillingRequestError,
  createSafeBillingStatus,
  createCheckoutSession,
  createCustomerPortal,
  fetchBillingStatus,
  normalizeBillingStatus,
  type BillingLoadState,
  type BillingStatus
} from '../lib/billing';
import type { PaidPlanId } from '../lib/plans';

const ESPACO_BORDA_TELA = 20;
const CARTESIAN_GUIDE_STORAGE_KEY = 'synapse:cartesianGuideVisible';
const APP_THEME_STORAGE_KEY = 'synapse:appTheme';
const APP_THEME = 'mars-enterprise';

type EnterpriseIntegration = {
  title: string;
  description: string;
  Icon: typeof Sparkles;
};

const ENTERPRISE_INTEGRATIONS: EnterpriseIntegration[] = [
  {
    title: 'Okta SSO',
    description: 'Login corporativo preparado para identidade enterprise.',
    Icon: UserCircle
  },
  {
    title: 'Power Apps',
    description: 'Conexoes planejadas com fluxos internos e formularios.',
    Icon: LayoutGrid
  },
  {
    title: 'Power BI',
    description: 'Dados prontos para dashboards e leitura operacional.',
    Icon: Activity
  },
  {
    title: 'Governanca',
    description: 'Auditoria, seguranca e politicas para uso corporativo.',
    Icon: Settings
  },
  {
    title: 'IA operacional',
    description: 'Automacoes assistidas para transformar ideias em acoes.',
    Icon: Sparkles
  }
];

function getInitialCartesianGuideVisibility() {
  if (typeof window === 'undefined') return true;

  try {
    return window.localStorage.getItem(CARTESIAN_GUIDE_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function waitForExportPaint() {
  return new Promise<void>(resolve => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function createExportBrandingNode() {
  const branding = document.createElement('div');
  branding.className = 'synapse-export-branding';
  branding.setAttribute('data-synapse-export-branding', 'true');

  const title = document.createElement('strong');
  title.textContent = 'Synapse IA ';

  const emoji = document.createElement('span');
  emoji.textContent = '\u{1F9E0}';
  title.appendChild(emoji);

  const site = document.createElement('span');
  site.textContent = 'synapse.onexustech.com';

  branding.append(title, site);
  return branding;
}


export interface Project {
  id: string;
  name: string;
  description: string;
}

export interface Idea {
  id: string;
  text: string;
  category: string;
  position: { x: number; y: number };
  connections: string[];
  isCentral: boolean;
  width: number;
  height: number;
  aiGenerated?: boolean;
  projectId: string;
  categoryColor?: string;
}

type PendingIdeasSave = {
  ideas: Idea[];
  projectId: string;
};

type AiUsageView = {
  limit: number;
  remaining: number;
  resetAt: number;
  msUntilReset: number;
  isLocked: boolean;
};

type PostLoginLoadingScreenProps = {
  billingReady: boolean;
  projectsReady: boolean;
  canvasReady: boolean;
  message: string;
};

function PostLoginLoadingScreen({
  billingReady,
  projectsReady,
  canvasReady,
  message
}: PostLoginLoadingScreenProps) {
  const steps = [
    { label: 'Plano e limites', done: billingReady, active: !billingReady },
    { label: 'Projetos', done: projectsReady, active: billingReady && !projectsReady },
    { label: 'Canvas', done: canvasReady, active: billingReady && projectsReady && !canvasReady }
  ];

  return (
    <div className="app-loading-screen" role="status" aria-live="polite" aria-busy="true">
      <section className="app-loading-card" aria-label="Carregando dados do Synapse IA">
        <div className="app-loading-orb" aria-hidden="true">
          <Brain size={34} />
        </div>

        <div className="app-loading-copy">
          <span className="app-loading-eyebrow">
            <Sparkles size={13} />
            Sincronizando Synapse IA
          </span>
          <h1>Preparando seu mapa neural</h1>
          <p>{message}</p>
        </div>

        <div className="app-loading-progress" aria-hidden="true" />

        <ol className="app-loading-steps" aria-label="Etapas de carregamento">
          {steps.map(step => (
            <li
              key={step.label}
              className={`app-loading-step ${step.done ? 'is-done' : ''} ${step.active ? 'is-active' : ''}`}
            >
              <span className="app-loading-step-dot" />
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function getAiUsageView(status: BillingStatus | null, now = Date.now()): AiUsageView {
  if (!status) {
    return {
      limit: 0,
      remaining: 0,
      resetAt: 0,
      msUntilReset: 0,
      isLocked: true
    };
  }

  const usage = (status as Partial<BillingStatus>).usage;
  const resetAt = Number(usage?.resetAt || 0);
  const limit = Number(usage?.limit || 0);
  const resetPassed = resetAt > 0 && resetAt <= now;
  const remaining = resetPassed ? limit : Number(usage?.remaining || 0);

  return {
    limit,
    remaining: Math.max(0, remaining),
    resetAt,
    msUntilReset: Math.max(0, resetAt - now),
    isLocked: !status.hasActivePlan || limit <= 0
  };
}

function formatAiResetTime(ms: number) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const visibleMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(visibleMinutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

function AiQuotaButton({ usage, onOpenPlans }: { usage: AiUsageView; onOpenPlans: () => void }) {
  const isLocked = usage.isLocked;
  const isEmpty = !isLocked && usage.remaining === 0;
  const resetLabel = formatAiResetTime(usage.msUntilReset);
  const limitLabel = usage.limit > 0 ? `${usage.remaining}/${usage.limit}` : '--';
  const statusLabel = isLocked ? 'plano' : isEmpty ? resetLabel : 'hoje';

  return (
    <button
      type="button"
      onClick={onOpenPlans}
      className={`ai-quota-pill ${isLocked ? 'is-locked' : ''} ${isEmpty ? 'is-empty' : ''}`}
      title={isLocked ? 'Plano necessario para usar IA.' : isEmpty ? `Limite de IA atingido. Libera em ${resetLabel}.` : 'Uso diario de IA.'}
      aria-label={`Uso de IA: ${limitLabel} disponiveis`}
    >
      <span className="ai-quota-icon">
        <Sparkles size={16} />
      </span>
      <span className="ai-quota-main">
        <span className="ai-quota-label">IA diária</span>
        <strong>{limitLabel}</strong>
      </span>
      <span className="ai-quota-reset">{statusLabel}</span>
    </button>
  );
}

function getCheckoutSessionIdFromUrl() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('session_id');
}

function clearBillingReturnParams() {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has('billing') && !url.searchParams.has('session_id')) return;

  url.searchParams.delete('billing');
  url.searchParams.delete('session_id');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

type RefreshBillingOptions = {
  showLoading?: boolean;
  checkoutSessionId?: string | null;
};

const CATEGORIES = [
  { name: 'Problema', color: '#dc2626', bgColor: '#fee2e2' },
  { name: 'Solução', color: '#10bfa3', bgColor: '#ccfbf1' },
  { name: 'Recurso', color: '#0617a8', bgColor: '#e0e7ff' },
  { name: 'Objetivo', color: '#1d4ed8', bgColor: '#dbeafe' },
  { name: 'Risco', color: '#0f766e', bgColor: '#ccfbf1' }
];

function getInitialAiBalloonSize(text: string) {
  const length = text.trim().length;
  const width = Math.max(318, Math.min(440, 318 + length * 1.9));
  const height = Math.max(190, Math.min(270, 176 + Math.ceil(length / 54) * 30));

  return {
    width: Math.round(width),
    height: Math.round(height)
  };
}

function categorizeIdea(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('problema') || t.includes('desafio') || t.includes('dificuldade') || t.includes('causa')) return 'Problema';
  if (t.includes('solução') || t.includes('resolver') || t.includes('implementar') || t.includes('passo')) return 'Solução';
  if (t.includes('recurso') || t.includes('ferramenta') || t.includes('material')) return 'Recurso';
  if (t.includes('objetivo') || t.includes('meta') || t.includes('alcançar')) return 'Objetivo';
  if (t.includes('risco') || t.includes('ameaça') || t.includes('perigo')) return 'Risco';
  return 'Outro';
}


export default function App() {
  const [isDemoSignedIn, setIsDemoSignedIn] = useState(false);
  const isLoaded = true;
  const isSignedIn = isDemoSignedIn;
  const getToken = useCallback(async () => 'demo-token', []);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [saveTimeout, setSaveTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(() => createSafeBillingStatus());
  const [billingLoadState, setBillingLoadState] = useState<BillingLoadState>('idle');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingTick, setBillingTick] = useState(Date.now());
  const [hasLoadedInitialBilling, setHasLoadedInitialBilling] = useState(false);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [hasLoadedInitialIdeas, setHasLoadedInitialIdeas] = useState(false);
  const [hasCompletedPostLoginLoad, setHasCompletedPostLoginLoad] = useState(false);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [activeNav, setActiveNav] = useState('grid');
  const [isOnboardingHintOpen, setIsOnboardingHintOpen] = useState(false);
  const deletedIdeaIdsRef = useRef<Set<string>>(new Set());
  const saveInFlightRef = useRef(false);
  const pendingIdeasSaveRef = useRef<PendingIdeasSave | null>(null);
  const aiUsageView = getAiUsageView(billingStatus, billingTick);
  const shouldShowOnboardingHint = Boolean(
    isSignedIn &&
    !isPlansModalOpen &&
    isOnboardingHintOpen
  );
  const postLoginLoadingMessage = !hasLoadedInitialBilling
    ? 'Validando plano, limites e uso de IA...'
    : !hasLoadedProjects
      ? 'Sincronizando seus projetos...'
      : !hasLoadedInitialIdeas
        ? 'Carregando ideias e conexões do canvas...'
        : 'Finalizando interface...';
  const isPostLoginLoading = Boolean(isSignedIn && !hasCompletedPostLoginLoad);

  useEffect(() => {
    const timer = window.setInterval(() => setBillingTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appTheme = APP_THEME;

    try {
      window.localStorage.setItem(APP_THEME_STORAGE_KEY, APP_THEME);
    } catch {
      // Keep the in-session theme even if localStorage is unavailable.
    }
  }, []);

  const createAuthHeaders = useCallback(async (headers?: HeadersInit) => {
    const token = await getToken();
    if (!token) {
      throw new Error('Sessao de autenticacao indisponivel');
    }

    const authHeaders = new Headers(headers);
    authHeaders.set('Authorization', `Bearer ${token}`);
    return authHeaders;
  }, [getToken]);

  const refreshBillingStatus = useCallback(async (options: RefreshBillingOptions = {}) => {
    if (!isSignedIn) {
      const fallback = createSafeBillingStatus();
      setBillingStatus(fallback);
      setBillingLoadState('idle');
      setBillingError(null);
      return fallback;
    }

    if (options.showLoading) {
      setBillingLoadState('loading');
      setBillingError(null);
    }

    try {
      const headers = await createAuthHeaders();
      const status = await fetchBillingStatus(headers, {
        checkoutSessionId: options.checkoutSessionId
      });
      setBillingStatus(status);
      setBillingLoadState('success');
      setBillingError(null);
      return status;
    } catch (error) {
      console.error('Erro ao carregar billing:', error);
      const fallback = error instanceof BillingRequestError && error.billing
        ? error.billing
        : createSafeBillingStatus();
      setBillingStatus(fallback);
      setBillingLoadState('error');
      setBillingError(error instanceof Error ? error.message : 'Nao foi possivel carregar billing');
      return fallback;
    }
  }, [createAuthHeaders, isSignedIn]);

  const openPlansModal = useCallback(() => {
    setIsPlansModalOpen(true);
  }, []);

  const openOnboardingHint = useCallback(() => {
    setIsOnboardingHintOpen(true);
  }, []);

  const closeOnboardingHint = useCallback(() => {
    setIsOnboardingHintOpen(false);
  }, []);

  const syncBillingUsageFromRateLimit = useCallback((rateLimit?: AiRateLimitInfo) => {
    if (!rateLimit) return;

    setBillingStatus(prev => {
      return {
        ...prev,
        usage: {
          ...prev.usage,
          limit: rateLimit.limit,
          remaining: rateLimit.remaining,
          count: Math.max(0, rateLimit.limit - rateLimit.remaining),
          resetAt: rateLimit.resetAt
        }
      };
    });
  }, []);

  const handleBillingError = useCallback((error: unknown) => {
    if (error instanceof BillingRequestError && error.billing) {
      setBillingStatus(error.billing);
    }
    setBillingLoadState('error');
    setBillingError(error instanceof Error ? error.message : 'Nao foi possivel processar billing');

    openPlansModal();
  }, [openPlansModal]);

  const handleSelectPlan = useCallback(async (plan: PaidPlanId) => {
    try {
      setBillingActionLoading(true);
      const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
      const url = await createCheckoutSession(plan, headers);
      window.location.assign(url);
    } catch (error) {
      console.error('Erro ao iniciar checkout:', error);
      handleBillingError(error);
    } finally {
      setBillingActionLoading(false);
    }
  }, [createAuthHeaders, handleBillingError]);

  const handleManageSubscription = useCallback(async () => {
    try {
      setBillingActionLoading(true);
      const headers = await createAuthHeaders();
      const url = await createCustomerPortal(headers);
      window.location.assign(url);
    } catch (error) {
      console.error('Erro ao abrir portal:', error);
      handleBillingError(error);
    } finally {
      setBillingActionLoading(false);
    }
  }, [createAuthHeaders, handleBillingError]);

  useEffect(() => {
    if (!isSignedIn) {
      setBillingStatus(createSafeBillingStatus());
      setBillingLoadState('idle');
      setBillingError(null);
      setHasLoadedInitialBilling(false);
      setHasCompletedPostLoginLoad(false);
      return;
    }

    setHasLoadedInitialBilling(false);
    setHasCompletedPostLoginLoad(false);
    let isCurrent = true;

    const params = new URLSearchParams(window.location.search);
    const hasBillingReturn = params.has('billing') || params.has('session_id');

    void refreshBillingStatus({
      showLoading: true,
      checkoutSessionId: getCheckoutSessionIdFromUrl()
    }).then((status) => {
      if (hasBillingReturn && status.subscriptionStatus !== 'unavailable') {
        clearBillingReturnParams();
      }
    }).finally(() => {
      if (isCurrent) {
        setHasLoadedInitialBilling(true);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isSignedIn, refreshBillingStatus]);

  useEffect(() => {
    if (!isSignedIn || (activeNav !== 'settings' && !isPlansModalOpen)) return;

    void refreshBillingStatus({ showLoading: true });
  }, [activeNav, isPlansModalOpen, isSignedIn, refreshBillingStatus]);

  // 1. Carregar projetos do Neon ao entrar
  useEffect(() => {
    if (!isSignedIn) {
      setProjects([]);
      setActiveProjectId(null);
      setIdeas([]);
      setHasLoadedProjects(false);
      setHasLoadedInitialIdeas(false);
      return;
    }

    let isCurrent = true;

    const loadProjects = async () => {
      setHasLoadedProjects(false);
      setHasLoadedInitialIdeas(false);
      try {
        const headers = await createAuthHeaders();
        const res = await fetch('/api/get-projects', { headers });
        const data = res.ok ? await res.json() : [];
        const projArray = Array.isArray(data) ? data : [];
        if (!isCurrent) return;

        setProjects(projArray);
        if (projArray.length > 0) {
          setActiveProjectId(projArray[0].id);
        } else {
          setActiveProjectId(null);
          setIdeas([]);
          setHasLoadedInitialIdeas(true);
        }
      } catch (e) {
        if (!isCurrent) return;
        console.error('Erro ao buscar projetos:', e);
        setProjects([]);
        setActiveProjectId(null);
        setIdeas([]);
        setHasLoadedInitialIdeas(true);
      } finally {
        if (isCurrent) {
          setHasLoadedProjects(true);
        }
      }
    };

    void loadProjects();

    return () => {
      isCurrent = false;
    };
  }, [createAuthHeaders, isSignedIn]);

  // 2. Carregar ideias do Neon ao entrar ou trocar de projeto
  useEffect(() => {
    if (!isSignedIn) {
      setLoadingIdeas(false);
      setHasLoadedInitialIdeas(false);
      return;
    }

    if (!activeProjectId) {
      if (hasLoadedProjects) {
        setHasLoadedInitialIdeas(true);
      }
      return;
    }

    let isCurrent = true;

    const loadIdeas = async () => {
      setLoadingIdeas(true);
      setHasLoadedInitialIdeas(false);
      try {
        const headers = await createAuthHeaders();
        const res = await fetch(`/api/get-ideas?projectId=${encodeURIComponent(activeProjectId)}`, {
          headers
        });
        const data = res.ok ? await res.json() : [];
        if (!isCurrent) return;
        setIdeas(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!isCurrent) return;
        console.error('Erro ao buscar ideias:', e);
      } finally {
        if (isCurrent) {
          setLoadingIdeas(false);
          setHasLoadedInitialIdeas(true);
        }
      }
    };

    void loadIdeas();

    return () => {
      isCurrent = false;
    };
  }, [activeProjectId, createAuthHeaders, hasLoadedProjects, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || hasCompletedPostLoginLoad) return;

    if (hasLoadedInitialBilling && hasLoadedProjects && hasLoadedInitialIdeas) {
      setHasCompletedPostLoginLoad(true);
    }
  }, [
    hasCompletedPostLoginLoad,
    hasLoadedInitialBilling,
    hasLoadedInitialIdeas,
    hasLoadedProjects,
    isSignedIn
  ]);

  // Salvar ideias no Neon sempre que mudar
  const persistIdeas = useCallback((nextIdeas: Idea[], currentProjectId: string) => {
    if (!isSignedIn || !currentProjectId) return;

    pendingIdeasSaveRef.current = { ideas: nextIdeas, projectId: currentProjectId };

    const flushSaveQueue = async () => {
      if (saveInFlightRef.current) return;

      saveInFlightRef.current = true;
      try {
        while (pendingIdeasSaveRef.current) {
          const pendingSave = pendingIdeasSaveRef.current;
          pendingIdeasSaveRef.current = null;

          const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
          const deletedIdeaIds = Array.from(deletedIdeaIdsRef.current);
          const res = await fetch('/api/save-ideas', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              projectId: pendingSave.projectId,
              ideas: pendingSave.ideas,
              deletedIdeaIds
            })
          });

          if (!res.ok) {
            if (res.status === 402) {
              const data = await res.json().catch(() => ({}));
              if (data.billing) setBillingStatus(normalizeBillingStatus(data.billing));
              openPlansModal();
            }
            throw new Error('Falha ao salvar ideias');
          }

          deletedIdeaIds.forEach(id => deletedIdeaIdsRef.current.delete(id));
        }
      } catch (e) {
        console.error('Erro ao salvar ideias:', e);
      } finally {
        saveInFlightRef.current = false;
        if (pendingIdeasSaveRef.current) {
          void flushSaveQueue();
        }
      }
    };

    void flushSaveQueue();
  }, [createAuthHeaders, isSignedIn, openPlansModal]);

  // Debounce para salvar
  useEffect(() => {
    if (!isSignedIn || loadingIdeas || !activeProjectId) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    const timeout = setTimeout(() => persistIdeas(ideas, activeProjectId), 800);
    setSaveTimeout(timeout);
    return () => clearTimeout(timeout);
  }, [ideas, isSignedIn, loadingIdeas, activeProjectId, persistIdeas]);

  const handleCreateProject = async (name: string, description: string) => {
    if (!isSignedIn) return;
    try {
      const currentBilling = billingLoadState === 'success'
        ? billingStatus
        : await refreshBillingStatus({ showLoading: true });
      if (!currentBilling?.hasActivePlan) {
        openPlansModal();
        return;
      }

      const projectLimit = currentBilling.limits?.projectLimit;
      if (typeof projectLimit === 'number' && projects.length >= projectLimit) {
        openPlansModal();
        return;
      }

      const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/save-project', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, description })
      });
      if (res.ok) {
        const data = await res.json();
        const newProj = { id: data.id, name, description };
        setProjects(prev => [...prev, newProj]);
        setActiveProjectId(data.id);
        setActiveNav('grid');
      } else if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        if (data.billing) setBillingStatus(normalizeBillingStatus(data.billing));
        openPlansModal();
      }
    } catch (e) {
      console.error('Erro ao criar projeto', e);
    }
  };

  const handleUpdateProject = async (id: string, name: string, description: string) => {
    if (!isSignedIn) return;
    try {
      const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/save-project', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, name, description })
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name, description } : p));
      }
    } catch (e) {
      console.error('Erro ao atualizar projeto', e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!isSignedIn) return;

    try {
      const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/delete-project', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ projectId: id })
      });

      if (!res.ok) {
        throw new Error('Falha ao excluir projeto');
      }

      setProjects(prev => {
        const nextProjects = prev.filter(project => project.id !== id);
        if (activeProjectId === id) {
          const nextActiveProjectId = nextProjects[0]?.id || null;
          setActiveProjectId(nextActiveProjectId);
          if (!nextActiveProjectId) setIdeas([]);
        }
        return nextProjects;
      });
    } catch (e) {
      console.error('Erro ao excluir projeto', e);
      alert('Nao foi possivel excluir o workspace agora.');
    }
  };


  // ...restante do componente, UI, etc...


  // -- Visual UI Logic (Existing) --
  const [recentColors, setRecentColors] = useState<string[]>(['#0617a8', '#10bfa3', '#1d4ed8', '#0f766e', '#dc2626']);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingLine, setConnectingLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [connectionFlash, setConnectionFlash] = useState<{ from: string; to: string } | null>(null);
  const [aiProcessingId, setAiProcessingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showCartesianGuide, setShowCartesianGuide] = useState(getInitialCartesianGuideVisibility);

  const boardRef = useRef<HTMLDivElement>(null);
  const hasCenteredInitialOriginRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      hasCenteredInitialOriginRef.current = false;
      return;
    }

    if (!hasCompletedPostLoginLoad || hasCenteredInitialOriginRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;

      setPanX(rect.width / 2);
      setPanY(rect.height / 2);
      hasCenteredInitialOriginRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasCompletedPostLoginLoad, isSignedIn]);

  const toggleCartesianGuide = useCallback(() => {
    setShowCartesianGuide(prev => {
      const next = !prev;

      try {
        window.localStorage.setItem(CARTESIAN_GUIDE_STORAGE_KEY, String(next));
      } catch {
        // Keep the in-session toggle even if localStorage is unavailable.
      }

      return next;
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + 0.1, 2.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev - 0.1, 0.3));
  }, []);

  const resetCanvasView = useCallback(() => {
    const rect = boardRef.current?.getBoundingClientRect();

    setZoom(1);
    setPanX(rect ? rect.width / 2 : 0);
    setPanY(rect ? rect.height / 2 : 0);
  }, []);

  const handleExportCanvas = useCallback(async (background: ExportBackgroundMode) => {
    const canvas = boardRef.current?.querySelector<HTMLElement>('.synapse-canvas-root');
    if (!canvas) return;

    const backgroundClass = `synapse-export-bg-${background}`;
    const shouldIncludeBranding = billingStatus.plan !== 'pro';
    const branding = shouldIncludeBranding ? createExportBrandingNode() : null;
    const exportClasses = ['synapse-canvas-exporting', backgroundClass];

    canvas.classList.add(...exportClasses);

    if (shouldIncludeBranding) {
      canvas.classList.add('synapse-export-with-brand');
      if (branding) canvas.appendChild(branding);
    }

    try {
      await waitForExportPaint();

      const dataUrl = await toPng(canvas, {
        cacheBust: true,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        backgroundColor: background === 'white'
          ? '#ffffff'
          : background === 'transparent'
            ? 'transparent'
            : undefined,
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        style: {
          width: `${canvas.clientWidth}px`,
          height: `${canvas.clientHeight}px`
        }
      });

      const link = document.createElement('a');
      link.download = 'synapse-mapa.png';
      link.href = dataUrl;
      link.click();
    } finally {
      branding?.remove();
      canvas.classList.remove(...exportClasses, 'synapse-export-with-brand');
    }
  }, [billingStatus.plan]);

  // ESC cancels connecting
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConnectingFrom(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Track mouse for live connection line
  useEffect(() => {
    if (!connectingFrom) { setConnectingLine(null); return; }
    const fromIdea = ideas.find(i => i.id === connectingFrom);
    if (!fromIdea) return;

    const onMove = (e: MouseEvent) => {
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const pad = ESPACO_BORDA_TELA || 0;
      const mx = (e.clientX - rect.left - pad - panX) / zoom;
      const my = (e.clientY - rect.top - pad - panY) / zoom;
      const halfW = ((fromIdea.width || BALLOON_W) / 2);
      const halfH = ((fromIdea.height || BALLOON_H) / 2);
      setConnectingLine({
        x1: fromIdea.position.x + halfW,
        y1: fromIdea.position.y + halfH,
        x2: mx,
        y2: my
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [connectingFrom, ideas, panX, panY, zoom]);

  // -- Idea actions --
  const addIdea = useCallback((text: string, isCentral = false) => {
    if (!text.trim()) return;
    if (!billingStatus?.hasActivePlan) {
      openPlansModal();
      return;
    }

    const currentProjectIdeaCount = ideas.filter(idea => idea.projectId === (activeProjectId || 'default')).length;
    const balloonLimit = Number(billingStatus.limits?.balloonsPerProjectLimit || 0);
    if (currentProjectIdeaCount >= balloonLimit) {
      openPlansModal();
      return;
    }

    const viewW = window.innerWidth;
    const viewH = window.innerHeight - 130;

    // Centralized position in the world
    const cx = (viewW / 2 - panX) / zoom;
    const cy = (viewH / 2 - panY) / zoom;

    // Offset based on existing ideas to avoid exact overlap
    const offset = (ideas.length % 10) * 25;

    const newIdea: Idea = {
      id: crypto.randomUUID(),
      text,
      category: isCentral ? 'Objetivo' : categorizeIdea(text),
      position: {
        x: cx - 140 + offset,
        y: cy - 60 + offset
      },
      connections: [],
      isCentral,
      width: BALLOON_W,
      height: BALLOON_H,
      projectId: activeProjectId || 'default'
    };
    setIdeas(prev => [...prev, newIdea]);
  }, [panX, panY, zoom, ideas, activeProjectId, billingStatus, openPlansModal]);

  const updateIdeaPosition = useCallback((id: string, position: { x: number; y: number }) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, position } : i));
  }, []);

  const updateIdeaCategory = useCallback((id: string, category: string, color?: string) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, category, categoryColor: color } : i));
  }, []);

  const updateIdeaText = useCallback((id: string, text: string) => {
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, text } : i));
  }, []);

  const handleSaveRecentColor = useCallback((color: string) => {
    setRecentColors(prev => [color, ...prev.filter(c => c !== color)].slice(0, 5));
  }, []);

  const deleteIdea = useCallback((id: string) => {
    deletedIdeaIdsRef.current.add(id);
    setIdeas(prev => prev.filter(i => i.id !== id).map(i => ({
      ...i,
      connections: i.connections.filter(c => c !== id)
    })));
  }, []);

  const toggleCentral = useCallback((id: string) => {
    setIdeas(prev => prev.map(i => {
      if (i.id === id) {
        const novoStatus = !i.isCentral;
        return { ...i, isCentral: novoStatus, category: novoStatus ? 'Objetivo' : i.category };
      }
      return i;
    }));
  }, []);

  const updateIdeaRect = useCallback((id: string, rect: { x?: number; y?: number; width?: number; height?: number }) => {
    const minW = 120, minH = 80, maxW = 1200, maxH = 800;
    setIdeas(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = { ...i };
      if (rect.x !== undefined) next.position.x = rect.x;
      if (rect.y !== undefined) next.position.y = rect.y;
      if (rect.width !== undefined) next.width = Math.max(minW, Math.min(maxW, Math.round(rect.width)));
      if (rect.height !== undefined) next.height = Math.max(minH, Math.min(maxH, Math.round(rect.height)));
      return next;
    }));
  }, []);

  const triggerFlash = useCallback((fromId: string, toId: string) => {
    setConnectionFlash({ from: fromId, to: toId });
    setTimeout(() => setConnectionFlash(null), 400);
  }, []);

  const toggleConnection = useCallback((fromId: string, toId: string) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id !== fromId) return idea;
      const has = idea.connections.includes(toId);
      if (!has) triggerFlash(fromId, toId);
      return { ...idea, connections: has ? idea.connections.filter(c => c !== toId) : [...idea.connections, toId] };
    }));
  }, [triggerFlash]);

  const startConnecting = useCallback((id: string) => setConnectingFrom(id), []);
  const finishConnecting = useCallback((toId: string) => {
    if (connectingFrom && connectingFrom !== toId) toggleConnection(connectingFrom, toId);
    setConnectingFrom(null);
    setConnectingLine(null);
  }, [connectingFrom, toggleConnection]);

  const handleAiAction = useCallback(async (ideaId: string, actionKey: string) => {
    const currentBilling = billingLoadState === 'success'
      ? billingStatus
      : await refreshBillingStatus({ showLoading: true });

    const currentUsage = getAiUsageView(currentBilling, Date.now());
    const currentProjectIdeaCount = ideas.filter(idea => idea.projectId === (activeProjectId || 'default')).length;

    const balloonLimit = Number(currentBilling.limits?.balloonsPerProjectLimit || 0);
    if (!currentBilling?.hasActivePlan || currentUsage.remaining <= 0 || currentProjectIdeaCount + 3 > balloonLimit) {
      openPlansModal();
      return;
    }

    const fonte = ideas.find(i => i.id === ideaId);
    if (!fonte) return;
    setAiProcessingId(ideaId);
    const centralIdea = ideas.find(i => i.isCentral);
    const ideiaPrincipal = centralIdea?.text || fonte.text;
    // Map UI action keys to TipoAcao
    const acaoMap: Record<string, AiMode> = {
      'root-cause': 'causa_raiz',
      'next-steps': 'proximos_passos',
      'expand': 'expandir_ideias'
    };
    const acao = acaoMap[actionKey] ?? 'expandir_ideias';
    try {
      const headers = await createAuthHeaders({ 'Content-Type': 'application/json' });
      const { items: resultados, rateLimit } = await pedirSugestaoIA(
        ideiaPrincipal,
        ideas,
        fonte,
        acao,
        headers,
        currentBilling.effectivePlan
      );
      if (rateLimit) {
        syncBillingUsageFromRateLimit(rateLimit);
      } else {
        void refreshBillingStatus();
      }
      const newIdeas: Idea[] = resultados.map((r: any, idx: number) => {
        const angle = ((2 * Math.PI) / resultados.length) * idx - Math.PI / 2;
        const text = (r.texto || r.text || 'Ideia sem título');
        const size = getInitialAiBalloonSize(text);
        return {
          id: crypto.randomUUID(),
          text,
          category: String(r.categoria || r.category || 'Outro').trim() || 'Outro',
          position: { x: fonte.position.x + Math.cos(angle) * 300, y: fonte.position.y + Math.sin(angle) * 280 },
          connections: [],
          isCentral: false,
          width: size.width,
          height: size.height,
          aiGenerated: true,
          projectId: activeProjectId || 'default'
        };
      });
      setIdeas(prev => {
        const updated = [...prev];
        const srcIdx = updated.findIndex(i => i.id === ideaId);
        if (srcIdx === -1) return prev;
        newIdeas.forEach(ni => {
          updated.push(ni);
          updated[srcIdx] = { ...updated[srcIdx], connections: [...updated[srcIdx].connections, ni.id] };
        });
        return updated;
      });
      newIdeas.forEach((ni, idx) => setTimeout(() => triggerFlash(ideaId, ni.id), idx * 350));
    } catch (e) {
      console.error(e);
      if (e instanceof AiRequestError) {
        syncBillingUsageFromRateLimit(e.rateLimit);
        if (e.billing) setBillingStatus(normalizeBillingStatus(e.billing));
        if (e.status === 429 || e.status === 402) {
          openPlansModal();
          return;
        }
      }

      alert('Nao foi possivel gerar sugestoes agora. Verifique sua sessao e tente novamente.');
    } finally {
      setAiProcessingId(null);
    }
  }, [ideas, billingStatus, billingLoadState, refreshBillingStatus, syncBillingUsageFromRateLimit, openPlansModal, triggerFlash, activeProjectId, createAuthHeaders]);

  const clearAll = useCallback(() => {
    if (confirm('Limpar todos os insights?')) {
      ideas.forEach(idea => deletedIdeaIdsRef.current.add(idea.id));
      setIdeas([]);
      resetAnimatedConnections();
    }
  }, [ideas]);

  const allCategories = [
    ...CATEGORIES,
    ...Array.from(new Set(ideas.map(i => i.category)))
      .filter(name => !CATEGORIES.some(c => c.name === name))
      .map(name => ({ name, color: '#6b7280', bgColor: '#6b728020' }))
  ];
  const exportBrandingPlanLabel = billingStatus.plan === 'basic' ? 'BASIC' : 'FREE';

  // -- Landing Page (Neural Organizer Mobile First) --
  if (!isLoaded) {
    return (
      <div className="app-container justify-center items-center">
        <div className="flex items-center gap-2">
          <Brain className="text-purple-500 animate-pulse" size={28} />
          <span className="text-white font-bold tracking-widest text-lg">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="app-container auth-screen">
        <div className="auth-screen__grid" aria-hidden="true" />
        <div className="auth-screen__glow" aria-hidden="true" />

        <div className="auth-shell">
          <section className="auth-enterprise-panel" aria-label="Synapse for Mars">
            <div className="auth-enterprise-panel__brand">
              <span className="auth-enterprise-panel__synapse">
                <Brain size={22} />
                Synapse IA
              </span>
              <span className="mars-brand-chip mars-brand-chip--panel">
                <span className="mars-mark" aria-hidden="true">M</span>
                for Mars
              </span>
            </div>

            <div className="auth-enterprise-panel__copy">
              <span className="auth-enterprise-panel__eyebrow">
                <Sparkles size={13} />
                Enterprise workspace
              </span>
              <h1>Synapse for Mars</h1>
              <p>
                Uma camada visual corporativa para apresentar mapas de ideias, conexoes e fluxos de IA operacional.
              </p>
            </div>

            <div className="enterprise-integrations" aria-label="Integracoes planejadas">
              {ENTERPRISE_INTEGRATIONS.map(({ title, description, Icon }) => (
                <article className="enterprise-integration-card" key={title}>
                  <span className="enterprise-integration-card__icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="enterprise-integration-card__copy">
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                </article>
              ))}
            </div>
          </section>

          <div className="auth-card">
          <div className="auth-card__brand">
            <span className="auth-card__logo" aria-hidden="true">
              <Brain size={30} />
            </span>
            <span className="auth-card__brand-name">Synapse IA</span>
            <span className="auth-card__mars-wordmark">Mars</span>
          </div>

          <div className="auth-card__copy">
            <span className="auth-card__eyebrow">
              <Sparkles size={13} />
              Mapa neural com IA
            </span>
            <h2>Entre no workspace Mars</h2>
            <p>Conecte ideias, organize insights e continue seu mapa com IA.</p>
          </div>

          <div className="auth-card__actions">
                <button
                  type="button"
                  className="btn-sync"
                  onClick={() => setIsDemoSignedIn(true)}
                  title="Entrar com Okta Mars"
                >
                  <UserCircle size={20} />
                  ENTRAR COM OKTA MARS
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPostLoginLoading) {
    return (
      <PostLoginLoadingScreen
        billingReady={hasLoadedInitialBilling}
        projectsReady={hasLoadedProjects}
        canvasReady={hasLoadedInitialIdeas}
        message={postLoginLoadingMessage}
      />
    );
  }

  // -- Main App (Neural Organizer) --
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-brand flex items-center gap-3">
          <Brain size={24} className="text-purple-400" />
          <h1 className="text-lg font-bold text-white tracking-widest uppercase">
            Synapse IA
          </h1>
          <span className="mars-brand-chip">
            <span className="mars-mark" aria-hidden="true">M</span>
            for Mars
          </span>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className={`app-help-button ${shouldShowOnboardingHint ? 'is-active' : ''}`}
            onClick={openOnboardingHint}
            aria-label="Abrir ajuda"
            aria-expanded={shouldShowOnboardingHint}
            title="Como usar"
          >
            <HelpCircle size={18} />
          </button>
          <AiQuotaButton
            usage={aiUsageView}
            onOpenPlans={openPlansModal}
          />
        </div>
      </header>

      {/* Main Board */}
      <div ref={boardRef} className="flex-1 relative z-10 w-full overflow-hidden">
        <BrainstormBoard
          ideas={ideas}
          categories={allCategories}
          onUpdatePosition={updateIdeaPosition}
          onUpdateCategory={updateIdeaCategory}
          onUpdateText={updateIdeaText}
          onDeleteIdea={deleteIdea}
          onToggleCentral={toggleCentral}
          onUpdateRect={updateIdeaRect}
          onUpdateSize={(id, size) => updateIdeaRect(id, size)}
          connectingFrom={connectingFrom}
          connectingLine={connectingLine}
          onStartConnecting={startConnecting}
          onFinishConnecting={finishConnecting}
          connectionFlash={connectionFlash}
          onAiAction={handleAiAction}
          aiProcessingId={aiProcessingId}
          zoom={zoom}
          panX={panX}
          panY={panY}
          showCartesianGuide={showCartesianGuide}
          onZoomChange={setZoom}
          onPanChange={(x, y) => { setPanX(x); setPanY(y); }}
          recentColors={recentColors}
          onSaveRecentColor={handleSaveRecentColor}
        />
      </div>

      <CanvasToolbar
        zoom={zoom}
        showGrid={showCartesianGuide}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={resetCanvasView}
        onToggleGrid={toggleCartesianGuide}
        onExportImage={handleExportCanvas}
        showBranding={billingStatus.plan !== 'pro'}
        brandingPlanLabel={exportBrandingPlanLabel}
      />

      {/* Bottom Floating Input */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <InputBar onAddIdea={addIdea} />
      </div>

      <OnboardingHint
        isOpen={shouldShowOnboardingHint}
        onClose={closeOnboardingHint}
      />

      {/* Bottom Navigation Menu */}
      <nav className="app-bottom-nav absolute bottom-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-lg backdrop-blur-xl rounded-full h-16 flex items-center justify-around px-4">
        <button onClick={() => setActiveNav('grid')} className={`app-bottom-nav__button p-3 rounded-full transition-all ${activeNav === 'grid' ? 'is-active' : ''}`}>
          <LayoutGrid size={22} />
        </button>
        <button onClick={() => setActiveNav('status')} className={`app-bottom-nav__button p-3 rounded-full transition-all ${activeNav === 'status' ? 'is-active' : ''}`}>
          <Activity size={22} />
        </button>
        <button onClick={() => setActiveNav('folders')} className={`app-bottom-nav__button p-3 rounded-full transition-all ${activeNav === 'folders' ? 'is-active' : ''}`}>
          <Folder size={22} />
        </button>
        <button onClick={() => setActiveNav('settings')} className={`app-bottom-nav__button p-3 rounded-full transition-all ${activeNav === 'settings' ? 'is-active' : ''}`}>
          <Settings size={22} />
        </button>
      </nav>

      {/* Statistics Modal */}
      <StatisticsModal 
        ideas={ideas} 
        isOpen={activeNav === 'status'} 
        onClose={() => setActiveNav('grid')} 
      />

      {/* Projects Modal */}
      <ProjectsModal
        projects={projects}
        activeProjectId={activeProjectId}
        isOpen={activeNav === 'folders'}
        onClose={() => setActiveNav('grid')}
        onSelectProject={(id) => { setActiveProjectId(id); setActiveNav('grid'); }}
        onCreateProject={handleCreateProject}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
      />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={activeNav === 'settings'}
        onClose={() => setActiveNav('grid')}
        onClearWorkspace={clearAll}
        billingStatus={billingStatus}
        billingLoadState={billingLoadState}
        billingError={billingError}
        onOpenPlans={openPlansModal}
        onManageSubscription={handleManageSubscription}
      />

      {/* Plans Modal */}
      <PlansModal
        isOpen={isPlansModalOpen}
        onClose={() => setIsPlansModalOpen(false)}
        billingStatus={billingStatus}
        billingLoadState={billingLoadState}
        billingError={billingError}
        onSelectPlan={handleSelectPlan}
        onManageSubscription={handleManageSubscription}
        isActionLoading={billingActionLoading}
      />
    </div>
  );
}
