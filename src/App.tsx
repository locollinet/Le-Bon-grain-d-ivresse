/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  ClipboardPaste,
  LayoutDashboard,
  Menu,
  Receipt,
  RotateCcw,
  Sparkles,
  Users,
  Warehouse,
  Wine,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  AppSettings,
  OrderLine,
  OrderStatus,
  SalesCampaign,
  SupplierLot,
  WineCatalogItem,
} from './types/wine';
import {
  DEFAULT_SETTINGS,
  DEMO_EXTRA_LOTS,
  INITIAL_CAMPAIGNS,
  INITIAL_CATALOG,
  INITIAL_LOTS,
  INITIAL_ORDERS,
} from './data/seedData';
import {
  computeStockSummaries,
  normalizeSearchText,
  resolveCustomerKey,
} from './utils/wineMath';
import { DashboardView } from './components/DashboardView';
import { StockView, type StockFilter } from './components/StockView';
import { OrdersView } from './components/OrdersView';
import { FinanceView } from './components/FinanceView';
import { AccountingView } from './components/AccountingView';
import { ClientsView } from './components/ClientsView';
import { CatalogView } from './components/CatalogView';
import { WineListView } from './components/WineListView';
import { ImportHelloAssoModal } from './components/ImportHelloAssoModal';
import { NewDirectOrderModal } from './components/NewDirectOrderModal';
import { NewSupplierLotModal } from './components/NewSupplierLotModal';
import { InvoiceAIModal } from './components/InvoiceAIModal';
import { AssistantPanel } from './modules/assistant/AssistantPanel';
import type {
  AssistantAction,
  CatalogItemPrefill,
  DirectOrderPrefill,
  SupplierLotPrefill,
} from './modules/assistant/types';

const STORAGE_KEYS = {
  catalog: 'lbg_catalog_v3',
  lots: 'lbg_lots_v3',
  orders: 'lbg_orders_v3',
  campaigns: 'lbg_campaigns_v3',
  settings: 'lbg_settings_v3',
};

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const NAV_GROUPS: {
  title: string;
  items: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
}[] = [
  {
    title: 'Quotidien',
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'orders', label: 'Commandes', icon: ClipboardList },
      { id: 'stock', label: 'Stock & Achats', icon: Warehouse },
    ],
  },
  {
    title: 'Clients & Vitrine',
    items: [
      { id: 'clients', label: 'Rapports clients', icon: Users },
      { id: 'winelist', label: 'Carte des vins', icon: Wine },
    ],
  },
  {
    title: 'Gestion & Tarifs',
    items: [
      { id: 'finance', label: 'Bilans financiers', icon: BarChart3 },
      { id: 'accounting', label: 'Facturation & TVA', icon: Receipt },
      { id: 'catalog', label: 'Catalogue & Tarifs', icon: BookOpen },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

interface ViewFocusState {
  nonce: number;
  tab: ActiveTab;
  search?: string;
  filter?: string;
  vente?: string;
  clientKey?: string;
  periodMonth?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [catalog, setCatalog] = useState<WineCatalogItem[]>(() =>
    loadStored(STORAGE_KEYS.catalog, INITIAL_CATALOG)
  );
  const [lots, setLots] = useState<SupplierLot[]>(() =>
    loadStored(STORAGE_KEYS.lots, INITIAL_LOTS)
  );
  const [orders, setOrders] = useState<OrderLine[]>(() =>
    loadStored(STORAGE_KEYS.orders, INITIAL_ORDERS)
  );
  const [campaigns, setCampaigns] = useState<SalesCampaign[]>(() =>
    loadStored(STORAGE_KEYS.campaigns, INITIAL_CAMPAIGNS)
  );
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadStored<Partial<AppSettings>>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  }));

  // Modals & Assistant
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [invoiceAIModalOpen, setInvoiceAIModalOpen] = useState(false);
  const [directOrderModalOpen, setDirectOrderModalOpen] = useState(false);
  const [supplierLotModalOpen, setSupplierLotModalOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [preselectedLotCatalogId, setPreselectedLotCatalogId] = useState<
    string | undefined
  >(undefined);

  // Prefills & Navigation Focus from AI Assistant
  const [directOrderPrefill, setDirectOrderPrefill] =
    useState<DirectOrderPrefill | null>(null);
  const [supplierLotPrefill, setSupplierLotPrefill] =
    useState<SupplierLotPrefill | null>(null);
  const [catalogPrefillNew, setCatalogPrefillNew] =
    useState<CatalogItemPrefill | null>(null);
  const [viewFocus, setViewFocus] = useState<ViewFocusState | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Global shortcut Cmd/Ctrl + K to toggle Assistant IA
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(catalog));
  }, [catalog]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.lots, JSON.stringify(lots));
  }, [lots]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.campaigns, JSON.stringify(campaigns));
  }, [campaigns]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  const stockRows = useMemo(
    () => computeStockSummaries(catalog, lots, orders),
    [catalog, lots, orders]
  );

  const existingRefs = useMemo(
    () => new Set(orders.map((o) => o.refCommande)),
    [orders]
  );

  const existingInvoiceRefs = useMemo(() => {
    const set = new Set<string>();
    lots.forEach((l) => {
      if (l.referenceFacture) set.add(l.referenceFacture.trim());
    });
    orders.forEach((o) => {
      if (o.refCommande) set.add(o.refCommande.trim());
      if (o.invoiceNumber) set.add(o.invoiceNumber.trim());
    });
    return set;
  }, [lots, orders]);

  const tabFocus = useMemo(
    () => ({
      stock:
        viewFocus?.tab === 'stock'
          ? {
              search: viewFocus.search,
              filter: viewFocus.filter as StockFilter | undefined,
            }
          : null,
      orders:
        viewFocus?.tab === 'orders'
          ? { search: viewFocus.search, vente: viewFocus.vente }
          : null,
      finance:
        viewFocus?.tab === 'finance' ? { vente: viewFocus.vente } : null,
      accounting:
        viewFocus?.tab === 'accounting'
          ? { periodMonth: viewFocus.periodMonth }
          : null,
      clients:
        viewFocus?.tab === 'clients'
          ? { clientKey: viewFocus.clientKey, search: viewFocus.search }
          : null,
      catalog:
        viewFocus?.tab === 'catalog' ? { search: viewFocus.search } : null,
    }),
    [viewFocus]
  );

  // Handlers
  const handleImportOrders = (
    newOrders: OrderLine[],
    newCatalogItems: WineCatalogItem[]
  ) => {
    if (newCatalogItems.length > 0) {
      setCatalog((prev) => [...prev, ...newCatalogItems]);
    }
    if (newOrders.length > 0) {
      setOrders((prev) => [...newOrders, ...prev]);
      const validBottles = newOrders
        .filter((o) => o.statut !== 'annule')
        .reduce((s, o) => s + o.qte, 0);
      notify(
        `Import terminé : ${validBottles} bouteille(s) ajoutée(s) (${newOrders.length} ligne(s)).`
      );
      setActiveTab('orders');
    } else {
      notify('Aucune nouvelle ligne à importer.');
    }
  };

  const handleAddDirectOrder = (order: OrderLine) => {
    setOrders((prev) => [order, ...prev]);
    notify(
      `Opération enregistrée : ${order.qte}x ${order.produitLabel} pour ${order.prenomClient} ${order.nomClient}.`
    );
  };

  const handleUpdateOrder = (updated: OrderLine) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? updated : o))
    );
    notify(`Commande ${updated.refCommande} mise à jour.`);
  };

  const handleAddLot = (lot: SupplierLot) => {
    setLots((prev) => [{ ...lot, origin: lot.origin ?? 'manual' }, ...prev]);
    const cat = catalog.find((c) => c.id === lot.catalogId);
    notify(
      `Stock mis à jour : +${lot.qteCommandee} btl (${cat?.cuvee ?? 'Cuvée'}).`
    );
  };

  const handleDeleteLot = (lotId: string) => {
    setLots((prev) => prev.filter((l) => l.id !== lotId));
    notify('Lot fournisseur supprimé.');
  };

  const handleReceiveLot = (
    lotId: string,
    alsoUpdateOrders: boolean,
    qtyReceivedTotal?: number
  ) => {
    const targetLot = lots.find((l) => l.id === lotId);
    if (!targetLot) return;

    const nextReceived =
      qtyReceivedTotal !== undefined
        ? Math.max(targetLot.qteRecue, Math.min(targetLot.qteCommandee, qtyReceivedTotal))
        : targetLot.qteCommandee;
    const newlyReceivedDelta = Math.max(0, nextReceived - targetLot.qteRecue);
    const isComplete = nextReceived >= targetLot.qteCommandee;

    setLots((prev) =>
      prev.map((l) =>
        l.id === lotId
          ? {
              ...l,
              qteRecue: nextReceived,
              statutLot: isComplete ? 'recu_cave' : 'en_transit',
            }
          : l
      )
    );

    let updatedOrdersCount = 0;
    if (alsoUpdateOrders && newlyReceivedDelta > 0) {
      // Attribuer les bouteilles nouvellement reçues aux commandes clients par ordre chronologique (FIFO)
      const receivedTotalForCat =
        lots
          .filter((l) => l.catalogId === targetLot.catalogId && l.id !== lotId)
          .reduce((s, l) => s + l.qteRecue, 0) + nextReceived;

      const alreadyAllocatedOrDelivered = orders
        .filter(
          (o) =>
            o.catalogId === targetLot.catalogId &&
            (o.statut === 'recu_lbg' || o.statut === 'remis_client')
        )
        .reduce((s, o) => s + o.qte, 0);

      let availablePool = Math.max(
        0,
        receivedTotalForCat - alreadyAllocatedOrDelivered
      );

      const waitingChronoIds = orders
        .filter(
          (o) =>
            o.catalogId === targetLot.catalogId &&
            o.statut === 'attente_reception'
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter((o) => {
          if (availablePool >= o.qte) {
            availablePool -= o.qte;
            return true;
          }
          return false;
        })
        .map((o) => o.id);

      const toReadySet = new Set(waitingChronoIds);
      if (toReadySet.size > 0) {
        updatedOrdersCount = toReadySet.size;
        setOrders((prev) =>
          prev.map((o) =>
            toReadySet.has(o.id) ? { ...o, statut: 'recu_lbg' } : o
          )
        );
      }
    }

    const cat = catalog.find((c) => c.id === targetLot.catalogId);
    notify(
      `Lot réceptionné (${nextReceived}/${targetLot.qteCommandee} · ${cat?.cuvee ?? ''})${
        updatedOrdersCount > 0
          ? ` · ${updatedOrdersCount} ligne(s) client passées en « Reçu par LBG ».`
          : '.'
      }`
    );
  };

  const handleUpdateOrderStatus = (orderId: string, statut: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, statut } : o))
    );
  };

  const handleBulkUpdateCampaignStatus = (
    vente: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus
  ) => {
    let count = 0;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.vente === vente && o.statut === fromStatus) {
          count++;
          return { ...o, statut: toStatus };
        }
        return o;
      })
    );
    if (count > 0) {
      notify(`${count} ligne(s) de « ${vente} » mise(s) à jour.`);
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    notify('Ligne de commande supprimée.');
  };

  const handleMarkClientReadyDelivered = (clientKey: string) => {
    const buildNameToEmail = (list: OrderLine[]) => {
      const map = new Map<string, string>();
      for (const o of list) {
        if (o.emailClient) {
          const nameKey = `${normalizeSearchText(o.nomClient)}_${normalizeSearchText(o.prenomClient)}`;
          if (nameKey && !map.has(nameKey)) {
            map.set(nameKey, o.emailClient.toLowerCase().trim());
          }
        }
      }
      return map;
    };

    const currentMap = buildNameToEmail(orders);
    const count = orders.reduce(
      (sum, o) =>
        resolveCustomerKey(o, currentMap) === clientKey &&
        o.statut === 'recu_lbg'
          ? sum + o.qte
          : sum,
      0
    );

    setOrders((prev) => {
      const nameToEmail = buildNameToEmail(prev);
      return prev.map((o) => {
        const key = resolveCustomerKey(o, nameToEmail);
        if (key === clientKey && o.statut === 'recu_lbg') {
          return { ...o, statut: 'remis_client' };
        }
        return o;
      });
    });

    if (count > 0) {
      notify(`${count} bouteille(s) marquée(s) comme remise(s) au client.`);
    }
  };

  const handleUpdateCatalogItem = (updated: WineCatalogItem) => {
    setCatalog((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleBatchUpdateCatalog = (
    updater: (prev: WineCatalogItem[]) => WineCatalogItem[]
  ) => {
    setCatalog(updater);
  };

  const handleAddCatalogItem = (item: WineCatalogItem) => {
    setCatalog((prev) => [item, ...prev]);
    notify(`Cuvée ajoutée : ${item.domaine} — ${item.cuvee}.`);
  };

  const handleDeleteCatalogItem = (id: string) => {
    setCatalog((prev) => prev.filter((c) => c.id !== id));
    notify('Cuvée retirée du catalogue.');
  };

  const handleUpdateCampaignStatus = (
    campaignId: string,
    statut: SalesCampaign['statut']
  ) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaignId ? { ...c, statut } : c))
    );
  };

  const handleAddCampaign = (camp: SalesCampaign) => {
    setCampaigns((prev) => [camp, ...prev]);
    notify(`Campagne « ${camp.nom} » ajoutée au planning.`);
  };

  const handleApplyInvoiceAchat = (
    newLots: SupplierLot[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => {
    if (newCatalogItems.length > 0) {
      setCatalog((prev) => [...newCatalogItems, ...prev]);
    }
    setLots((prev) => [
      ...newLots.map((l) => ({ ...l, origin: l.origin ?? ('manual' as const) })),
      ...prev,
    ]);
    notify(summaryText);
    setActiveTab('stock');
  };

  const handleApplyInvoiceVente = (
    newOrders: OrderLine[],
    newCatalogItems: WineCatalogItem[],
    summaryText: string
  ) => {
    if (newCatalogItems.length > 0) {
      setCatalog((prev) => [...newCatalogItems, ...prev]);
    }
    setOrders((prev) => [...newOrders, ...prev]);
    notify(summaryText);
    setActiveTab('orders');
  };

  const handleAssignInvoiceNumbers = (
    orderIds: string[],
    invoiceNumber: string
  ) => {
    const idSet = new Set(orderIds);
    setOrders((prev) =>
      prev.map((o) => (idSet.has(o.id) ? { ...o, invoiceNumber } : o))
    );
    notify(`Facture ${invoiceNumber} émise.`);
  };

  const isDemoMode = useMemo(
    () => lots.some((l) => l.origin === 'demo'),
    [lots]
  );

  const handleEnableDemoMode = () => {
    setLots((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const toAdd = DEMO_EXTRA_LOTS.filter((l) => !existingIds.has(l.id));
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
    notify(
      'Scénario Démo activé : factures Tissot, stock d’avance (Sursis, Pataille, Belargus) et transit (Deiss) ajoutés.'
    );
  };

  const handleDisableDemoMode = () => {
    setLots((prev) => prev.filter((l) => l.origin !== 'demo'));
    notify('Retour au mode strict : seules vos données Excel et saisies manuelles sont affichées.');
  };

  const handleResetDemo = () => {
    setCatalog(INITIAL_CATALOG);
    setLots(INITIAL_LOTS);
    setOrders(INITIAL_ORDERS);
    setCampaigns(INITIAL_CAMPAIGNS);
    setSettings(DEFAULT_SETTINGS);
    setConfirmResetOpen(false);
    notify('Données exactes de votre Excel restaurées.');
  };

  const handleExecuteAssistantAction = (action: AssistantAction) => {
    switch (action.type) {
      case 'navigate': {
        setActiveTab(action.tab);
        setViewFocus({
          nonce: Date.now(),
          tab: action.tab,
          search: action.search,
          filter: action.filter,
          vente: action.vente,
          clientKey: action.clientKey,
          periodMonth: action.periodMonth,
        });
        break;
      }
      case 'prefill_direct_order': {
        setDirectOrderPrefill(action.prefill);
        setDirectOrderModalOpen(true);
        break;
      }
      case 'prefill_supplier_lot': {
        setSupplierLotPrefill(action.prefill);
        setPreselectedLotCatalogId(action.prefill.catalogId);
        setSupplierLotModalOpen(true);
        break;
      }
      case 'prefill_catalog_item': {
        setCatalogPrefillNew(action.prefill);
        setActiveTab('catalog');
        break;
      }
      case 'open_modal': {
        if (action.modal === 'import_helloasso') setImportModalOpen(true);
        if (action.modal === 'invoice_ai') setInvoiceAIModalOpen(true);
        break;
      }
      case 'copy_text': {
        try {
          if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(action.text);
          }
        } catch {
          // ignore clipboard permissions
        }
        notify(`${action.label} copié dans le presse-papiers.`);
        break;
      }
    }
  };

  const activeNavLabel =
    ALL_NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Tableau de bord';

  const pendingOrdersCount = useMemo(
    () =>
      orders.filter(
        (o) => o.statut === 'attente_reception' || o.statut === 'recu_lbg'
      ).length,
    [orders]
  );

  const availableBottlesCount = useMemo(
    () => stockRows.reduce((s, r) => s + Math.max(0, r.disponibleVente), 0),
    [stockRows]
  );

  return (
    <div className="min-h-screen flex bg-[#F6F6F4] text-[#141413]">
      {/* Mobile Drawer Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E5E4DF] flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#E5E4DF]">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setMobileNavOpen(false);
            }}
            className="flex items-center gap-2.5 text-left focus:outline-none min-w-0"
          >
            <img
              src="/logo-lbg.png"
              alt="Logo Le Bon Grain d’Ivresse"
              className="w-9 h-9 rounded-lg object-cover border border-[#E5E4DF] shadow-xs shrink-0"
            />
            <span className="font-display text-lg font-semibold tracking-tight text-[#141413] truncate">
              Le Bon Grain d’Ivresse
            </span>
          </button>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="lg:hidden p-1.5 text-[#6B6B66] hover:text-[#141413]"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9E9B93]">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const countHint =
                  item.id === 'orders' && pendingOrdersCount > 0
                    ? pendingOrdersCount
                    : item.id === 'stock' && availableBottlesCount > 0
                      ? availableBottlesCount
                      : null;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[#721C24]/10 text-[#721C24]'
                        : 'text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4]'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#721C24]' : 'text-[#6B6B66]'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {countHint !== null && (
                      <span className="text-[11px] font-mono-num text-[#6B6B66]">
                        {countHint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-[#E5E4DF] space-y-2.5">
          <div className="text-xs text-[#6B6B66]">
            <div className="font-medium text-[#141413]">Romain Becker</div>
            <div>Négoce &amp; Allocations</div>
          </div>
          <button
            type="button"
            onClick={isDemoMode ? handleDisableDemoMode : handleEnableDemoMode}
            className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
              isDemoMode
                ? 'bg-[#721C24]/10 text-[#721C24] border-[#721C24]/30 hover:bg-[#721C24]/15'
                : 'bg-[#FAF9F7] text-[#15803D] border-[#E5E4DF] hover:bg-[#F3F1EC]'
            }`}
            title={
              isDemoMode
                ? 'Cliquer pour retirer les lots démo et revenir aux données Excel strictes'
                : 'Cliquer pour charger le scénario démo (+ achats & avances)'
            }
          >
            <span>{isDemoMode ? 'Mode Démo actif' : 'Données Excel strictes'}</span>
            <span className="underline">
              {isDemoMode ? 'Excel' : '+ Démo'}
            </span>
          </button>
          <button
            onClick={() => setConfirmResetOpen(true)}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6B6B66] hover:text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser Excel</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-[#E5E4DF] px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#6B6B66] hover:text-[#141413] rounded-lg"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src="/logo-lbg.png"
              alt="Le Bon Grain d’Ivresse"
              className="w-7 h-7 rounded-md object-cover border border-[#E5E4DF] lg:hidden shrink-0"
            />
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-[#6B6B66] hidden sm:inline whitespace-nowrap">
                Le Bon Grain d’Ivresse
              </span>
              <span
                aria-hidden="true"
                className="text-[#C7C5BE] hidden sm:inline"
              >
                /
              </span>
              <span className="font-medium text-[#141413] truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAssistantOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#721C24] bg-[#721C24]/8 hover:bg-[#721C24]/15 border border-[#721C24]/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Ouvrir l’Assistant Négoce IA (⌘K)"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Assistant IA</span>
              <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 text-[10px] font-mono-num bg-white/80 border border-[#721C24]/20 rounded">
                ⌘K
              </kbd>
            </button>
            <button
              onClick={() => setInvoiceAIModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 text-xs font-medium text-[#141413] bg-[#FAF9F7] hover:bg-[#ECEAE4] border border-[#D8D6D0] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#721C24]" />
              <span>Facture IA</span>
            </button>
            <button
              onClick={() => setImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Importer HelloAsso</span>
              <span className="sm:hidden">HelloAsso</span>
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mx-6 mt-4 px-4 py-3 bg-[#141413] text-white text-sm rounded-lg flex items-center justify-between gap-4 shadow-lg no-print">
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="text-white/70 hover:text-white"
              aria-label="Fermer la notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Active View Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              catalog={catalog}
              orders={orders}
              stockRows={stockRows}
              campaigns={campaigns}
              settings={settings}
              isDemoMode={isDemoMode}
              onEnableDemoMode={handleEnableDemoMode}
              onDisableDemoMode={handleDisableDemoMode}
              onNavigate={setActiveTab}
              onOpenCampaignOrders={(vente) => {
                setActiveTab('orders');
                setViewFocus({ nonce: Date.now(), tab: 'orders', vente });
              }}
              onOpenImport={() => setImportModalOpen(true)}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
              onOpenNewLot={() => {
                setSupplierLotPrefill(null);
                setPreselectedLotCatalogId(undefined);
                setSupplierLotModalOpen(true);
              }}
              onOpenNewDirectOrder={() => {
                setDirectOrderPrefill(null);
                setDirectOrderModalOpen(true);
              }}
              onUpdateCampaignStatus={handleUpdateCampaignStatus}
              onAddCampaign={handleAddCampaign}
            />
          )}

          {activeTab === 'stock' && (
            <StockView
              stockRows={stockRows}
              lots={lots}
              catalog={catalog}
              isDemoMode={isDemoMode}
              onEnableDemoMode={handleEnableDemoMode}
              onDisableDemoMode={handleDisableDemoMode}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
              initialFocus={tabFocus.stock}
              onOpenNewLot={(catId) => {
                setSupplierLotPrefill(null);
                setPreselectedLotCatalogId(catId);
                setSupplierLotModalOpen(true);
              }}
              onReceiveLot={handleReceiveLot}
              onDeleteLot={handleDeleteLot}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              catalog={catalog}
              settings={settings}
              initialFocus={tabFocus.orders}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onUpdateOrder={handleUpdateOrder}
              onBulkUpdateCampaignStatus={handleBulkUpdateCampaignStatus}
              onDeleteOrder={handleDeleteOrder}
              onOpenImport={() => setImportModalOpen(true)}
              onOpenNewDirectOrder={() => {
                setDirectOrderPrefill(null);
                setDirectOrderModalOpen(true);
              }}
            />
          )}

          {activeTab === 'finance' && (
            <FinanceView
              catalog={catalog}
              orders={orders}
              settings={settings}
              initialFocus={tabFocus.finance}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingView
              catalog={catalog}
              lots={lots}
              orders={orders}
              settings={settings}
              initialFocus={tabFocus.accounting}
              onAssignInvoiceNumbers={handleAssignInvoiceNumbers}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              orders={orders}
              catalog={catalog}
              settings={settings}
              initialFocus={tabFocus.clients}
              onUpdateSettings={setSettings}
              onMarkClientReadyDelivered={handleMarkClientReadyDelivered}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              catalog={catalog}
              settings={settings}
              initialFocus={tabFocus.catalog}
              prefillNew={catalogPrefillNew}
              onClearPrefillNew={() => setCatalogPrefillNew(null)}
              onUpdateCatalogItem={handleUpdateCatalogItem}
              onAddCatalogItem={handleAddCatalogItem}
              onDeleteCatalogItem={handleDeleteCatalogItem}
            />
          )}

          {activeTab === 'winelist' && (
            <WineListView
              catalog={catalog}
              stockRows={stockRows}
              settings={settings}
              onUpdateCatalogItem={handleUpdateCatalogItem}
              onBatchUpdateCatalog={handleBatchUpdateCatalog}
              onUpdateSettings={setSettings}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <ImportHelloAssoModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        catalog={catalog}
        existingRefs={existingRefs}
        onImportOrders={handleImportOrders}
      />

      <InvoiceAIModal
        isOpen={invoiceAIModalOpen}
        onClose={() => setInvoiceAIModalOpen(false)}
        catalog={catalog}
        existingInvoiceRefs={existingInvoiceRefs}
        onApplyAchat={handleApplyInvoiceAchat}
        onApplyVente={handleApplyInvoiceVente}
      />

      <NewDirectOrderModal
        isOpen={directOrderModalOpen}
        onClose={() => {
          setDirectOrderModalOpen(false);
          setDirectOrderPrefill(null);
        }}
        catalog={catalog}
        stockRows={stockRows}
        prefill={directOrderPrefill}
        onAddOrder={handleAddDirectOrder}
      />

      <NewSupplierLotModal
        isOpen={supplierLotModalOpen}
        onClose={() => {
          setSupplierLotModalOpen(false);
          setSupplierLotPrefill(null);
        }}
        catalog={catalog}
        preselectedCatalogId={preselectedLotCatalogId}
        prefill={supplierLotPrefill}
        onAddLot={handleAddLot}
      />

      <AssistantPanel
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        ctx={{
          catalog,
          lots,
          orders,
          campaigns,
          settings,
          activeTab,
        }}
        tabLabel={activeNavLabel}
        onExecuteAction={handleExecuteAssistantAction}
      />

      {/* Safe Confirmation Modal for Reset */}
      {confirmResetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 no-print"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white border border-[#E5E4DF] rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-[#141413]">
              Restaurer les données initiales du tableur ?
            </h3>
            <p className="text-xs text-[#6B6B66] leading-relaxed">
              Attention : toutes les commandes, lots et modifications saisis
              localement dans ce navigateur seront remplacés par les données de
              référence du fichier Excel.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-[#6B6B66] hover:text-[#141413]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-4 py-2 text-xs font-medium text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg"
              >
                Confirmer la restauration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
