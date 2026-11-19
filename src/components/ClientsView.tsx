import React, { useMemo, useState } from 'react';
import {
  Search,
  Printer,
  Copy,
  Check,
  UserPlus,
  Edit3,
  GitMerge,
  Mail,
  Phone,
  Building2,
  X,
  CheckCircle2,
  Wallet,
} from 'lucide-react';
import {
  AppSettings,
  CustomerProfile,
  CustomerSummary,
  CustomerType,
} from '../types/wine';
import {
  formatDateFR,
  formatEUR,
  formatPct,
  maskClientName,
  maskEmail,
  normalizeSearchText,
} from '../utils/wineMath';

interface ClientsViewProps {
  customers: CustomerSummary[];
  settings: AppSettings;
  onSaveCustomerProfile: (profile: CustomerProfile) => Promise<void>;
  onMergeCustomers: (
    source: CustomerSummary,
    target: CustomerSummary
  ) => Promise<void>;
  onMarkCustomerReadyDelivered: (customer: CustomerSummary) => Promise<void>;
}

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  particulier: 'Particulier',
  club: 'Membre Club',
  pro: 'Professionnel (B2B)',
};

export const ClientsView: React.FC<ClientsViewProps> = ({
  customers,
  settings,
  onSaveCustomerProfile,
  onMergeCustomers,
  onMarkCustomerReadyDelivered,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | CustomerType | 'impayes'>('all');
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);

  // Create / Edit Profile Modal
  const [editingProfile, setEditingProfile] = useState<CustomerProfile | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(false);

  // Merge duplicate modal
  const [mergeSource, setMergeSource] = useState<CustomerSummary | null>(null);
  const [mergeTargetKey, setMergeTargetKey] = useState<string>('');
  const [merging, setMerging] = useState(false);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return customers.filter((c) => {
      if (typeFilter === 'impayes') {
        if (c.resteAEncaisserTTC <= 0.01) return false;
      } else if (typeFilter !== 'all' && c.customerType !== typeFilter) {
        return false;
      }
      if (!q) return true;
      const hay = normalizeSearchText(
        `${c.prenom} ${c.nom} ${c.companyName ?? ''} ${c.email} ${c.phone ?? ''} ${c.domainesFavoris.join(' ')}`
      );
      return hay.includes(q);
    });
  }, [customers, search, typeFilter]);

  const activeClient =
    customers.find((c) => c.key === selectedKey) ?? filtered[0] ?? null;

  const openNewCustomer = () => {
    setIsNewProfile(true);
    setEditingProfile({
      id: `cust_${Date.now()}`,
      customerType: 'club',
      nom: '',
      prenom: '',
      companyName: '',
      siret: '',
      vatNumber: '',
      email: '',
      phone: '',
      billingAddress: '',
      shippingAddress: '',
      notes: '',
    });
  };

  const openEditCustomer = (c: CustomerSummary) => {
    setIsNewProfile(!c.profileId);
    setEditingProfile({
      id:
        c.profileId ??
        `cust_${normalizeSearchText(`${c.nom}_${c.prenom}`).replace(/[^a-z0-9]+/g, '_')}_${Date.now().toString().slice(-4)}`,
      customerType: c.customerType,
      nom: c.nom,
      prenom: c.prenom,
      companyName: c.companyName ?? '',
      siret: c.siret ?? '',
      vatNumber: c.vatNumber ?? '',
      email: c.email,
      phone: c.phone ?? '',
      billingAddress: c.billingAddress ?? '',
      shippingAddress: c.shippingAddress ?? '',
      notes: c.notes ?? '',
      mergedEmails: c.mergedEmails,
    });
  };

  const copyWhatsAppRecap = (c: CustomerSummary) => {
    const ready = c.orders.filter((o) => o.statut === 'recu_lbg');
    const waiting = c.orders.filter((o) => o.statut === 'attente_reception');
    const lines: string[] = [
      `Bonjour ${c.prenom || c.nom},`,
      '',
    ];
    if (ready.length > 0) {
      lines.push('Vos bouteilles prêtes en cave à récupérer :');
      for (const o of ready) {
        lines.push(`• ${o.qte}× ${o.produitLabel} (${o.vente})`);
      }
      lines.push('');
    }
    if (waiting.length > 0) {
      lines.push('En attente de réception domaine :');
      for (const o of waiting) {
        lines.push(`• ${o.qte}× ${o.produitLabel} (${o.vente})`);
      }
      lines.push('');
    }
    if (c.resteAEncaisserTTC > 0.01) {
      lines.push(`Solde restant à régler : ${formatEUR(c.resteAEncaisserTTC)} TTC.`);
      if (settings.companyIban) {
        lines.push(`IBAN : ${settings.companyIban}`);
      }
      lines.push('');
    }
    lines.push(
      `À très vite,\n${settings.companyName || "Le Bon Grain d'Ivresse"}${settings.companyPhone ? ` · ${settings.companyPhone}` : ''}`
    );

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedWhatsApp(true);
    setTimeout(() => setCopiedWhatsApp(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            CRM Clients &amp; Relances
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Particuliers, membres Club et clients Pros (SIRET/TVA), soldes à encaisser et récapitulatifs clients.
          </p>
        </div>
        <button
          onClick={openNewCustomer}
          className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Nouveau client
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: customer list (hidden on print) */}
        <div className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden flex flex-col max-h-[720px] no-print">
          <div className="p-3 border-b border-[#E5E4DF] space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#6B6A65] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, société, email, domaine…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E4DF] rounded-lg"
              />
            </div>
            <div className="flex flex-wrap gap-1 text-[11px]">
              {(
                [
                  ['all', 'Tous'],
                  ['club', 'Club'],
                  ['particulier', 'Particuliers'],
                  ['pro', 'Pros'],
                  ['impayes', 'Impayés'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTypeFilter(id)}
                  className={`px-2 py-1 rounded font-medium cursor-pointer ${
                    typeFilter === id
                      ? 'bg-[#721C24] text-white'
                      : 'text-[#6B6A65] hover:bg-[#F6F6F4]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#E5E4DF] overflow-y-auto flex-1">
            {filtered.map((c, idx) => {
              const isSelected = activeClient?.key === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelectedKey(c.key)}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#FDF8F8] border-l-2 border-l-[#721C24]'
                      : 'hover:bg-[#F6F6F4]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-[#18181B]">
                      {maskClientName(
                        c.prenom,
                        c.nom,
                        settings.anonymizeClients,
                        idx
                      )}
                    </div>
                    <span className="font-mono text-xs font-semibold text-[#18181B]">
                      {formatEUR(c.caTotalTTC)}
                    </span>
                  </div>
                  <div className="text-xs text-[#6B6A65] mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate">
                      {c.companyName
                        ? `${c.companyName} · Pro`
                        : CUSTOMER_TYPE_LABELS[c.customerType]}
                      {' · '}
                      {c.totalBouteilles} btl
                    </span>
                    {c.bouteillesPretesLBG > 0 && (
                      <span className="text-[#721C24] font-medium shrink-0">
                        {c.bouteillesPretesLBG} prêtes
                      </span>
                    )}
                  </div>
                  {c.resteAEncaisserTTC > 0.01 && (
                    <div className="text-[11px] font-mono text-[#B45309] mt-0.5">
                      Reste à payer : {formatEUR(c.resteAEncaisserTTC)}
                    </div>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-xs text-[#6B6A65]">
                Aucun client trouvé.
              </div>
            )}
          </div>
        </div>

        {/* Right column: customer sheet (cleanly printable without internal margins!) */}
        <div className="lg:col-span-8">
          {activeClient ? (
            <div className="bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
              {/* Printable header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#E5E4DF]">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#6B6A65]">
                    {CUSTOMER_TYPE_LABELS[activeClient.customerType]}
                    {activeClient.companyName ? ` · ${activeClient.companyName}` : ''}
                  </div>
                  <h2 className="font-serif text-2xl font-semibold text-[#18181B] mt-0.5">
                    {maskClientName(
                      activeClient.prenom,
                      activeClient.nom,
                      settings.anonymizeClients
                    )}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B6A65] mt-1.5">
                    {activeClient.email && (
                      <a
                        href={`mailto:${activeClient.email}`}
                        className="flex items-center gap-1 text-[#721C24] hover:underline"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {maskEmail(activeClient.email, settings.anonymizeClients)}
                      </a>
                    )}
                    {activeClient.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {activeClient.phone}
                      </span>
                    )}
                    {activeClient.siret && (
                      <span className="flex items-center gap-1 font-mono">
                        <Building2 className="w-3.5 h-3.5" />
                        SIRET {activeClient.siret}
                      </span>
                    )}
                  </div>
                  {activeClient.billingAddress && (
                    <div className="text-xs text-[#6B6A65] mt-1">
                      Adresse : {activeClient.billingAddress}
                    </div>
                  )}
                </div>

                {/* Action buttons (no-print) */}
                <div className="flex flex-wrap gap-2 no-print">
                  <button
                    onClick={() => openEditCustomer(activeClient)}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Modifier
                  </button>
                  <button
                    onClick={() => {
                      setMergeSource(activeClient);
                      setMergeTargetKey('');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Fusionner
                  </button>
                  <button
                    onClick={() => copyWhatsAppRecap(activeClient)}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    {copiedWhatsApp ? (
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedWhatsApp ? 'Copié' : 'Message WhatsApp'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 rounded-lg bg-[#721C24] text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimer bon
                  </button>
                </div>
              </div>

              {/* KPI Strip — CRITICAL: Margin KPI wrapped in no-print so client handouts NEVER leak internal margins! */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF]">
                  <div className="text-[11px] text-[#6B6A65] uppercase">Total TTC</div>
                  <div className="font-mono text-lg font-semibold mt-0.5">
                    {formatEUR(activeClient.caTotalTTC)}
                  </div>
                  <div className="text-[11px] text-[#6B6A65]">
                    {activeClient.totalCommandes} cmd · {activeClient.totalBouteilles} btl
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF]">
                  <div className="text-[11px] text-[#6B6A65] uppercase">
                    Solde à régler
                  </div>
                  <div
                    className={`font-mono text-lg font-semibold mt-0.5 ${
                      activeClient.resteAEncaisserTTC > 0.01
                        ? 'text-[#B45309]'
                        : 'text-[#15803D]'
                    }`}
                  >
                    {formatEUR(activeClient.resteAEncaisserTTC)}
                  </div>
                  <div className="text-[11px] text-[#6B6A65]">
                    {activeClient.resteAEncaisserTTC > 0.01 ? 'En attente' : 'À jour'}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF]">
                  <div className="text-[11px] text-[#6B6A65] uppercase">
                    Statut cave
                  </div>
                  <div className="font-mono text-lg font-semibold text-[#721C24] mt-0.5">
                    {activeClient.bouteillesPretesLBG} prêtes
                  </div>
                  <div className="text-[11px] text-[#6B6A65]">
                    {activeClient.bouteillesAttenteDomaine} attente ·{' '}
                    {activeClient.bouteillesRemises} remises
                  </div>
                </div>

                {/* INTERNAL ONLY — STRICTLY HIDDEN ON PRINT */}
                <div className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E5E4DF] no-print">
                  <div className="text-[11px] text-[#6B6A65] uppercase">
                    Marge générée (interne)
                  </div>
                  <div className="font-mono text-lg font-semibold text-[#15803D] mt-0.5">
                    {formatEUR(activeClient.margeTotaleEuro, true)}
                  </div>
                  <div className="text-[11px] text-[#6B6A65]">
                    Moy. {formatPct(activeClient.margeMoyennePct)}
                  </div>
                </div>
              </div>

              {activeClient.bouteillesPretesLBG > 0 && (
                <div className="p-3 rounded-lg bg-[#FDF8F8] border border-[#E5E4DF] flex items-center justify-between gap-3 text-xs no-print">
                  <span className="text-[#721C24] font-medium">
                    {activeClient.bouteillesPretesLBG} bouteille(s) reçue(s) en cave et prête(s) à remettre à ce client.
                  </span>
                  <button
                    onClick={() => onMarkCustomerReadyDelivered(activeClient)}
                    className="px-3 py-1.5 rounded bg-[#15803D] text-white font-medium flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Valider la remise
                  </button>
                </div>
              )}

              {activeClient.notes && (
                <div className="p-3 rounded-lg bg-[#F6F6F4] text-xs text-[#18181B] no-print">
                  <strong className="text-[#6B6A65]">Notes privées : </strong>
                  {activeClient.notes}
                </div>
              )}

              {/* Order lines history */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6B6A65] mb-2">
                  Historique des bouteilles ({activeClient.orders.length} lignes)
                </h3>
                <div className="border border-[#E5E4DF] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                      <tr>
                        <th className="text-left py-2 px-3">Date · Vente</th>
                        <th className="text-left py-2 px-3">Cuvée</th>
                        <th className="text-right py-2 px-2">Qté</th>
                        <th className="text-right py-2 px-3">Total TTC</th>
                        <th className="text-right py-2 px-3">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E4DF]">
                      {activeClient.orders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-2 px-3 text-xs whitespace-nowrap">
                            <div className="font-mono">{formatDateFR(o.date)}</div>
                            <div className="text-[#6B6A65]">{o.vente}</div>
                          </td>
                          <td className="py-2 px-3 text-[#18181B]">{o.produitLabel}</td>
                          <td className="py-2 px-2 text-right font-mono">{o.qte}</td>
                          <td className="py-2 px-3 text-right font-mono">
                            {formatEUR(o.prixUnitaireTTC * o.qte)}
                          </td>
                          <td className="py-2 px-3 text-right text-xs">
                            {o.statut === 'remis_client' ? (
                              <span className="text-[#15803D]">Remis</span>
                            ) : o.statut === 'recu_lbg' ? (
                              <span className="text-[#721C24] font-medium">Prêt LBG</span>
                            ) : o.statut === 'attente_reception' ? (
                              <span className="text-[#B45309]">En attente</span>
                            ) : (
                              <span className="text-[#6B6A65] line-through">Annulé</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#E5E4DF] rounded-xl p-12 text-center text-sm text-[#6B6A65]">
              Sélectionnez un client pour consulter son historique et ses relances.
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit CRM Profile Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editingProfile.nom.trim()) return;
              await onSaveCustomerProfile(editingProfile);
              setEditingProfile(null);
            }}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4 text-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                {isNewProfile ? 'Nouvelle fiche client' : 'Modifier la fiche client'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Type de client
                </label>
                <div className="flex gap-2">
                  {(['club', 'particulier', 'pro'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setEditingProfile({ ...editingProfile, customerType: t })
                      }
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium cursor-pointer ${
                        editingProfile.customerType === t
                          ? 'border-[#721C24] bg-[#FDF8F8] text-[#721C24]'
                          : 'border-[#E5E4DF] text-[#6B6A65]'
                      }`}
                    >
                      {CUSTOMER_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Prénom
                </label>
                <input
                  value={editingProfile.prenom}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, prenom: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Nom *
                </label>
                <input
                  required
                  value={editingProfile.nom}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, nom: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>

              {editingProfile.customerType === 'pro' && (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                      Raison sociale (Restaurant / Caviste / Société)
                    </label>
                    <input
                      value={editingProfile.companyName ?? ''}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          companyName: e.target.value || undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                      SIRET
                    </label>
                    <input
                      value={editingProfile.siret ?? ''}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          siret: e.target.value || undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                      N° TVA Intracom
                    </label>
                    <input
                      value={editingProfile.vatNumber ?? ''}
                      onChange={(e) =>
                        setEditingProfile({
                          ...editingProfile,
                          vatNumber: e.target.value || undefined,
                        })
                      }
                      className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editingProfile.email}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Téléphone / WhatsApp
                </label>
                <input
                  value={editingProfile.phone ?? ''}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      phone: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Adresse de facturation
                </label>
                <input
                  value={editingProfile.billingAddress ?? ''}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      billingAddress: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Adresse de livraison (si différente)
                </label>
                <input
                  value={editingProfile.shippingAddress ?? ''}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      shippingAddress: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Notes privées (goûts, allocations souhaitées, livraisons)
                </label>
                <textarea
                  rows={2}
                  value={editingProfile.notes ?? ''}
                  onChange={(e) =>
                    setEditingProfile({
                      ...editingProfile,
                      notes: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DF]">
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-[#721C24] text-white font-medium cursor-pointer"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Duplicate Customer Modal */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-md p-6 space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                Fusionner un doublon client
              </h3>
              <button
                onClick={() => setMergeSource(null)}
                className="p-1 text-[#6B6A65] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#6B6A65] leading-relaxed">
              Toutes les commandes de{' '}
              <strong className="text-[#18181B]">
                {mergeSource.prenom} {mergeSource.nom} ({mergeSource.email || 'sans email'})
              </strong>{' '}
              seront rattachées au client principal choisi ci-dessous.
            </p>

            <div>
              <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                Client principal à conserver
              </label>
              <select
                value={mergeTargetKey}
                onChange={(e) => setMergeTargetKey(e.target.value)}
                className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg bg-white"
              >
                <option value="">— Choisir le client cible —</option>
                {customers
                  .filter((c) => c.key !== mergeSource.key)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.prenom} {c.nom} {c.email ? `(${c.email})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E4DF]">
              <button
                onClick={() => setMergeSource(null)}
                className="px-4 py-2 rounded-lg border border-[#E5E4DF] cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={!mergeTargetKey || merging}
                onClick={async () => {
                  const target = customers.find((c) => c.key === mergeTargetKey);
                  if (!target) return;
                  setMerging(true);
                  try {
                    await onMergeCustomers(mergeSource, target);
                    setSelectedKey(target.key);
                    setMergeSource(null);
                  } finally {
                    setMerging(false);
                  }
                }}
                className="px-4 py-2 rounded-lg bg-[#721C24] disabled:opacity-50 text-white font-medium cursor-pointer"
              >
                {merging ? 'Fusion…' : 'Confirmer la fusion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
