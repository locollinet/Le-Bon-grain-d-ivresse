import React, { useRef, useState } from 'react';
import {
  Building2,
  Sliders,
  Users,
  Database,
  Save,
  UserPlus,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Sparkles,
  Check,
  Shield,
  AlertCircle,
} from 'lucide-react';
import {
  AppSettings,
  WorkspaceInvite,
  WorkspaceMember,
} from '../types/wine';

interface SettingsViewProps {
  settings: AppSettings;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  currentMember: WorkspaceMember;
  isDemoActive: boolean;
  onSaveSettings: (next: AppSettings) => Promise<void>;
  onCreateInvite: (email: string, role: 'admin' | 'operator') => Promise<void>;
  onDeleteInvite: (email: string) => Promise<void>;
  onUpdateMemberRole: (member: WorkspaceMember, role: 'admin' | 'operator') => Promise<void>;
  onRemoveMember: (uid: string) => Promise<void>;
  onExportBackup: () => void;
  onImportBackup: (file: File) => Promise<void>;
  onResetExcel: () => Promise<void>;
  onToggleDemo: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  members,
  invites,
  currentMember,
  isDemoActive,
  onSaveSettings,
  onCreateInvite,
  onDeleteInvite,
  onUpdateMemberRole,
  onRemoveMember,
  onExportBackup,
  onImportBackup,
  onResetExcel,
  onToggleDemo,
}) => {
  const [form, setForm] = useState<AppSettings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Team invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'operator'>('operator');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Backup / Reset
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const isAdmin = currentMember.role === 'admin';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next: AppSettings = {
        ...form,
        fraisLogistiqueParBouteille: Number(
          ((form.fraisLogistiqueAmont || 0) + (form.fraisLogistiqueAval || 0)).toFixed(2)
        ),
      };
      await onSaveSettings(next);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    const cleaned = inviteEmail.trim().toLowerCase();
    if (!cleaned || !cleaned.includes('@')) {
      setInviteError('Veuillez saisir une adresse email Google valide.');
      return;
    }
    setInviteBusy(true);
    try {
      await onCreateInvite(cleaned, inviteRole);
      setInviteEmail('');
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Impossible d'envoyer l'invitation."
      );
    } finally {
      setInviteBusy(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupMessage('Importation de la sauvegarde JSON en cours…');
    try {
      await onImportBackup(file);
      setBackupMessage('Sauvegarde importée et synchronisée sur Firestore.');
    } catch (err) {
      setBackupMessage(
        err instanceof Error ? `Erreur : ${err.message}` : "Erreur lors de l'import."
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
          Paramètres &amp; Administration
        </h1>
        <p className="text-sm text-[#6B6A65] mt-1">
          Mentions légales de facturation, paramètres tarifaires, accès équipe Firebase et sauvegardes.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 1. Legal & Company info */}
        <section className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E5E4DF]">
            <Building2 className="w-5 h-5 text-[#721C24]" />
            <h2 className="font-serif text-xl font-semibold">
              Identité légale &amp; Facturation
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Raison sociale
              </label>
              <input
                value={form.companyName ?? ''}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Forme juridique
              </label>
              <input
                value={form.companyLegalForm ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyLegalForm: e.target.value })
                }
                placeholder="SAS, SARL, EI…"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Capital social
              </label>
              <input
                value={form.companyCapital ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyCapital: e.target.value })
                }
                placeholder="10 000 €"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                SIRET
              </label>
              <input
                value={form.companySiret ?? ''}
                onChange={(e) => setForm({ ...form, companySiret: e.target.value })}
                placeholder="XXX XXX XXX XXXXX"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                RCS / Ville d’immatriculation
              </label>
              <input
                value={form.companyRcs ?? ''}
                onChange={(e) => setForm({ ...form, companyRcs: e.target.value })}
                placeholder="RCS Paris B 123 456 789"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                N° TVA Intracommunautaire
              </label>
              <input
                value={form.companyVatNumber ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyVatNumber: e.target.value })
                }
                placeholder="FR XX XXXXXXXXX"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Adresse du siège social
              </label>
              <input
                value={form.companyAddress ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyAddress: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                IBAN (affiché sur factures en attente de virement)
              </label>
              <input
                value={form.companyIban ?? ''}
                onChange={(e) => setForm({ ...form, companyIban: e.target.value })}
                placeholder="FR76 XXXX XXXX XXXX XXXX XXXX XXX"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                BIC
              </label>
              <input
                value={form.companyBic ?? ''}
                onChange={(e) => setForm({ ...form, companyBic: e.target.value })}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Email de contact
              </label>
              <input
                type="email"
                value={form.companyEmail ?? ''}
                onChange={(e) => setForm({ ...form, companyEmail: e.target.value })}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Téléphone / WhatsApp
              </label>
              <input
                value={form.companyPhone ?? ''}
                onChange={(e) => setForm({ ...form, companyPhone: e.target.value })}
                placeholder="+33 6 …"
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Site web
              </label>
              <input
                value={form.companyWebsite ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyWebsite: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Mentions légales de pied de facture (alcool, pénalités de retard, recouvrement)
              </label>
              <textarea
                rows={2}
                value={form.companyLegalLine ?? ''}
                onChange={(e) =>
                  setForm({ ...form, companyLegalLine: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg text-xs"
              />
            </div>
          </div>
        </section>

        {/* 2. Pricing & Showcase defaults */}
        <section className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#E5E4DF]">
            <Sliders className="w-5 h-5 text-[#721C24]" />
            <h2 className="font-serif text-xl font-semibold">
              Tarification, Logistique &amp; Carte des vins
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                TVA standard (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="30"
                value={Number((form.tvaRate * 100).toFixed(2))}
                onChange={(e) =>
                  setForm({ ...form, tvaRate: (Number(e.target.value) || 0) / 100 })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Logistique amont (€ HT/btl)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.fraisLogistiqueAmont}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fraisLogistiqueAmont: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Logistique aval (€ HT/btl)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={form.fraisLogistiqueAval}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fraisLogistiqueAval: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Taux de marque cible EXW (%)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="75"
                value={Number((form.tauxMarqueCibleExw * 100).toFixed(1))}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tauxMarqueCibleExw: (Number(e.target.value) || 0) / 100,
                  })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Titre de la Carte des vins
              </label>
              <input
                value={form.showcaseTitle ?? ''}
                onChange={(e) =>
                  setForm({ ...form, showcaseTitle: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Sous-titre de la Carte des vins
              </label>
              <input
                value={form.showcaseSubtitle ?? ''}
                onChange={(e) =>
                  setForm({ ...form, showcaseSubtitle: e.target.value })
                }
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.anonymizeClients}
                onChange={(e) =>
                  setForm({ ...form, anonymizeClients: e.target.checked })
                }
                className="accent-[#721C24]"
              />
              Anonymiser les noms/emails clients à l’écran (mode démonstration RGPD)
            </label>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {savedToast && (
            <span className="text-xs text-[#15803D] font-medium flex items-center gap-1">
              <Check className="w-4 h-4" />
              Paramètres enregistrés et synchronisés
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-60 text-white text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
          </button>
        </div>
      </form>

      {/* 3. Team & Firebase Access */}
      <section className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#721C24]" />
            <h2 className="font-serif text-xl font-semibold">
              Équipe &amp; Accès Firebase
            </h2>
          </div>
          <span className="text-xs text-[#6B6A65] font-mono">
            {members.length} membre{members.length > 1 ? 's' : ''} actif{members.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="divide-y divide-[#E5E4DF] border border-[#E5E4DF] rounded-lg">
          {members.map((m) => (
            <div
              key={m.uid}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
            >
              <div>
                <div className="font-medium text-[#18181B] flex items-center gap-2">
                  {m.displayName}
                  {m.uid === currentMember.uid && (
                    <span className="text-xs text-[#6B6A65]">(Vous)</span>
                  )}
                </div>
                <div className="text-xs font-mono text-[#6B6A65]">{m.email}</div>
              </div>

              <div className="flex items-center gap-2">
                {isAdmin && m.uid !== currentMember.uid ? (
                  <>
                    <select
                      value={m.role}
                      onChange={(e) =>
                        onUpdateMemberRole(m, e.target.value as 'admin' | 'operator')
                      }
                      className="text-xs border border-[#E5E4DF] rounded-lg px-2.5 py-1.5"
                    >
                      <option value="operator">Opérateur</option>
                      <option value="admin">Administrateur</option>
                    </select>
                    <button
                      onClick={() => onRemoveMember(m.uid)}
                      title="Révoquer l'accès"
                      className="p-1.5 text-[#6B6A65] hover:text-[#B91C1C] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-medium text-[#721C24] flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    {m.role === 'admin' ? 'Administrateur' : 'Opérateur'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="pt-2 space-y-3">
            <form
              onSubmit={handleInviteSubmit}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email Google du collaborateur à inviter (ex: romain@...)"
                className="flex-1 px-3 py-2 text-sm border border-[#E5E4DF] rounded-lg"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as 'admin' | 'operator')
                }
                className="px-3 py-2 text-sm border border-[#E5E4DF] rounded-lg bg-white"
              >
                <option value="operator">Opérateur</option>
                <option value="admin">Administrateur</option>
              </select>
              <button
                type="submit"
                disabled={inviteBusy}
                className="px-4 py-2 rounded-lg bg-[#18181B] hover:bg-[#3F3F46] text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Inviter
              </button>
            </form>

            {inviteError && (
              <div className="text-xs text-[#B91C1C] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {inviteError}
              </div>
            )}

            {invites.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
                  Invitations en attente de première connexion
                </div>
                <div className="divide-y divide-[#E5E4DF] border border-[#E5E4DF] rounded-lg">
                  {invites.map((inv) => (
                    <div
                      key={inv.email}
                      className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono text-[#18181B]">{inv.email}</span>
                        <span className="text-[#6B6A65] ml-2">
                          · Rôle : {inv.role === 'admin' ? 'Administrateur' : 'Opérateur'}
                        </span>
                      </div>
                      <button
                        onClick={() => onDeleteInvite(inv.email)}
                        className="text-[#B91C1C] hover:underline cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. Backup & Data Maintenance */}
      <section className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#E5E4DF]">
          <Database className="w-5 h-5 text-[#721C24]" />
          <h2 className="font-serif text-xl font-semibold">
            Sauvegardes &amp; Données de référence
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onExportBackup}
            className="px-4 py-2 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Exporter sauvegarde JSON
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-sm font-medium flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Importer sauvegarde JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={onToggleDemo}
            className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 cursor-pointer ${
              isDemoActive
                ? 'border-[#721C24] bg-[#FDF8F8] text-[#721C24]'
                : 'border-[#E5E4DF] hover:bg-[#F6F6F4] text-[#18181B]'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {isDemoActive ? 'Retirer les lots Démo' : 'Ajouter scénario Démo Tissot'}
          </button>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 rounded-lg border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2] text-sm font-medium flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Réinitialiser sur Excel LBG
            </button>
          ) : (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs">
              <span className="text-[#B91C1C] font-medium">
                Confirmer la réinitialisation ? (Les factures émises restent intactes)
              </span>
              <button
                type="button"
                onClick={async () => {
                  setConfirmReset(false);
                  await onResetExcel();
                  setBackupMessage('Référentiel Excel LBG rechargé dans Firestore.');
                }}
                className="px-2.5 py-1 rounded bg-[#B91C1C] text-white font-medium cursor-pointer"
              >
                Oui, réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2.5 py-1 rounded bg-white border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {backupMessage && (
          <div className="text-xs text-[#6B6A65] pt-1">{backupMessage}</div>
        )}
      </section>
    </div>
  );
};
