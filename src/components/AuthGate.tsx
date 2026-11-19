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
  Loader2,
} from 'lucide-react';

interface AuthGateProps {
  mode: 'login' | 'loading' | 'unauthorized' | 'first_seed';
  userEmail?: string;
  authError?: string | null;
  hasLocalStorageBackup?: boolean;
  localBackupStats?: { catalog: number; orders: number; lots: number };
  seedingBusy?: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onMigrateLocal?: () => Promise<void>;
  onSeedExcel?: () => Promise<void>;
  onStartEmpty?: () => Promise<void>;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  mode,
  userEmail,
  authError,
  hasLocalStorageBackup,
  localBackupStats,
  seedingBusy,
  onSignIn,
  onSignOut,
  onMigrateLocal,
  onSeedExcel,
  onStartEmpty,
}) => {
  const [signingIn, setSigningIn] = useState(false);

  const handleLoginClick = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setSigningIn(false);
    }
  };

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
          <div className="pt-6 space-y-6">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[#18181B]">
                Accès sécurisé à votre espace négoce
              </h2>
              <p className="text-sm text-[#6B6A65] leading-relaxed">
                Connectez-vous avec votre compte Google pour synchroniser en
                temps réel vos stocks, domaines, commandes, factures et bilans
                sur tous vos appareils.
              </p>
            </div>

            {authError && (
              <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <button
              onClick={handleLoginClick}
              disabled={signingIn}
              className="w-full py-3 px-4 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-60 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {signingIn ? 'Connexion en cours…' : 'Se connecter avec Google'}
            </button>

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
              onClick={onSignOut}
              className="w-full py-2.5 px-4 rounded-lg border border-[#E5E4DF] bg-white hover:bg-[#F6F6F4] text-sm font-medium text-[#18181B] flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Changer de compte Google
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
