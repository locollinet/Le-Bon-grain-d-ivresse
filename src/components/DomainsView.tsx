import React, { useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  FileText,
  Printer,
  Copy,
  Check,
  Mail,
  Phone,
  AlertTriangle,
  Package,
  Trash2,
  Edit3,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  AppSettings,
  DomainSupplier,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  StockSummaryRow,
  SupplierLot,
  SupplierPurchaseOrder,
  WineCatalogItem,
} from '../types/wine';
import {
  computeNextDocNumber,
  formatDateFR,
  formatEUR,
  normalizeSearchText,
} from '../utils/wineMath';

interface DomainsViewProps {
  domains: DomainSupplier[];
  catalog: WineCatalogItem[];
  stockRows: StockSummaryRow[];
  lots: SupplierLot[];
  purchaseOrders: SupplierPurchaseOrder[];
  settings: AppSettings;
  currentUserUid: string;
  onSaveDomain: (domain: DomainSupplier) => Promise<void>;
  onDeleteDomain: (domainId: string) => Promise<void>;
  onCreatePurchaseOrder: (
    po: SupplierPurchaseOrder,
    alsoCreateLots: boolean,
    nextPoSeq: number
  ) => Promise<void>;
  onUpdatePurchaseOrder: (po: SupplierPurchaseOrder) => Promise<void>;
  onDeletePurchaseOrder: (poId: string) => Promise<void>;
}

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'text-[#6B6A65]' },
  envoye: { label: 'Envoyé au domaine', color: 'text-[#B45309]' },
  recu: { label: 'Reçu en cave', color: 'text-[#15803D]' },
};

export const DomainsView: React.FC<DomainsViewProps> = ({
  domains,
  catalog,
  stockRows,
  lots,
  purchaseOrders,
  settings,
  currentUserUid,
  onSaveDomain,
  onDeleteDomain,
  onCreatePurchaseOrder,
  onUpdatePurchaseOrder,
  onDeletePurchaseOrder,
}) => {
  const [search, setSearch] = useState('');
  const [selectedDomainKey, setSelectedDomainKey] = useState<string>('');
  const [subView, setSubView] = useState<'cuvees' | 'pos' | 'lots'>('cuvees');

  // Edit / New Domain Modal
  const [editingDomain, setEditingDomain] = useState<DomainSupplier | null>(null);
  const [isNewDomain, setIsNewDomain] = useState(false);

  // PO Generator Modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poDraftLines, setPoDraftLines] = useState<
    Array<{
      catalogId: string;
      cuvee: string;
      millesime?: string;
      format?: string;
      deficit: number;
      qte: number;
      coutUnitaireHT: number;
    }>
  >([]);
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poCreateLots, setPoCreateLots] = useState(true);
  const [poSaving, setPoSaving] = useState(false);

  // Printable PO preview modal
  const [previewPO, setPreviewPO] = useState<SupplierPurchaseOrder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stockByCat = useMemo(
    () => new Map(stockRows.map((r) => [r.catalog.id, r])),
    [stockRows]
  );

  // Merge explicit DomainSupplier records with any domain name found in catalog
  const enrichedDomains = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        profile: DomainSupplier;
        isPersisted: boolean;
        wines: WineCatalogItem[];
        deficitBottles: number;
        unpaidLotsHT: number;
        lots: SupplierLot[];
        pos: SupplierPurchaseOrder[];
      }
    >();

    for (const d of domains) {
      const key = normalizeSearchText(d.nom);
      map.set(key, {
        key,
        profile: d,
        isPersisted: true,
        wines: [],
        deficitBottles: 0,
        unpaidLotsHT: 0,
        lots: [],
        pos: [],
      });
    }

    for (const w of catalog) {
      const key = normalizeSearchText(w.domaine);
      if (!key) continue;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          key,
          profile: {
            id: `dom_${key.replace(/[^a-z0-9]+/g, '_').slice(0, 48)}`,
            nom: w.domaine,
            region: w.region || '',
            delaiPaiement: '30 jours net',
          },
          isPersisted: false,
          wines: [],
          deficitBottles: 0,
          unpaidLotsHT: 0,
          lots: [],
          pos: [],
        };
        map.set(key, entry);
      }
      entry.wines.push(w);
      const st = stockByCat.get(w.id);
      if (st && st.disponibleVente < 0) {
        entry.deficitBottles += Math.abs(st.disponibleVente);
      }
    }

    const catById = new Map(catalog.map((c) => [c.id, c]));
    for (const l of lots) {
      const cat = catById.get(l.catalogId);
      if (!cat) continue;
      const key = normalizeSearchText(cat.domaine);
      const entry = map.get(key);
      if (!entry) continue;
      entry.lots.push(l);
      if (l.paymentStatus === 'non_paye') {
        entry.unpaidLotsHT += l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
      }
    }

    for (const po of purchaseOrders) {
      const key = normalizeSearchText(po.domaineName);
      const entry = map.get(key);
      if (entry) {
        entry.pos.push(po);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.deficitBottles !== a.deficitBottles) {
        return b.deficitBottles - a.deficitBottles;
      }
      return a.profile.nom.localeCompare(b.profile.nom, 'fr');
    });
  }, [domains, catalog, stockByCat, lots, purchaseOrders]);

  const filteredDomains = useMemo(() => {
    const q = normalizeSearchText(search);
    if (!q) return enrichedDomains;
    return enrichedDomains.filter(
      (d) =>
        normalizeSearchText(d.profile.nom).includes(q) ||
        normalizeSearchText(d.profile.region).includes(q) ||
        normalizeSearchText(d.profile.contactName ?? '').includes(q)
    );
  }, [enrichedDomains, search]);

  const activeDomain =
    enrichedDomains.find((d) => d.key === selectedDomainKey) ??
    filteredDomains[0] ??
    null;

  const totalDeficitAllDomains = useMemo(
    () => enrichedDomains.reduce((s, d) => s + d.deficitBottles, 0),
    [enrichedDomains]
  );

  const openNewDomain = () => {
    setIsNewDomain(true);
    setEditingDomain({
      id: `dom_${Date.now()}`,
      nom: '',
      region: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      iban: '',
      francoPortHT: 1000,
      delaiPaiement: '30 jours net',
      notesAllocation: '',
    });
  };

  const openEditDomain = (d: DomainSupplier) => {
    setIsNewDomain(false);
    setEditingDomain({ ...d });
  };

  const handleSaveDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDomain || !editingDomain.nom.trim()) return;
    await onSaveDomain(editingDomain);
    setSelectedDomainKey(normalizeSearchText(editingDomain.nom));
    setEditingDomain(null);
  };

  const openPoGenerator = () => {
    if (!activeDomain) return;
    const lines = activeDomain.wines.map((w) => {
      const st = stockByCat.get(w.id);
      const deficit = st && st.disponibleVente < 0 ? Math.abs(st.disponibleVente) : 0;
      return {
        catalogId: w.id,
        cuvee: w.cuvee,
        millesime: w.millesime,
        format: w.format || '75 cl',
        deficit,
        qte: deficit,
        coutUnitaireHT: w.tarifAchatHT,
      };
    });
    lines.sort((a, b) => b.deficit - a.deficit || a.cuvee.localeCompare(b.cuvee, 'fr'));
    setPoDraftLines(lines);
    setPoExpectedDate('');
    setPoNotes('');
    setPoCreateLots(true);
    setPoModalOpen(true);
  };

  const roundPoLinesToCase = (caseSize: 6 | 12) => {
    setPoDraftLines((prev) =>
      prev.map((l) => {
        if (l.qte <= 0) return l;
        return { ...l, qte: Math.ceil(l.qte / caseSize) * caseSize };
      })
    );
  };

  const poTotals = useMemo(() => {
    const activeLines = poDraftLines.filter((l) => l.qte > 0);
    const totalBottles = activeLines.reduce((s, l) => s + l.qte, 0);
    const totalHT = activeLines.reduce((s, l) => s + l.qte * l.coutUnitaireHT, 0);
    return { activeLines, totalBottles, totalHT };
  }, [poDraftLines]);

  const handleCreatePO = async () => {
    if (!activeDomain || poTotals.activeLines.length === 0) return;
    setPoSaving(true);
    try {
      const { docNumber, nextSeq } = computeNextDocNumber(
        'PO',
        purchaseOrders.map((p) => p.poNumber),
        new Date().getFullYear(),
        settings.nextPoSeq ?? 1
      );
      const ts = new Date().toISOString();
      const lines: PurchaseOrderLine[] = poTotals.activeLines.map((l) => ({
        catalogId: l.catalogId,
        cuvee: l.cuvee,
        millesime: l.millesime,
        format: l.format,
        qte: l.qte,
        coutUnitaireHT: l.coutUnitaireHT,
        totalHT: Number((l.qte * l.coutUnitaireHT).toFixed(2)),
      }));
      const newPO: SupplierPurchaseOrder = {
        id: `po_${Date.now()}`,
        poNumber: docNumber,
        domaineId: activeDomain.profile.id,
        domaineName: activeDomain.profile.nom,
        date: ts.slice(0, 10),
        expectedDeliveryDate: poExpectedDate || undefined,
        statut: 'envoye',
        lines,
        totalBottles: poTotals.totalBottles,
        totalHT: Number(poTotals.totalHT.toFixed(2)),
        notes: poNotes.trim() || undefined,
        createdByUid: currentUserUid,
        createdAt: ts,
        updatedAt: ts,
      };
      // Persister le profil domaine s'il n'était que dérivé du catalogue
      if (!activeDomain.isPersisted) {
        await onSaveDomain(activeDomain.profile);
      }
      await onCreatePurchaseOrder(newPO, poCreateLots, nextSeq);
      setPoModalOpen(false);
      setSubView('pos');
      setPreviewPO(newPO);
    } finally {
      setPoSaving(false);
    }
  };

  const copyPoText = (po: SupplierPurchaseOrder) => {
    const linesText = po.lines
      .map(
        (l) =>
          `- ${l.qte} btl · ${l.cuvee}${l.millesime ? ` (${l.millesime})` : ''}${l.format ? ` [${l.format}]` : ''} — ${formatEUR(l.coutUnitaireHT)} HT/btl = ${formatEUR(l.totalHT)} HT`
      )
      .join('\n');

    const text = [
      `BON DE COMMANDE ${po.poNumber}`,
      `Date : ${formatDateFR(po.date)}`,
      `Émetteur : ${settings.companyName || "Le Bon Grain d'Ivresse"}${settings.companySiret ? ` (SIRET ${settings.companySiret})` : ''}`,
      `Domaine : ${po.domaineName}`,
      po.expectedDeliveryDate ? `Livraison souhaitée : ${formatDateFR(po.expectedDeliveryDate)}` : '',
      '',
      'Détail de la commande :',
      linesText,
      '',
      `Total : ${po.totalBottles} bouteilles — ${formatEUR(po.totalHT)} HT`,
      po.notes ? `\nNotes : ${po.notes}` : '',
      '',
      `Merci de bien vouloir nous confirmer la disponibilité et nous transmettre la facture proforma.`,
      `${settings.companyName || "Le Bon Grain d'Ivresse"} · ${settings.companyEmail || ''}`,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedId(po.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-[#18181B]">
            Domaines &amp; Achats Fournisseurs
          </h1>
          <p className="text-sm text-[#6B6A65] mt-1">
            Annuaire des vignerons, besoins à commander par domaine et bons de commande consolidés.
          </p>
        </div>
        <button
          onClick={openNewDomain}
          className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-sm font-medium flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nouveau domaine
        </button>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            Domaines référencés
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
            {enrichedDomains.length}
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">
            {catalog.length} cuvées actives au catalogue
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            Déficit global à commander
          </div>
          <div
            className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
              totalDeficitAllDomains > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
            }`}
          >
            {totalDeficitAllDomains} btl
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">
            {totalDeficitAllDomains > 0
              ? 'Commandes clients non couvertes par un lot'
              : 'Toutes les commandes clients sont couvertes'}
          </div>
        </div>

        <div className="bg-white border border-[#E5E4DF] rounded-xl p-4">
          <div className="text-xs font-medium text-[#6B6A65] uppercase tracking-wider">
            Bons de commande émis
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#18181B] tabular-nums">
            {purchaseOrders.length}
          </div>
          <div className="text-xs text-[#6B6A65] mt-0.5">
            {formatEUR(purchaseOrders.reduce((s, p) => s + p.totalHT, 0))} HT cumulés
          </div>
        </div>
      </div>

      {/* Master-detail layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
        {/* Left list */}
        <div className="lg:col-span-4 bg-white border border-[#E5E4DF] rounded-xl overflow-hidden flex flex-col max-h-[700px]">
          <div className="p-3 border-b border-[#E5E4DF]">
            <div className="relative">
              <Search className="w-4 h-4 text-[#6B6A65] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un domaine, région…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E4DF] rounded-lg focus:outline-none focus:border-[#721C24]"
              />
            </div>
          </div>

          <div className="divide-y divide-[#E5E4DF] overflow-y-auto flex-1">
            {filteredDomains.map((d) => {
              const isSelected = activeDomain?.key === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDomainKey(d.key)}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#FDF8F8] border-l-2 border-l-[#721C24]'
                      : 'hover:bg-[#F6F6F4]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-[#18181B]">
                      {d.profile.nom}
                    </div>
                    {d.deficitBottles > 0 && (
                      <span className="text-xs font-mono font-semibold text-[#B45309] shrink-0">
                        -{d.deficitBottles} btl
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6B6A65] mt-0.5">
                    {d.profile.region || 'Région non renseignée'} · {d.wines.length}{' '}
                    cuvée{d.wines.length > 1 ? 's' : ''}
                    {d.pos.length > 0 ? ` · ${d.pos.length} BC` : ''}
                  </div>
                  {d.unpaidLotsHT > 0 && (
                    <div className="text-[11px] font-mono text-[#B91C1C] mt-1">
                      À régler : {formatEUR(d.unpaidLotsHT)} HT
                    </div>
                  )}
                </button>
              );
            })}
            {filteredDomains.length === 0 && (
              <div className="p-8 text-center text-xs text-[#6B6A65]">
                Aucun domaine trouvé.
              </div>
            )}
          </div>
        </div>

        {/* Right detail panel */}
        <div className="lg:col-span-8 space-y-4">
          {activeDomain ? (
            <>
              {/* Domain Header Card */}
              <div className="bg-white border border-[#E5E4DF] rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-[#721C24]" />
                      <h2 className="font-serif text-2xl font-semibold text-[#18181B]">
                        {activeDomain.profile.nom}
                      </h2>
                    </div>
                    <p className="text-xs text-[#6B6A65] mt-1">
                      {activeDomain.profile.region || 'Région non renseignée'}
                      {activeDomain.profile.contactName
                        ? ` · Contact : ${activeDomain.profile.contactName}`
                        : ''}
                      {activeDomain.profile.delaiPaiement
                        ? ` · Paiement : ${activeDomain.profile.delaiPaiement}`
                        : ''}
                      {activeDomain.profile.francoPortHT
                        ? ` · Franco : ${formatEUR(activeDomain.profile.francoPortHT)} HT`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openEditDomain(activeDomain.profile)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs font-medium text-[#18181B] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Modifier la fiche
                    </button>
                    <button
                      onClick={openPoGenerator}
                      className="px-3.5 py-1.5 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Générer un bon de commande
                    </button>
                  </div>
                </div>

                {/* Contact strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#E5E4DF] text-xs">
                  <div className="flex items-center gap-2 text-[#6B6A65]">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    {activeDomain.profile.email ? (
                      <a
                        href={`mailto:${activeDomain.profile.email}`}
                        className="text-[#721C24] hover:underline truncate"
                      >
                        {activeDomain.profile.email}
                      </a>
                    ) : (
                      <span>Email non renseigné</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[#6B6A65]">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span>{activeDomain.profile.phone || 'Téléphone non renseigné'}</span>
                  </div>
                  <div className="text-[#6B6A65] truncate">
                    IBAN :{' '}
                    <span className="font-mono text-[#18181B]">
                      {activeDomain.profile.iban || '—'}
                    </span>
                  </div>
                </div>

                {activeDomain.profile.notesAllocation && (
                  <div className="p-3 rounded-lg bg-[#F6F6F4] text-xs text-[#18181B]">
                    <span className="font-semibold text-[#6B6A65]">
                      Notes allocation :{' '}
                    </span>
                    {activeDomain.profile.notesAllocation}
                  </div>
                )}

                {activeDomain.deficitBottles > 0 && (
                  <div className="p-3 rounded-lg bg-[#FEF3C7] border border-[#FDE68A] text-xs text-[#92400E] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>{activeDomain.deficitBottles} bouteille(s)</strong> en
                        déficit sur ce domaine (commandes clients non couvertes).
                      </span>
                    </div>
                    <button
                      onClick={openPoGenerator}
                      className="underline font-semibold shrink-0 cursor-pointer"
                    >
                      Préparer le BC →
                    </button>
                  </div>
                )}
              </div>

              {/* Sub-tabs */}
              <div className="bg-white border border-[#E5E4DF] rounded-xl overflow-hidden">
                <div className="flex border-b border-[#E5E4DF] px-4">
                  {(
                    [
                      ['cuvees', `Cuvées & Besoins (${activeDomain.wines.length})`],
                      ['pos', `Bons de commande (${activeDomain.pos.length})`],
                      ['lots', `Lots fournisseurs (${activeDomain.lots.length})`],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSubView(id)}
                      className={`px-4 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                        subView === id
                          ? 'border-[#721C24] text-[#721C24]'
                          : 'border-transparent text-[#6B6A65] hover:text-[#18181B]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {subView === 'cuvees' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                        <tr>
                          <th className="text-left py-2.5 px-4 font-medium">Cuvée</th>
                          <th className="text-right py-2.5 px-3 font-medium">Achat EXW</th>
                          <th className="text-right py-2.5 px-3 font-medium">Cave</th>
                          <th className="text-right py-2.5 px-3 font-medium">En cmd</th>
                          <th className="text-right py-2.5 px-3 font-medium">Réservé</th>
                          <th className="text-right py-2.5 px-4 font-medium">Dispo / Besoin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E4DF]">
                        {activeDomain.wines.map((w) => {
                          const st = stockByCat.get(w.id);
                          const dispo = st?.disponibleVente ?? 0;
                          return (
                            <tr key={w.id} className="hover:bg-[#FAF9F6]">
                              <td className="py-2.5 px-4">
                                <div className="font-medium text-[#18181B]">{w.cuvee}</div>
                                <div className="text-xs text-[#6B6A65]">
                                  {[w.appellation, w.millesime, w.format || '75 cl', w.color]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {formatEUR(w.tarifAchatHT)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {st?.physiqueCave ?? 0}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {st?.enCommandeFournisseur ?? 0}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {st?.reserveClients ?? 0}
                              </td>
                              <td
                                className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                                  dispo < 0
                                    ? 'text-[#B91C1C]'
                                    : dispo > 0
                                      ? 'text-[#15803D]'
                                      : 'text-[#6B6A65]'
                                }`}
                              >
                                {dispo < 0 ? `À cmd ${Math.abs(dispo)}` : `${dispo} dispo`}
                              </td>
                            </tr>
                          );
                        })}
                        {activeDomain.wines.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-xs text-[#6B6A65]">
                              Aucune cuvée rattachée à ce domaine dans le catalogue.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {subView === 'pos' && (
                  <div className="divide-y divide-[#E5E4DF]">
                    {activeDomain.pos
                      .slice()
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((po) => {
                        const statusMeta = PO_STATUS_LABELS[po.statut];
                        return (
                          <div
                            key={po.id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono font-semibold text-sm text-[#18181B]">
                                  {po.poNumber}
                                </span>
                                <span className={`text-xs font-medium ${statusMeta.color}`}>
                                  {statusMeta.label}
                                </span>
                              </div>
                              <div className="text-xs text-[#6B6A65] mt-0.5">
                                {formatDateFR(po.date)} · {po.totalBottles} btl ·{' '}
                                <span className="font-mono text-[#18181B]">
                                  {formatEUR(po.totalHT)} HT
                                </span>
                                {po.expectedDeliveryDate
                                  ? ` · Livraison prévue ${formatDateFR(po.expectedDeliveryDate)}`
                                  : ''}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={po.statut}
                                onChange={(e) =>
                                  onUpdatePurchaseOrder({
                                    ...po,
                                    statut: e.target.value as PurchaseOrderStatus,
                                  })
                                }
                                className="text-xs border border-[#E5E4DF] rounded-lg px-2.5 py-1.5 bg-white"
                              >
                                <option value="brouillon">Brouillon</option>
                                <option value="envoye">Envoyé</option>
                                <option value="recu">Reçu</option>
                              </select>
                              <button
                                onClick={() => copyPoText(po)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs flex items-center gap-1 cursor-pointer"
                              >
                                {copiedId === po.id ? (
                                  <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                                {copiedId === po.id ? 'Copié' : 'Texte email'}
                              </button>
                              <button
                                onClick={() => setPreviewPO(po)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E5E4DF] hover:bg-[#F6F6F4] text-xs flex items-center gap-1 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Voir / Imprimer
                              </button>
                              <button
                                onClick={() => onDeletePurchaseOrder(po.id)}
                                title="Supprimer ce bon de commande"
                                className="p-1.5 rounded-lg text-[#6B6A65] hover:text-[#B91C1C] hover:bg-[#FEF2F2] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    {activeDomain.pos.length === 0 && (
                      <div className="p-8 text-center text-xs text-[#6B6A65]">
                        Aucun bon de commande généré pour ce domaine.
                      </div>
                    )}
                  </div>
                )}

                {subView === 'lots' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                        <tr>
                          <th className="text-left py-2.5 px-4 font-medium">Date · Réf</th>
                          <th className="text-right py-2.5 px-3 font-medium">Qté reçue / cmd</th>
                          <th className="text-right py-2.5 px-3 font-medium">Montant HT</th>
                          <th className="text-right py-2.5 px-4 font-medium">Paiement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E4DF]">
                        {activeDomain.lots.map((l) => {
                          const totalHT = l.coutUnitaireHT * l.qteCommandee + (l.shippingHT ?? 0);
                          return (
                            <tr key={l.id}>
                              <td className="py-2.5 px-4">
                                <div className="font-mono text-xs text-[#18181B]">
                                  {l.referenceFacture}
                                </div>
                                <div className="text-xs text-[#6B6A65]">
                                  {formatDateFR(l.dateAchat)} · {l.typeAchat}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {l.qteRecue} / {l.qteCommandee}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                {formatEUR(totalHT)}
                              </td>
                              <td className="py-2.5 px-4 text-right text-xs">
                                {l.paymentStatus === 'non_paye' ? (
                                  <span className="text-[#B91C1C] font-medium">
                                    À payer
                                    {l.paymentDueDate
                                      ? ` (${formatDateFR(l.paymentDueDate)})`
                                      : ''}
                                  </span>
                                ) : (
                                  <span className="text-[#15803D]">Réglé</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {activeDomain.lots.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-xs text-[#6B6A65]">
                              Aucun lot fournisseur saisi pour ce domaine.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white border border-[#E5E4DF] rounded-xl p-12 text-center text-sm text-[#6B6A65]">
              Sélectionnez ou créez un domaine pour gérer ses coordonnées et bons de commande.
            </div>
          )}
        </div>
      </div>

      {/* Edit / Create Domain Modal */}
      {editingDomain && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 no-print">
          <form
            onSubmit={handleSaveDomainSubmit}
            className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E4DF]">
              <h3 className="font-serif text-xl font-semibold">
                {isNewDomain ? 'Nouveau domaine / fournisseur' : `Modifier · ${editingDomain.nom}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingDomain(null)}
                className="p-1 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Nom du domaine *
                </label>
                <input
                  required
                  value={editingDomain.nom}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, nom: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Région viticole
                </label>
                <input
                  value={editingDomain.region}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, region: e.target.value })
                  }
                  placeholder="Jura, Bourgogne, Rhône…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Interlocuteur / Agent
                </label>
                <input
                  value={editingDomain.contactName ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, contactName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Email commandes
                </label>
                <input
                  type="email"
                  value={editingDomain.email ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Téléphone
                </label>
                <input
                  value={editingDomain.phone ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Franco de port (€ HT)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={editingDomain.francoPortHT ?? ''}
                  onChange={(e) =>
                    setEditingDomain({
                      ...editingDomain,
                      francoPortHT: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Délai de paiement
                </label>
                <input
                  value={editingDomain.delaiPaiement ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, delaiPaiement: e.target.value })
                  }
                  placeholder="Proforma, 30 jours fin de mois…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  IBAN domaine
                </label>
                <input
                  value={editingDomain.iban ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, iban: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Adresse complète
                </label>
                <input
                  value={editingDomain.address ?? ''}
                  onChange={(e) =>
                    setEditingDomain({ ...editingDomain, address: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                  Notes allocations &amp; conditions
                </label>
                <textarea
                  rows={3}
                  value={editingDomain.notesAllocation ?? ''}
                  onChange={(e) =>
                    setEditingDomain({
                      ...editingDomain,
                      notesAllocation: e.target.value,
                    })
                  }
                  placeholder="Quotas annuels, période de mise en marché, minimum de commande…"
                  className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#E5E4DF]">
              {!isNewDomain && activeDomain?.isPersisted ? (
                <button
                  type="button"
                  onClick={async () => {
                    await onDeleteDomain(editingDomain.id);
                    setEditingDomain(null);
                  }}
                  className="text-xs text-[#B91C1C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer la fiche
                </button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDomain(null)}
                  className="px-4 py-2 rounded-lg border border-[#E5E4DF] text-sm cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] text-white text-sm font-medium cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Purchase Order Generator Modal */}
      {poModalOpen && activeDomain && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-[#E5E4DF] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-[#E5E4DF] flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-semibold">
                  Bon de commande · {activeDomain.profile.nom}
                </h3>
                <p className="text-xs text-[#6B6A65]">
                  Pré-rempli avec les déficits clients. Ajustez les quantités pour arrondir en caisses ou ajouter du stock d’avance.
                </p>
              </div>
              <button
                onClick={() => setPoModalOpen(false)}
                className="p-1 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Quick case rounding buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F6F6F4] p-3 rounded-lg">
                <div className="text-xs text-[#6B6A65] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#721C24]" />
                  Arrondir les quantités saisies :
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => roundPoLinesToCase(6)}
                    className="px-2.5 py-1 rounded bg-white border border-[#E5E4DF] hover:border-[#721C24] text-xs font-medium cursor-pointer"
                  >
                    Caisses de 6
                  </button>
                  <button
                    type="button"
                    onClick={() => roundPoLinesToCase(12)}
                    className="px-2.5 py-1 rounded bg-white border border-[#E5E4DF] hover:border-[#721C24] text-xs font-medium cursor-pointer"
                  >
                    Caisses de 12
                  </button>
                </div>
              </div>

              <div className="border border-[#E5E4DF] rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F6F6F4] text-xs text-[#6B6A65] uppercase">
                    <tr>
                      <th className="text-left py-2 px-3">Cuvée</th>
                      <th className="text-right py-2 px-2">Déficit</th>
                      <th className="text-right py-2 px-2">Qté à cmd</th>
                      <th className="text-right py-2 px-2">PU HT</th>
                      <th className="text-right py-2 px-3">Total HT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E4DF]">
                    {poDraftLines.map((line, idx) => (
                      <tr key={line.catalogId}>
                        <td className="py-2 px-3">
                          <div className="font-medium text-[#18181B]">{line.cuvee}</div>
                          <div className="text-[11px] text-[#6B6A65]">
                            {[line.millesime, line.format].filter(Boolean).join(' · ')}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-xs text-[#B45309]">
                          {line.deficit > 0 ? line.deficit : '—'}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            value={line.qte}
                            onChange={(e) => {
                              const val = Math.max(0, Math.round(Number(e.target.value) || 0));
                              setPoDraftLines((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, qte: val } : p))
                              );
                            }}
                            className="w-20 px-2 py-1 text-right font-mono border border-[#E5E4DF] rounded"
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={line.coutUnitaireHT}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setPoDraftLines((prev) =>
                                prev.map((p, i) =>
                                  i === idx ? { ...p, coutUnitaireHT: val } : p
                                )
                              );
                            }}
                            className="w-24 px-2 py-1 text-right font-mono border border-[#E5E4DF] rounded"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatEUR(line.qte * line.coutUnitaireHT)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Franco progress */}
              {activeDomain.profile.francoPortHT && activeDomain.profile.francoPortHT > 0 && (
                <div className="p-3 rounded-lg bg-[#F6F6F4] text-xs flex items-center justify-between">
                  <span>
                    Franco de port domaine ({formatEUR(activeDomain.profile.francoPortHT)} HT) :
                  </span>
                  {poTotals.totalHT >= activeDomain.profile.francoPortHT ? (
                    <span className="text-[#15803D] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Franco atteint
                    </span>
                  ) : (
                    <span className="text-[#B45309] font-mono">
                      Manque {formatEUR(activeDomain.profile.francoPortHT - poTotals.totalHT)} HT
                    </span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Livraison souhaitée (optionnel)
                  </label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={(e) => setPoExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#6B6A65] mb-1">
                    Notes pour le domaine
                  </label>
                  <input
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    placeholder="Instructions de livraison, hayon, contact…"
                    className="w-full px-3 py-2 border border-[#E5E4DF] rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#18181B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={poCreateLots}
                  onChange={(e) => setPoCreateLots(e.target.checked)}
                  className="accent-[#721C24]"
                />
                Créer automatiquement les lots fournisseurs correspondants (en commande · à régler) dans l’onglet Stock
              </label>
            </div>

            <div className="p-4 border-t border-[#E5E4DF] bg-[#FAF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm">
                Total commande :{' '}
                <strong className="font-mono">{poTotals.totalBottles} btl</strong> ·{' '}
                <strong className="font-mono text-[#721C24]">
                  {formatEUR(poTotals.totalHT)} HT
                </strong>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPoModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#E5E4DF] bg-white text-sm cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreatePO}
                  disabled={poSaving || poTotals.activeLines.length === 0}
                  className="px-4 py-2 rounded-lg bg-[#721C24] hover:bg-[#5E161D] disabled:opacity-50 text-white text-sm font-medium cursor-pointer"
                >
                  {poSaving ? 'Création…' : 'Émettre le bon de commande'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Printable Purchase Order Document */}
      {previewPO && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-3xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[#E5E4DF] flex items-center justify-between bg-[#FAF9F6] no-print">
              <span className="font-mono text-sm font-semibold">
                Bon de commande {previewPO.poNumber}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyPoText(previewPO)}
                  className="px-3 py-1.5 rounded-lg border border-[#E5E4DF] bg-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copier pour email
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-[#721C24] text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Imprimer / PDF
                </button>
                <button
                  onClick={() => setPreviewPO(null)}
                  className="p-1.5 text-[#6B6A65] hover:text-[#18181B] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 space-y-6 text-[#18181B]">
              <div className="flex justify-between items-start border-b border-[#E5E4DF] pb-5">
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-[#721C24]">
                    {settings.companyName || "Le Bon Grain d'Ivresse"}
                  </h2>
                  <p className="text-xs text-[#6B6A65] mt-1 whitespace-pre-line">
                    {settings.companyAddress}
                    {settings.companySiret ? `\nSIRET : ${settings.companySiret}` : ''}
                    {settings.companyVatNumber ? ` · TVA : ${settings.companyVatNumber}` : ''}
                    {settings.companyEmail ? `\n${settings.companyEmail}` : ''}
                    {settings.companyPhone ? ` · ${settings.companyPhone}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-[#6B6A65]">
                    Bon de commande fournisseur
                  </div>
                  <div className="font-mono text-xl font-bold mt-0.5">
                    {previewPO.poNumber}
                  </div>
                  <div className="text-xs text-[#6B6A65] mt-1">
                    Date : {formatDateFR(previewPO.date)}
                  </div>
                  {previewPO.expectedDeliveryDate && (
                    <div className="text-xs text-[#6B6A65]">
                      Livraison souhaitée : {formatDateFR(previewPO.expectedDeliveryDate)}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-lg p-4 text-sm">
                <div className="text-xs uppercase tracking-wider text-[#6B6A65]">
                  Destinataire (Domaine / Fournisseur)
                </div>
                <div className="font-semibold text-base mt-0.5">
                  {previewPO.domaineName}
                </div>
                {activeDomain?.profile.address && (
                  <div className="text-xs text-[#6B6A65] mt-0.5">
                    {activeDomain.profile.address}
                  </div>
                )}
              </div>

              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#18181B] text-xs uppercase text-[#6B6A65]">
                    <th className="text-left py-2">Cuvée</th>
                    <th className="text-left py-2">Format</th>
                    <th className="text-right py-2">Qté (btl)</th>
                    <th className="text-right py-2">Tarif HT EXW</th>
                    <th className="text-right py-2">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E4DF]">
                  {previewPO.lines.map((l) => (
                    <tr key={l.catalogId}>
                      <td className="py-2.5 font-medium">
                        {l.cuvee}
                        {l.millesime ? ` (${l.millesime})` : ''}
                      </td>
                      <td className="py-2.5 text-xs text-[#6B6A65]">
                        {l.format || '75 cl'}
                      </td>
                      <td className="py-2.5 text-right font-mono">{l.qte}</td>
                      <td className="py-2.5 text-right font-mono">
                        {formatEUR(l.coutUnitaireHT)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold">
                        {formatEUR(l.totalHT)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end pt-3 border-t border-[#E5E4DF]">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6B6A65]">Total bouteilles</span>
                    <span className="font-mono font-semibold">
                      {previewPO.totalBottles} btl
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold pt-1.5 border-t border-[#E5E4DF]">
                    <span>Total HT EXW</span>
                    <span className="font-mono text-[#721C24]">
                      {formatEUR(previewPO.totalHT)}
                    </span>
                  </div>
                </div>
              </div>

              {previewPO.notes && (
                <div className="text-xs text-[#6B6A65] pt-3 border-t border-[#E5E4DF]">
                  <strong>Notes :</strong> {previewPO.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
