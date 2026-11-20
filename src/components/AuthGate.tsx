import React, { useState } from 'react';
import {
  Wine,
  Cloud,
  ShieldCheck,
  LogOut,
  Database,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Lock,
  User as UserIcon,
  RefreshCw,
} from 'lucide-react';

interface AuthGateProps {
  mode: 'login' | 'loading' | 'verify_email' | 'unauthorized' | 'first_seed';
  userEmail?: string;
  authError?: string | null;
  authNotice?: string | null;
  hasLocalStorageBackup?: boolean;
  localBackupStats?: { catalog: number; orders: number; lots: number };
  seedingBusy?: boolean;
  onSignIn: () => Promise<void>;
  onEmailSignIn?: (email: string, password: string) => Promise<void>;
  onEmailSignUp?: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  onPasswordReset?: (email: string) => Promise<void>;
  onCheckEmailVerified?: () => Promise<void>;
  onResendVerification?: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onMigrateLocal?: () => Promise<void>;
  onSeedExcel?: () => Promise<void>;
  onStartEmpty?: () => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  mode,
  userEmail,
  authError,
  authNotice,
  hasLocalStorageBackup,
  localBackupStats,
  seedingBusy,
  onSignIn,
  onEmailSignIn,
  onEmailSignUp,
  onPasswordReset,
  onCheckEmailVerified,
  onResendVerification,
  onSignOut,
  onMigrateLocal,
  onSeedExcel,
  onStartEmpty,
}) => {
  const [signingInGoogle, setSigningInGoogle] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [emailTab, setEmailTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localValidationError, setLocalValidationError] = useState<string | null>(
    null
  );

  const handleGoogleClick = async () => {
    setLocalValidationError(null);
    setSigningInGoogle(true);
    try {
      await onSignIn();
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalValidationError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setLocalValidationError('Veuillez saisir une adresse e-mail valide.');
      return;
    }
    if (password.length < 6) {
      setLocalValidationError(
        'Le mot de passe doit contenir au moins 6 caractères.'
      );
      return;
    }

    setEmailBusy(true);
    try {
      if (emailTab === 'signin' && onEmailSignIn) {
        await onEmailSignIn(trimmedEmail, password);
      } else if (emailTab === 'signup' && onEmailSignUp) {
        await onEmailSignUp(trimmedEmail, password, displayName.trim());
      }
    } finally {
      setEmailBusy(false);
    }
  };

  const handleResetClick = async () => {
    setLocalValidationError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setLocalValidationError(
        'Saisissez d’abord votre adresse e-mail ci-dessus pour recevoir un lien de réinitialisation.'
      );
      return;
    }
    if (!onPasswordReset) return;
    setEmailBusy(true);
    try {
      await onPasswordReset(trimmedEmail);
    } finally {
      setEmailBusy(false);
    }
  };

  const handleCheckVerifiedClick = async () => {
    if (!onCheckEmailVerified) return;
    setVerifyBusy(true);
    try {
      await onCheckEmailVerified();
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleResendClick = async () => {
    if (!onResendVerification) return;
    setResendBusy(true);
    try {
      await onResendVerification();
    } finally {
      setResendBusy(false);
    }
  };

  const displayedError = localValidationError ?? authError;

  return (
    <div className="min-h-screen bg-[#F6F6F4] flex items-center justify-center p-6 text-[#18181B]">
      <div className="w-full max-w-lg bg-white border border-[#E5E4DF] rounded-xl p-8">
        {/* Header / Brand */}
        <div className="flex items-center gap-3 pb-6 border-b border-[#E5E4DF]">
          <div className="w-10 h-10 rounded-lg bg-[#721C24] flex items-center justify-center text-white shrink-0">
            <Wine className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold leading-tight text-[#18181B]">
              Le Bon Grain d’Ivresse
            </h1>
            <p className="text-xs text-[#6B6A65] mt-0.5">
              Négoce, Allocations &amp; Pilotage de Cave · Cloud v2
            </p>
          </div>
        </div>

        {mode === 'loading' && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-6 h-6 text-[#721C24] animate-spin" />
            <p className="text-sm font-medium text-[#18181B]">
              Connexion à la cave cloud…
            </p>
            <p className="text-xs text-[#6B6A65]">
              Synchronisation temps réel Firestore en cours.
            </p>
          </div>
        )}

        {mode === 'login' && (
          <div className="pt-6 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[#18181B]">
                Accès sécurisé à votre espace négoce
              </h2>
              <p className="text-sm text-[#6B6A65] leading-relaxed">
                Connectez-vous avec votre compte Google ou votre adresse e-mail
                autorisée pour accéder à vos stocks, domaines, commandes et
                bilans synchronisés.
              </p>
            </div>

            {displayedError && (
              <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{displayedError}</span>
              </div>
            )}

            {authNotice && (
              <div className="p-3 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#15803D] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authNotice}</span>
              </div>
            )}

            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={signingInGoogle || emailBusy}
              className="w-full py-2.5 px-4 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-60 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
            >
              {signingInGoogle ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {signingInGoogle
                ? 'Connexion Google en cours…'
                : 'Se connecter avec Google'}
            </button>

            {/* Divider */}
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-[#E5E4DF]" />
              <span className="shrink-0 px-3 text-[11px] uppercase tracking-wider text-[#9E9B93]">
                ou par e-mail (@live.fr, @outlook.fr…)
              </span>
              <div className="flex-grow border-t border-[#E5E4DF]" />
            </div>

            {/* Email / Password Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#F6F6F4] border border-[#E5E4DF]">
              <button
                type="button"
                onClick={() => {
                  setEmailTab('signin');
                  setLocalValidationError(null);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  emailTab === 'signin'
                    ? 'bg-white text-[#18181B] shadow-xs border border-[#E5E4DF]'
                    : 'text-[#6B6A65] hover:text-[#18181B]'
                }`}
              >
                J’ai déjà un mot de passe
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmailTab('signup');
                  setLocalValidationError(null);
                }}
                className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  emailTab === 'signup'
                    ? 'bg-white text-[#18181B] shadow-xs border border-[#E5E4DF]'
                    : 'text-[#6B6A65] hover:text-[#18181B]'
                }`}
              >
                Première connexion
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {emailTab === 'signup' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-xs font-medium text-[#18181B] mb-1"
                  >
                    Prénom et nom (optionnel)
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-[#9E9B93] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex : Romain Becker"
                      autoComplete="name"
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E5E4DF] bg-white focus:outline-none focus:border-[#721C24]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-medium text-[#18181B] mb-1"
                >
                  Adresse e-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#9E9B93] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="romain.becker@live.fr"
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E5E4DF] bg-white focus:outline-none focus:border-[#721C24]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-[#18181B]"
                  >
                    Mot de passe
                  </label>
                  {emailTab === 'signin' && onPasswordReset && (
                    <button
                      type="button"
                      onClick={handleResetClick}
                      disabled={emailBusy}
                      className="text-[11px] text-[#721C24] hover:underline cursor-pointer"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#9E9B93] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      emailTab === 'signup'
                        ? 'Choisissez un mot de passe (6 car. min.)'
                        : 'Votre mot de passe'
                    }
                    autoComplete={
                      emailTab === 'signup' ? 'new-password' : 'current-password'
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E5E4DF] bg-white focus:outline-none focus:border-[#721C24]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={emailBusy || signingInGoogle}
                className="w-full py-2.5 px-4 rounded-lg border border-[#18181B] bg-[#18181B] hover:bg-[#2E2E32] disabled:opacity-60 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {emailBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {emailBusy
                  ? 'Validation en cours…'
                  : emailTab === 'signup'
                    ? 'Créer mon accès par e-mail'
                    : 'Se connecter par e-mail'}
              </button>

              {emailTab === 'signup' && (
                <p className="text-[11px] text-[#6B6A65] leading-relaxed">
                  Un e-mail de confirmation vous sera envoyé pour vérifier que
                  l’adresse vous appartient avant d’ouvrir la cave cloud.
                </p>
              )}
            </form>

            <div className="pt-4 border-t border-[#E5E4DF] grid grid-cols-2 gap-3 text-xs text-[#6B6A65]">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#721C24] shrink-0 mt-0.5" />
                <span>Accès restreint aux membres invités de l’équipe</span>
              </div>
              <div className="flex items-start gap-2">
                <Database className="w-4 h-4 text-[#721C24] shrink-0 mt-0.5" />
                <span>Sauvegarde cloud multi-appareils instantanée</span>
              </div>
            </div>
          </div>
        )}

        {mode === 'verify_email' && (
          <div className="pt-6 space-y-5">
            <div className="p-4 rounded-lg bg-[#FDF8F8] border border-[#E5C5C8] space-y-2">
              <div className="font-semibold text-sm text-[#721C24] flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                Confirmez votre adresse e-mail
              </div>
              <p className="text-xs text-[#18181B] leading-relaxed">
                Un lien de vérification a été envoyé à{' '}
                <strong className="font-mono">{userEmail}</strong>. Cliquez sur
                ce lien dans votre boîte de réception (pensez à vérifier vos
                courriers indésirables), puis cliquez sur le bouton ci-dessous.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {authNotice && (
              <div className="p-3 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#15803D] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authNotice}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleCheckVerifiedClick}
                disabled={verifyBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-60 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {verifyBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                J’ai validé mon e-mail — ouvrir l’application
              </button>

              <button
                type="button"
                onClick={handleResendClick}
                disabled={resendBusy}
                className="w-full py-2 px-4 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#F6F6F4] disabled:opacity-60 text-xs font-medium text-[#18181B] flex items-center justify-center gap-2 cursor-pointer"
              >
                {resendBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mail className="w-3.5 h-3.5" />
                )}
                Renvoyer l’e-mail de confirmation
              </button>

              <button
                type="button"
                onClick={onSignOut}
                className="w-full py-2 px-4 rounded-lg text-xs font-medium text-[#6B6A65] hover:text-[#18181B] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Changer de compte
              </button>
            </div>
          </div>
        )}

        {mode === 'unauthorized' && (
          <div className="pt-6 space-y-5">
            <div className="p-4 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-sm text-[#92400E] space-y-1.5">
              <div className="font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Compte non invité dans cet espace
              </div>
              <p className="text-xs leading-relaxed">
                Vous êtes connecté en tant que{' '}
                <strong className="font-mono">{userEmail}</strong>, mais cette
                adresse ne figure pas encore parmi les membres autorisés de{' '}
                <strong>Le Bon Grain d’Ivresse</strong>.
              </p>
            </div>

            <p className="text-xs text-[#6B6A65] leading-relaxed">
              Demandez à l’administrateur d’ajouter votre email dans l’onglet{' '}
              <strong>Paramètres → Équipe &amp; Accès</strong>, puis reconnectez-vous.
            </p>

            <button
              type="button"
              onClick={onSignOut}
              className="w-full py-2.5 px-4 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#F6F6F4] text-sm font-medium text-[#18181B] flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Changer de compte
            </button>
          </div>
        )}

        {mode === 'first_seed' && (
          <div className="pt-6 space-y-5">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-[#18181B]">
                Initialiser votre base cloud Firebase
              </h2>
              <p className="text-xs text-[#6B6A65] leading-relaxed">
                Votre espace partagé est prêt et vide. Choisissez les données de
                départ à importer dans Firestore (modifiable ensuite dans
                Paramètres).
              </p>
            </div>

            <div className="space-y-3">
              {hasLocalStorageBackup && onMigrateLocal && (
                <button
                  type="button"
                  onClick={onMigrateLocal}
                  disabled={seedingBusy}
                  className="w-full p-4 rounded-lg border-2 border-[#721C24] bg-[#FDF8F8] hover:bg-[#FAF0F0] text-left transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <Upload className="w-5 h-5 text-[#721C24] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-[#721C24]">
                        Migrer mes données locales existantes (Recommandé)
                      </div>
                      <p className="text-xs text-[#6B6A65] mt-0.5">
                        Transfère votre base v1 détectée sur ce navigateur (
                        {localBackupStats?.catalog ?? 0} cuvées ·{' '}
                        {localBackupStats?.orders ?? 0} lignes commandes ·{' '}
                        {localBackupStats?.lots ?? 0} lots) vers le cloud.
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {onSeedExcel && (
                <button
                  type="button"
                  onClick={onSeedExcel}
                  disabled={seedingBusy}
                  className="w-full p-4 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#F6F6F4] text-left transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-[#18181B] shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-[#18181B]">
                        Charger le référentiel Excel LBG
                      </div>
                      <p className="text-xs text-[#6B6A65] mt-0.5">
                        Importe le catalogue, les domaines, les fiches clients,
                        les ventes HelloAsso et le planning de campagnes.
                      </p>
                    </div>
                  </div>
                </button>
              )}

              {onStartEmpty && (
                <button
                  type="button"
                  onClick={onStartEmpty}
                  disabled={seedingBusy}
                  className="w-full py-2.5 px-4 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#F6F6F4] text-xs font-medium text-[#6B6A65] hover:text-[#18181B] transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Démarrer avec un espace vierge
                </button>
              )}
            </div>

            {seedingBusy && (
              <div className="flex items-center justify-center gap-2 text-xs text-[#721C24] pt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Importation vers Firestore en cours…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
