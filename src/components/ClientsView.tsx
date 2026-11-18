import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  PackageCheck,
  Printer,
  Search,
} from 'lucide-react';
import {
  AppSettings,
  CustomerSummary,
  OrderLine,
  OrderStatus,
  WineCatalogItem,
} from '../types/wine';
import {
  computeCustomerSummaries,
  formatDateFR,
  formatEUR,
  formatPct,
  maskClientName,
  maskEmail,
  normalizeSearchText,
} from '../utils/wineMath';

interface ClientsViewProps {
  orders: OrderLine[];
  catalog: WineCatalogItem[];
  settings: AppSettings;
  initialFocus?: { clientKey?: string; search?: string } | null;
  onUpdateSettings: (next: AppSettings) => void;
  onMarkClientReadyDelivered: (clientEmailOrKey: string) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({
  orders,
  catalog,
  settings,
  initialFocus,
  onUpdateSettings,
  onMarkClientReadyDelivered,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'waiting'>('all');
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(
    null
  );
  const [copiedSummary, setCopiedSummary] = useState(false);

  useEffect(() => {
    if (!initialFocus) return;
    if (initialFocus.search !== undefined) setSearch(initialFocus.search);
    if (initialFocus.clientKey) setSelectedClientKey(initialFocus.clientKey);
  }, [initialFocus]);

  const catalogMap = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const customers = useMemo(
    () => computeCustomerSummaries(orders, catalogMap, settings),
    [orders, catalogMap, settings]
  );

  const filteredCustomers = useMemo(() => {
    const q = normalizeSearchText(search);
    return customers.filter((c) => {
      if (statusFilter === 'ready' && c.bouteillesPretesLBG <= 0) return false;
      if (statusFilter === 'waiting' && c.bouteillesAttenteDomaine <= 0) return false;
      if (!q) return true;
      const hay = normalizeSearchText(
        `${c.prenom} ${c.nom} ${c.email} ${c.domainesFavoris.join(' ')}`
      );
      return hay.includes(q);
    });
  }, [customers, search, statusFilter]);

  const readyClientsCount = useMemo(
    () => customers.filter((c) => c.bouteillesPretesLBG > 0).length,
    [customers]
  );

  const selectedCustomer: CustomerSummary | null = useMemo(() => {
    if (selectedClientKey) {
      return (
        customers.find((c) => c.key === selectedClientKey) ??
        filteredCustomers[0] ??
        null
      );
    }
    return filteredCustomers[0] ?? null;
  }, [customers, filteredCustomers, selectedClientKey]);

  const handleCopyRecap = () => {
    if (!selectedCustomer) return;
    const readyLines = selectedCustomer.orders.filter(
      (o) => o.statut === 'recu_lbg'
    );
    const waitingLines = selectedCustomer.orders.filter(
      (o) => o.statut === 'attente_reception'
    );

    const lines: string[] = [
      `Bonjour ${selectedCustomer.prenom || selectedCustomer.nom},`,
      `Voici le point sur vos réservations Le Bon Grain d'Ivresse :`,
      '',
    ];

    if (readyLines.length > 0) {
      lines.push('Bouteilles reçues et prêtes à être remises :');
      readyLines.forEach((o) => {
        lines.push(`- ${o.qte}x ${o.produitLabel} (${o.vente})`);
      });
      lines.push('');
    }

    if (waitingLines.length > 0) {
      lines.push('Bouteilles encore en attente de réception domaine :');
      waitingLines.forEach((o) => {
        lines.push(`- ${o.qte}x ${o.produitLabel} (${o.vente})`);
      });
      lines.push('');
    }

    lines.push('À très vite,\nRomain — Le Bon Grain d’Ivresse');

    const text = lines.join('\n');
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore clipboard restrictions
    }
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const statusText = (s: OrderStatus) => {
    if (s === 'attente_reception') return 'En attente domaine';
    if (s === 'recu_lbg') return 'Reçu par LBG (prêt)';
    if (s === 'remis_client') return 'Remis';
    return 'Annulé';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-display text-3xl font-semibold text-[#141413] tracking-tight">
            Rapports d’achat par client
          </h1>
          <p className="text-sm text-[#6B6B66] mt-1">
            Historique consolidé, marge générée par client et suivi des
            bouteilles prêtes à remettre.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() =>
              onUpdateSettings({
                ...settings,
                anonymizeClients: !settings.anonymizeClients,
              })
            }
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              settings.anonymizeClients
                ? 'bg-[#141413] text-white border-[#141413]'
                : 'bg-white text-[#141413] border-[#D8D6D0] hover:bg-[#F6F6F4]'
            }`}
          >
            {settings.anonymizeClients ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span>
              {settings.anonymizeClients
                ? 'Noms masqués (Confidentialité)'
                : 'Masquer noms clients'}
            </span>
          </button>

          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-[#6B6B66] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client..."
              className="pl-9 pr-3 py-2 text-sm bg-white border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] w-full"
            />
          </div>
        </div>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Client Directory Table */}
        <div className="xl:col-span-6 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden no-print">
          <div className="px-5 py-3.5 border-b border-[#E5E4DF] flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F6F4] rounded-lg">
              {(
                [
                  ['all', `Tous (${customers.length})`],
                  ['ready', `À remettre (${readyClientsCount})`],
                  ['waiting', 'En attente'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === key
                      ? 'bg-white text-[#141413] shadow-sm'
                      : 'text-[#6B6B66] hover:text-[#141413]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-[#6B6B66]">
              Trié par CA total TTC
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAF9F7] text-xs text-[#6B6B66] border-b border-[#E5E4DF]">
                  <th className="py-2.5 px-4 font-medium">Client</th>
                  <th className="py-2.5 px-3 font-medium text-right">Btl</th>
                  <th className="py-2.5 px-3 font-medium text-right">
                    CA TTC
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">Marge</th>
                  <th className="py-2.5 px-4 font-medium text-right">
                    À remettre
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEAE4]">
                {filteredCustomers.map((c, idx) => {
                  const isSelected = selectedCustomer?.key === c.key;
                  return (
                    <tr
                      key={c.key}
                      onClick={() => setSelectedClientKey(c.key)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#721C24]/6'
                          : 'hover:bg-[#FAF9F7]'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#141413]">
                          {maskClientName(
                            c.prenom,
                            c.nom,
                            settings.anonymizeClients,
                            idx
                          )}
                        </div>
                        <div className="text-xs text-[#6B6B66] truncate max-w-[200px]">
                          {maskEmail(c.email, settings.anonymizeClients) ||
                            'Vente directe'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num">
                        {c.totalBouteilles}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num font-medium">
                        {formatEUR(c.caTotalTTC)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-[#15803D]">
                        {formatEUR(c.margeTotaleEuro, true)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-xs">
                        {c.bouteillesPretesLBG > 0 ? (
                          <span className="font-semibold text-[#15803D]">
                            {c.bouteillesPretesLBG} prête(s)
                          </span>
                        ) : c.bouteillesAttenteDomaine > 0 ? (
                          <span className="text-[#B45309]">
                            {c.bouteillesAttenteDomaine} att.
                          </span>
                        ) : (
                          <span className="text-[#6B6B66]">À jour</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Detailed Client Purchase Report */}
        <div className="xl:col-span-6 bg-white border border-[#E5E4DF] rounded-xl p-6 space-y-5">
          {selectedCustomer ? (
            <>
              {/* Client Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#ECEAE4] pb-4">
                <div className="flex items-start gap-3">
                  <img
                    src="/logo-lbg.png"
                    alt="Le Bon Grain d’Ivresse"
                    className="w-10 h-10 rounded-lg object-cover border border-[#E5E4DF] shrink-0 hidden print:block sm:block"
                  />
                  <div>
                    <div className="text-xs text-[#6B6B66]">
                      Fiche d’achat client · Le Bon Grain d’Ivresse
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-[#141413] mt-0.5">
                      {maskClientName(
                        selectedCustomer.prenom,
                        selectedCustomer.nom,
                        settings.anonymizeClients
                      )}
                    </h2>
                    <div className="text-xs text-[#6B6B66] mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {maskEmail(
                          selectedCustomer.email,
                          settings.anonymizeClients
                        ) || 'Sans email'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        Dernière commande :{' '}
                        {formatDateFR(selectedCustomer.derniereDate)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 no-print">
                  <button
                    onClick={handleCopyRecap}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
                  >
                    {copiedSummary ? (
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedSummary ? 'Copié !' : 'Copier message client'}
                    </span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#141413] bg-white hover:bg-[#F6F6F4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimer bon</span>
                  </button>
                </div>
              </div>

              {/* Client KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-1">
                <div>
                  <div className="text-xs text-[#6B6B66]">CA Total TTC</div>
                  <div className="text-lg font-semibold font-mono-num text-[#141413]">
                    {formatEUR(selectedCustomer.caTotalTTC)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6B6B66]">Bouteilles</div>
                  <div className="text-lg font-semibold font-mono-num text-[#141413]">
                    {selectedCustomer.totalBouteilles}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6B6B66]">Panier moyen</div>
                  <div className="text-lg font-semibold font-mono-num text-[#141413]">
                    {formatEUR(selectedCustomer.panierMoyenTTC)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6B6B66]">Marge générée</div>
                  <div className="text-lg font-semibold font-mono-num text-[#15803D]">
                    {formatEUR(selectedCustomer.margeTotaleEuro, true)}
                  </div>
                  <div className="text-[11px] text-[#6B6B66] tabular-nums">
                    {formatPct(selectedCustomer.margeMoyennePct)}
                  </div>
                </div>
              </div>

              {/* Ready in cellar action */}
              {selectedCustomer.bouteillesPretesLBG > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg">
                  <div className="text-xs text-[#166534]">
                    <span className="font-semibold">
                      {selectedCustomer.bouteillesPretesLBG} bouteille(s)
                    </span>{' '}
                    reçue(s) par LBG attendent la remise au client.
                  </div>
                  <button
                    onClick={() =>
                      onMarkClientReadyDelivered(selectedCustomer.key)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#15803D] hover:bg-[#166534] rounded-md transition-colors no-print whitespace-nowrap"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span>Tout marquer remis</span>
                  </button>
                </div>
              )}

              {/* Domaines favoris */}
              {selectedCustomer.domainesFavoris.length > 0 && (
                <div className="text-xs text-[#6B6B66]">
                  Domaines favoris :{' '}
                  <span className="text-[#141413] font-medium">
                    {selectedCustomer.domainesFavoris.join(' · ')}
                  </span>
                </div>
              )}

              {/* Detailed History Table */}
              <div className="border border-[#E5E4DF] rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF9F7] text-[#6B6B66] border-b border-[#E5E4DF]">
                      <th className="py-2.5 px-3 font-medium">Date · Vente</th>
                      <th className="py-2.5 px-3 font-medium">Cuvée</th>
                      <th className="py-2.5 px-2 font-medium text-right">
                        Qté
                      </th>
                      <th className="py-2.5 px-3 font-medium text-right">
                        Total TTC
                      </th>
                      <th className="py-2.5 px-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ECEAE4]">
                    {selectedCustomer.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="font-mono-num text-[#141413]">
                            {formatDateFR(o.date)}
                          </div>
                          <div className="text-[11px] text-[#6B6B66]">
                            {o.vente}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-medium text-[#141413]">
                          {o.produitLabel}
                        </td>
                        <td className="py-2 px-2 text-right font-mono-num">
                          {o.qte}
                        </td>
                        <td className="py-2 px-3 text-right font-mono-num">
                          {formatEUR(o.prixUnitaireTTC * o.qte)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`font-medium ${
                              o.statut === 'recu_lbg'
                                ? 'text-[#15803D]'
                                : o.statut === 'attente_reception'
                                  ? 'text-[#B45309]'
                                  : o.statut === 'annule'
                                    ? 'text-[#B91C1C]'
                                    : 'text-[#6B6B66]'
                            }`}
                          >
                            {statusText(o.statut)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-[#6B6B66]">
              Sélectionnez un client pour afficher son rapport d’achat détaillé.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
