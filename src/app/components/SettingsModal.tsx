import React, { useEffect, useState, type ReactNode } from 'react';
import {
  X,
  Settings,
  User,
  Database,
  AlertCircle,
  CheckCircle,
  Shield,
  Image as ImageIcon,
  LogOut,
  CreditCard,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BillingLoadState, BillingStatus } from '../../lib/billing';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearWorkspace: () => void;
  billingStatus: BillingStatus;
  billingLoadState: BillingLoadState;
  billingError: string | null;
  onOpenPlans: () => void;
  onManageSubscription: () => void | Promise<void>;
}

type TabType = 'perfil' | 'dados';
type IconComponent = React.ComponentType<{ size?: number; className?: string }>;
type ActionVariant = 'neutral' | 'primary' | 'danger' | 'dangerSoft';
type CardTone = 'default' | 'danger';
type ProfileFeedback = {
  tone: 'success' | 'error';
  message: string;
};
type DisabledAuthUser = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  update: (input: { firstName: string; lastName: string }) => Promise<DisabledAuthUser>;
  reload: () => Promise<void>;
  setProfileImage: (input: { file: File }) => Promise<{ publicUrl?: string | null }>;
};

const sidebarTabs: Array<{ id: TabType; label: string; description?: string; Icon: IconComponent }> = [
  { id: 'perfil', label: 'Perfil', description: 'Gerencie suas informações', Icon: User },
  { id: 'dados', label: 'Dados', description: 'Exporte ou limpe dados', Icon: Database }
];

const tabDescriptions: Record<TabType, string> = {
  perfil: 'Gerencie suas informações',
  dados: 'Exporte ou limpe dados'
};

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

const actionButtonVariantClass: Record<ActionVariant, string> = {
  neutral: 'settings-action--neutral',
  primary: 'settings-action--primary',
  danger: 'settings-action--danger',
  dangerSoft: 'settings-action--danger-soft'
};

const inputBase = 'settings-input';

const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.16 }
};

const splitFullName = (value: string) => {
  const normalizedName = value.trim().replace(/\s+/g, ' ');
  const [firstName = '', ...lastNameParts] = normalizedName.split(' ');

  return {
    firstName,
    lastName: lastNameParts.join(' ')
  };
};

const getProfileErrorMessage = (error: unknown, fallback: string) => {
  const authError = error as {
    errors?: Array<{ longMessage?: string; message?: string }>;
    message?: string;
  };
  const firstAuthError = authError?.errors?.[0];

  return (
    firstAuthError?.longMessage ||
    firstAuthError?.message ||
    (error instanceof Error ? error.message : '') ||
    authError?.message ||
    fallback
  );
};

const ProfileFeedbackMessage = ({ feedback }: { feedback: ProfileFeedback | null }) => {
  if (!feedback) return null;

  const isSuccess = feedback.tone === 'success';
  const Icon = isSuccess ? CheckCircle : AlertCircle;

  return (
    <div
      className={cx(
        'settings-feedback box-border flex w-full min-w-0 items-start gap-3 rounded-2xl !px-5 !py-4',
        isSuccess ? 'settings-feedback--success' : 'settings-feedback--error'
      )}
      role={isSuccess ? 'status' : 'alert'}
    >
      <Icon className="mt-0.5 shrink-0" size={18} />
      <span className="min-w-0 text-sm font-semibold leading-6">{feedback.message}</span>
    </div>
  );
};

const ModalShell = ({
  children,
  onClose
}: {
  children: ReactNode;
  onClose: () => void;
}) => (
  <div className="settings-modal-shell fixed inset-0 z-[100] box-border flex items-center justify-center !p-2 sm:!p-4 animate-in fade-in duration-300">
    <div
      className="settings-modal-overlay absolute inset-0 box-border"
      onClick={onClose}
    />

    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="settings-modal-panel relative z-10 box-border flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[91.5rem] min-w-0 flex-col overflow-hidden rounded-[1.5rem] animate-in zoom-in-95 duration-300 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-[2rem] lg:h-[min(1048px,calc(100dvh-2rem))] lg:max-h-[min(1048px,calc(100dvh-2rem))] lg:w-full lg:rounded-[2.35rem]"
    >
      <div
        className="settings-modal-body box-border flex h-full min-h-0 w-full min-w-0 flex-col"
      >
        {children}
      </div>
    </div>
  </div>
);

const SettingsHeader = ({ onClose }: { onClose: () => void }) => (
  <header className="settings-header box-border w-full min-w-0 shrink-0">
    <div className="box-border flex min-h-[74px] w-full min-w-0 items-center justify-between gap-4">
      <div className="box-border flex min-w-0 items-center gap-4 sm:gap-5">
        <span className="settings-header-icon box-border inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] !p-3 sm:h-16 sm:w-16 sm:rounded-[1.4rem] sm:!p-4">
          <Settings size={28} />
        </span>

        <div className="box-border flex min-w-0 flex-col gap-1.5">
          <h2
            id="settings-title"
            className="min-w-0 text-2xl font-bold leading-8 tracking-tight text-white sm:text-[1.7rem] sm:leading-9"
          >
            Configurações
          </h2>
          <p className="min-w-0 text-sm font-medium leading-5 text-gray-400">
            Ajustes e Preferências
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar configurações"
        className="settings-close-button box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors"
      >
        <X size={24} />
      </button>
    </div>
  </header>
);

const SettingsSidebar = ({
  activeTab,
  onSelect
}: {
  activeTab: TabType;
  onSelect: (tab: TabType) => void;
}) => (
  <aside className="settings-sidebar box-border h-auto w-full min-w-0 shrink-0 md:h-full md:w-full">
    <nav className="settings-sidebar-nav box-border grid w-full min-w-0 grid-cols-2 gap-2 md:flex md:flex-col md:gap-4">
      {sidebarTabs.map(({ id, label, description, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={cx(
            'settings-tab-button box-border inline-flex min-h-[68px] w-full min-w-0 items-center justify-center rounded-2xl !px-3 !py-3 transition-all md:min-h-[86px] md:justify-start md:!px-4 lg:!px-5',
            activeTab === id
              ? 'is-active text-white'
              : 'text-gray-400'
          )}
        >
          <span className="box-border inline-flex w-full min-w-0 items-center justify-center gap-2 md:justify-start md:gap-4">
            <span className="settings-tab-icon box-border inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Icon className="shrink-0" size={20} />
            </span>
            <span className="settings-tab-copy min-w-0">
              <span className="settings-tab-label min-w-0 truncate">{label}</span>
              <span className="settings-tab-description min-w-0">{description || tabDescriptions[id]}</span>
            </span>
          </span>
        </button>
      ))}
    </nav>
  </aside>
);

const SettingsLayout = ({
  activeTab,
  onSelectTab,
  children
}: {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  children: ReactNode;
}) => (
  <div className="settings-layout box-border grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 gap-4 !px-0 !pb-0 lg:grid-cols-[330px_minmax(0,1fr)] lg:gap-7 xl:grid-cols-[364px_minmax(0,1fr)] xl:gap-[38px]">
    <SettingsSidebar activeTab={activeTab} onSelect={onSelectTab} />

    <main className="box-border flex min-h-0 w-full min-w-0">
      <div
        className="settings-content custom-scrollbar box-border h-full min-h-0 w-full min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div className="settings-content-inner box-border w-full min-w-0">
          {children}
        </div>
      </div>
    </main>
  </div>
);

const SettingsCard = ({
  children,
  tone = 'default',
  className,
  compact = false
}: {
  children: ReactNode;
  tone?: CardTone;
  className?: string;
  compact?: boolean;
}) => (
  <section
    className={cx(
      'settings-card box-border w-full min-w-0 overflow-visible rounded-[1.5rem] sm:rounded-[1.8rem]',
      compact && 'settings-card--compact min-h-[138px]',
      tone === 'danger' ? 'settings-card--danger' : 'settings-card--default',
      className
    )}
  >
    <div
      className={cx(
        'settings-card-inner box-border flex w-full min-w-0 flex-col',
        compact
          ? 'min-h-[138px] justify-center gap-6'
          : 'gap-7'
      )}
    >
      {children}
    </div>
  </section>
);

const CardHeader = ({
  title,
  description,
  tone = 'default',
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  tone?: CardTone;
  className?: string;
}) => (
  <div className={cx('settings-card-heading box-border flex w-full min-w-0 flex-col gap-1.5', className)}>
    <h3
      className={cx(
        'min-w-0 text-xl font-bold leading-7 tracking-tight',
        tone === 'danger' ? 'text-red-500' : 'text-white'
      )}
    >
      {title}
    </h3>

    {description && (
      <p
        className={cx(
          'min-w-0 text-sm font-medium leading-6 sm:text-base',
          tone === 'danger' ? 'text-red-400/80' : 'text-gray-400'
        )}
      >
        {description}
      </p>
    )}
  </div>
);

const SectionRow = ({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={cx(
      'box-border flex w-full min-w-0 flex-col gap-6 md:flex-row md:items-center md:justify-between lg:gap-8',
      className
    )}
  >
    {children}
  </div>
);

const ActionButton = ({
  children,
  Icon,
  variant = 'neutral',
  className,
  onClick,
  disabled = false,
  isLoading = false
}: {
  children: ReactNode;
  Icon?: IconComponent;
  variant?: ActionVariant;
  className?: string;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick ? () => void onClick() : undefined}
    disabled={disabled || isLoading}
    aria-busy={isLoading || undefined}
    className={cx(
      'settings-action box-border inline-flex min-h-14 w-full min-w-0 items-center justify-center rounded-2xl !px-6 !py-4 text-center text-[15px] font-bold leading-5 transition-all sm:w-auto sm:min-w-[13rem] sm:whitespace-nowrap',
      actionButtonVariantClass[variant],
      (disabled || isLoading) && 'settings-action--disabled',
      className
    )}
  >
    <span className="box-border inline-flex w-full min-w-0 items-center justify-center gap-3">
      {isLoading ? (
        <span className="settings-button-spinner shrink-0" aria-hidden="true" />
      ) : (
        Icon && <Icon className="shrink-0" size={20} />
      )}
      <span className="min-w-0 leading-5">{children}</span>
    </span>
  </button>
);

const FormField = ({
  id,
  label,
  children
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => (
  <div className="settings-field box-border flex w-full min-w-0 flex-col gap-3 rounded-2xl !p-0">
    <label
      htmlFor={id}
      className="min-w-0 text-sm font-medium leading-5 text-gray-400"
    >
      {label}
    </label>
    <div className="box-border w-full min-w-0">{children}</div>
  </div>
);

const ProfileIdentity = ({
  imageUrl,
  firstName,
  fullName
}: {
  imageUrl?: string | null;
  firstName?: string | null;
  fullName?: string | null;
}) => (
  <div className="settings-profile-identity box-border flex w-full min-w-0 flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8 lg:gap-10">
    <span className="settings-avatar-frame box-border inline-flex shrink-0 rounded-full !p-1.5">
      <img
        src={imageUrl || `https://ui-avatars.com/api/?name=${firstName || 'User'}&background=random`}
        alt="Profile"
        className="h-20 w-20 shrink-0 rounded-full object-cover sm:h-24 sm:w-24 lg:h-24 lg:w-24"
      />
      <span className="settings-avatar-badge">
        <ImageIcon size={16} />
      </span>
    </span>

    <div className="box-border flex w-full min-w-0 flex-col gap-2">
      <span className="min-w-0 break-words text-2xl font-bold leading-8 text-white">
        {fullName || 'Usuário'}
      </span>
      <span className="min-w-0 text-base leading-6 text-gray-400">
        Atualize sua foto de perfil
      </span>
    </div>
  </div>
);

const StatusPill = () => (
  <span className="settings-status-pill box-border inline-flex min-h-12 max-w-full min-w-0 items-center gap-3 self-start whitespace-nowrap rounded-2xl !px-5 !py-3 sm:self-center">
    <span className="h-3 w-3 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
    <span className="min-w-0 text-base font-bold text-emerald-400">Conectado</span>
  </span>
);

function getPlanLabel(status: BillingStatus) {
  const effectivePlan = status.effectivePlan || 'none';

  if (effectivePlan === 'basic') return 'Basico';
  if (effectivePlan === 'pro') return 'Pro';
  if (effectivePlan === 'trial') return 'Trial';
  return 'Sem plano ativo';
}

function getSafeUsage(status: BillingStatus) {
  const usage = (status as Partial<BillingStatus>).usage;
  const limit = Number(usage?.limit);
  const remaining = Number(usage?.remaining);

  return {
    limit: Number.isFinite(limit) ? Math.max(0, limit) : 0,
    remaining: Number.isFinite(remaining) ? Math.max(0, remaining) : 0
  };
}

const BillingStatusCard = ({
  billingStatus,
  billingLoadState,
  billingError,
  onOpenPlans,
  onManageSubscription
}: {
  billingStatus: BillingStatus;
  billingLoadState: BillingLoadState;
  billingError: string | null;
  onOpenPlans: () => void;
  onManageSubscription: () => void | Promise<void>;
}) => {
  const effectivePlan = billingStatus.effectivePlan || 'none';
  const planLabel = getPlanLabel(billingStatus);
  const hasPaidPlan = effectivePlan === 'basic' || effectivePlan === 'pro';
  const usage = getSafeUsage(billingStatus);
  const isLoading = billingLoadState === 'loading';
  const hasError = billingLoadState === 'error';
  const usageText = isLoading
    ? 'Carregando status do plano.'
    : hasError
      ? billingError || 'Nao foi possivel atualizar o plano agora.'
      : billingStatus.hasActivePlan
        ? `${usage.remaining}/${usage.limit} usos de IA restantes hoje.`
        : 'Assine para liberar IA e recursos premium.';

  return (
    <SettingsCard compact className="settings-plan-card">
      <SectionRow>
        <div className="box-border flex w-full min-w-0 items-start gap-5 sm:items-center lg:gap-6">
          <span className="settings-plan-icon box-border inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl !p-3">
            <Sparkles size={24} />
          </span>
          <CardHeader
            title={`Plano ${planLabel}`}
            description={usageText}
          />
        </div>

        <ActionButton
          Icon={CreditCard}
          onClick={hasPaidPlan && billingStatus?.canManageSubscription ? onManageSubscription : onOpenPlans}
          variant={hasPaidPlan ? 'neutral' : 'primary'}
          className="sm:min-w-[15rem]"
        >
          {hasPaidPlan && billingStatus?.canManageSubscription ? 'Gerenciar assinatura' : 'Ver planos'}
        </ActionButton>
      </SectionRow>
    </SettingsCard>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onClearWorkspace,
  billingStatus,
  billingLoadState,
  billingError,
  onOpenPlans,
  onManageSubscription
}) => {
  const [user] = useState<DisabledAuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('perfil');
  const [profileName, setProfileName] = useState('');
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [profileFeedback, setProfileFeedback] = useState<ProfileFeedback | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (!user) return;

    setProfileName(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '));
    setProfileImagePreview(user.imageUrl || null);
  }, [user?.id, user?.fullName, user?.firstName, user?.lastName, user?.imageUrl]);

  useEffect(() => {
    if (!isOpen) {
      setProfileFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClearWorkspace = () => {
    if (
      window.confirm(
        'Tem certeza que deseja limpar todo o workspace ativo? Esta ação apagará todas as ideias deste projeto e não pode ser desfeita.'
      )
    ) {
      onClearWorkspace();
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      setProfileFeedback({
        tone: 'error',
        message: 'Nao foi possivel carregar seu usuario. Atualize a pagina e tente novamente.'
      });
      return;
    }

    const normalizedName = profileName.trim().replace(/\s+/g, ' ');

    if (!normalizedName) {
      setProfileFeedback({
        tone: 'error',
        message: 'Informe um nome antes de salvar.'
      });
      return;
    }

    setIsSavingProfile(true);
    setProfileFeedback(null);

    try {
      const { firstName, lastName } = splitFullName(normalizedName);
      const updatedUser = await user.update({ firstName, lastName });
      await updatedUser.reload();
      setProfileName(updatedUser.fullName || normalizedName);
      setProfileFeedback({
        tone: 'success',
        message: 'Perfil atualizado com sucesso.'
      });
    } catch (error) {
      setProfileFeedback({
        tone: 'error',
        message: getProfileErrorMessage(error, 'Nao foi possivel salvar seu perfil agora.')
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileFeedback({
        tone: 'error',
        message: 'Selecione um arquivo de imagem valido.'
      });
      return;
    }

    if (!user) {
      setProfileFeedback({
        tone: 'error',
        message: 'Nao foi possivel carregar seu usuario. Atualize a pagina e tente novamente.'
      });
      return;
    }

    const temporaryPreview = URL.createObjectURL(file);
    let shouldRevokeTemporaryPreview = true;
    setProfileImagePreview(temporaryPreview);
    setIsUploadingImage(true);
    setProfileFeedback(null);

    try {
      const imageResource = await user.setProfileImage({ file });
      await user.reload();
      const nextPreview = user.imageUrl || imageResource.publicUrl || temporaryPreview;
      shouldRevokeTemporaryPreview = nextPreview !== temporaryPreview;
      setProfileImagePreview(nextPreview);
      setProfileFeedback({
        tone: 'success',
        message: 'Foto de perfil atualizada com sucesso.'
      });
    } catch (error) {
      setProfileImagePreview(user.imageUrl || null);
      setProfileFeedback({
        tone: 'error',
        message: getProfileErrorMessage(error, 'Nao foi possivel enviar a foto agora.')
      });
    } finally {
      if (shouldRevokeTemporaryPreview) {
        URL.revokeObjectURL(temporaryPreview);
      }
      setIsUploadingImage(false);
    }
  };

  const handleOpenSecurityProfile = () => {
    setProfileFeedback({
      tone: 'error',
      message: 'Login e seguranca estao temporariamente desabilitados.'
    });
  };

  const handleLogout = async () => {
    onClose();
  };

  return (
    <ModalShell onClose={onClose}>
      <SettingsHeader onClose={onClose} />

      <SettingsLayout activeTab={activeTab} onSelectTab={setActiveTab}>
        <AnimatePresence mode="wait">
          {activeTab === 'perfil' && (
            <motion.div
              key="perfil"
              {...fadeMotion}
              className="settings-tab-panel box-border flex w-full min-w-0 flex-col gap-5 sm:gap-6 lg:gap-7"
            >
              <SettingsCard className="settings-profile-card">
                <SectionRow>
                  <ProfileIdentity
                    imageUrl={profileImagePreview || user?.imageUrl}
                    firstName={user?.firstName}
                    fullName={user?.fullName}
                  />

                  <label
                    className={cx(
                      'settings-file-action settings-action settings-action--neutral box-border inline-flex min-h-14 w-full min-w-0 cursor-pointer items-center justify-center rounded-2xl !px-6 !py-4 text-center text-[15px] font-bold leading-5 transition-all sm:w-auto sm:min-w-[13rem] sm:whitespace-nowrap',
                      (!user || isUploadingImage) && 'settings-action--disabled'
                    )}
                    aria-busy={isUploadingImage || undefined}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      className="settings-file-input"
                      disabled={!user || isUploadingImage}
                      onChange={handleProfileImageChange}
                    />
                    <span className="box-border inline-flex w-full min-w-0 items-center justify-center gap-3">
                      {isUploadingImage ? (
                        <span className="settings-button-spinner shrink-0" aria-hidden="true" />
                      ) : (
                        <ImageIcon className="shrink-0" size={20} />
                      )}
                      <span className="min-w-0 leading-5">
                        {isUploadingImage ? 'Enviando...' : 'Alterar Foto'}
                      </span>
                    </span>
                  </label>
                </SectionRow>
              </SettingsCard>

              <ProfileFeedbackMessage feedback={profileFeedback} />

              <BillingStatusCard
                billingStatus={billingStatus}
                billingLoadState={billingLoadState}
                billingError={billingError}
                onOpenPlans={onOpenPlans}
                onManageSubscription={onManageSubscription}
              />

              <SettingsCard className="settings-personal-card">
                <div className="box-border flex w-full min-w-0 items-start gap-4">
                  <span className="settings-section-icon box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                    <User size={22} />
                  </span>
                  <CardHeader
                    title="Dados Pessoais"
                    description="Atualize suas informações básicas"
                  />
                </div>

                <div className="box-border grid w-full min-w-0 grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
                  <FormField id="settings-name" label="Nome">
                    <input
                      id="settings-name"
                      type="text"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      className={cx(inputBase, isSavingProfile && 'settings-input--disabled')}
                      disabled={!user || isSavingProfile}
                    />
                  </FormField>

                  <FormField id="settings-email" label="E-mail principal">
                    <input
                      id="settings-email"
                      type="email"
                      value={user?.primaryEmailAddress?.emailAddress || ''}
                      className={cx(
                        inputBase,
                        'settings-input--disabled cursor-not-allowed'
                      )}
                      readOnly
                      disabled
                    />
                  </FormField>
                </div>

                <div className="settings-form-actions box-border flex w-full min-w-0 justify-stretch sm:justify-end">
                  <ActionButton
                    onClick={handleSaveProfile}
                    variant="primary"
                    className="sm:min-w-[16rem]"
                    disabled={!user || isSavingProfile}
                    isLoading={isSavingProfile}
                  >
                    {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                  </ActionButton>
                </div>
              </SettingsCard>

              <SettingsCard compact className="settings-security-card">
                <SectionRow>
                  <div className="box-border flex w-full min-w-0 items-start gap-4">
                    <span className="settings-section-icon settings-section-icon--danger box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                      <Shield size={22} />
                    </span>
                    <CardHeader
                      title="Segurança"
                      description="Atualize sua senha para manter sua conta segura."
                    />
                  </div>

                  <ActionButton Icon={Shield} onClick={handleOpenSecurityProfile} variant="dangerSoft">
                    Alterar Senha
                  </ActionButton>
                </SectionRow>
              </SettingsCard>

              <SettingsCard compact className="settings-session-card">
                <SectionRow>
                  <CardHeader
                    title="Sessão"
                    description="Encerre o acesso atual neste dispositivo."
                  />

                  <ActionButton Icon={LogOut} onClick={handleLogout}>
                    Sair
                  </ActionButton>
                </SectionRow>
              </SettingsCard>
            </motion.div>
          )}

          {activeTab === 'dados' && (
            <motion.div
              key="dados"
              {...fadeMotion}
              className="settings-tab-panel box-border flex w-full min-w-0 flex-col gap-5 sm:gap-6"
            >
              <SettingsCard className="settings-data-card">
                <SectionRow>
                  <div className="box-border flex w-full min-w-0 items-start gap-4">
                    <span className="settings-section-icon box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                      <Database size={22} />
                    </span>
                    <CardHeader
                      title="Banco de Dados (Neon)"
                      description="Status da conexão com a nuvem."
                    />
                  </div>

                  <StatusPill />
                </SectionRow>
              </SettingsCard>

              <SettingsCard tone="danger" className="settings-danger-card">
                <div className="box-border flex w-full min-w-0 items-start gap-4">
                  <span className="settings-section-icon settings-section-icon--danger box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl !p-2">
                    <AlertCircle className="shrink-0 text-red-500" size={24} />
                  </span>

                  <CardHeader
                    title="Zona de Perigo"
                    tone="danger"
                    description="Estas ações são irreversíveis e afetarão os dados do seu workspace atual de forma permanente."
                  />
                </div>

                <div className="box-border w-full min-w-0 border-t border-red-500/10 !pt-7 sm:!pt-8">
                  <SectionRow>
                    <div className="box-border flex w-full min-w-0 flex-col gap-2">
                      <span className="min-w-0 text-lg font-bold leading-7 text-white">
                        Limpar Workspace
                      </span>
                      <span className="min-w-0 text-sm leading-6 text-gray-500">
                        Deleta todos os balões e ideias do projeto ativo.
                      </span>
                    </div>

                    <ActionButton onClick={handleClearWorkspace} variant="danger">
                      Limpar Dados
                    </ActionButton>
                  </SectionRow>
                </div>
              </SettingsCard>
            </motion.div>
          )} 
        </AnimatePresence>
      </SettingsLayout>
    </ModalShell>
  );
};
