/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
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
  INITIAL_CAMPAIGNS,
  INITIAL_CATALOG,
  INITIAL_LOTS,
  INITIAL_ORDERS,
} from './data/seedData';
import { computeStockSummaries } from './utils/wineMath';
import { DashboardView } from './components/DashboardView';
import { StockView } from './components/StockView';
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

const STORAGE_KEYS = {
  catalog: 'lbg_catalog_v1',
  lots: 'lbg_lots_v1',
  orders: 'lbg_orders_v1',
  campaigns: 'lbg_campaigns_v1',
  settings: 'lbg_settings_v1',
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
      { id: 'stock', label: 'Stock & Cave', icon: Warehouse },
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
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadStored(STORAGE_KEYS.settings, DEFAULT_SETTINGS)
  );

  // Modals
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [invoiceAIModalOpen, setInvoiceAIModalOpen] = useState(false);
  const [directOrderModalOpen, setDirectOrderModalOpen] = useState(false);
  const [supplierLotModalOpen, setSupplierLotModalOpen] = useState(false);
  const [preselectedLotCatalogId, setPreselectedLotCatalogId] = useState<
    string | undefined
  >(undefined);

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

  const handleAddLot = (lot: SupplierLot) => {
    setLots((prev) => [lot, ...prev]);
    const cat = catalog.find((c) => c.id === lot.catalogId);
    notify(
      `Stock mis à jour : +${lot.qteCommandee} btl (${cat?.cuvee ?? 'Cuvée'}).`
    );
  };

  const handleReceiveLot = (lotId: string, alsoUpdateOrders: boolean) => {
    const targetLot = lots.find((l) => l.id === lotId);
    if (!targetLot) return;

    setLots((prev) =>
      prev.map((l) =>
        l.id === lotId
          ? { ...l, qteRecue: l.qteCommandee, statutLot: 'recu_cave' }
          : l
      )
    );

    let updatedOrdersCount = 0;
    if (alsoUpdateOrders) {
      setOrders((prev) =>
        prev.map((o) => {
          if (
            o.catalogId === targetLot.catalogId &&
            o.statut === 'attente_reception'
          ) {
            updatedOrdersCount++;
            return { ...o, statut: 'recu_lbg' };
          }
          return o;
        })
      );
    }

    const cat = catalog.find((c) => c.id === targetLot.catalogId);
    notify(
      `Lot réceptionné en cave (${cat?.cuvee ?? ''})${
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
  };

  const handleMarkClientReadyDelivered = (clientKey: string) => {
    let count = 0;
    setOrders((prev) =>
      prev.map((o) => {
        const key = (
          o.emailClient ||
          `${o.nomClient.trim().toLowerCase()}_${o.prenomClient.trim().toLowerCase()}`
        ).toLowerCase();
        if (key === clientKey && o.statut === 'recu_lbg') {
          count += o.qte;
          return { ...o, statut: 'remis_client' };
        }
        return o;
      })
    );
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
    setLots((prev) => [...newLots, ...prev]);
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

  const handleResetDemo = () => {
    setCatalog(INITIAL_CATALOG);
    setLots(INITIAL_LOTS);
    setOrders(INITIAL_ORDERS);
    setCampaigns(INITIAL_CAMPAIGNS);
    setSettings(DEFAULT_SETTINGS);
    notify('Données initiales restaurées.');
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
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#E5E4DF]">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setMobileNavOpen(false);
            }}
            className="text-left focus:outline-none"
          >
            <span className="font-display text-xl font-semibold tracking-tight text-[#141413] whitespace-nowrap">
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

        <div className="p-4 border-t border-[#E5E4DF] space-y-3">
          <div className="text-xs text-[#6B6B66]">
            <div className="font-medium text-[#141413]">Romain Becker</div>
            <div>Négoce &amp; Allocations</div>
          </div>
          <button
            onClick={handleResetDemo}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6B6B66] hover:text-[#141413] bg-[#F6F6F4] hover:bg-[#ECEAE4] rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser données démo</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (3-zone contract / SaaS breadcrumb + primary CTA) */}
        <header className="h-16 bg-white border-b border-[#E5E4DF] px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#6B6B66] hover:text-[#141413] rounded-lg"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
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
              onNavigate={setActiveTab}
              onOpenImport={() => setImportModalOpen(true)}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
              onOpenNewLot={() => {
                setPreselectedLotCatalogId(undefined);
                setSupplierLotModalOpen(true);
              }}
              onOpenNewDirectOrder={() => setDirectOrderModalOpen(true)}
              onUpdateCampaignStatus={handleUpdateCampaignStatus}
              onAddCampaign={handleAddCampaign}
            />
          )}

          {activeTab === 'stock' && (
            <StockView
              stockRows={stockRows}
              lots={lots}
              catalog={catalog}
              onOpenNewLot={(catId) => {
                setPreselectedLotCatalogId(catId);
                setSupplierLotModalOpen(true);
              }}
              onReceiveLot={handleReceiveLot}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              catalog={catalog}
              settings={settings}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onBulkUpdateCampaignStatus={handleBulkUpdateCampaignStatus}
              onDeleteOrder={handleDeleteOrder}
              onOpenImport={() => setImportModalOpen(true)}
              onOpenNewDirectOrder={() => setDirectOrderModalOpen(true)}
            />
          )}

          {activeTab === 'finance' && (
            <FinanceView
              catalog={catalog}
              orders={orders}
              settings={settings}
              onUpdateSettings={setSettings}
            />
          )}

          {activeTab === 'accounting' && (
            <AccountingView
              catalog={catalog}
              lots={lots}
              orders={orders}
              settings={settings}
              onAssignInvoiceNumbers={handleAssignInvoiceNumbers}
              onOpenInvoiceAI={() => setInvoiceAIModalOpen(true)}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              orders={orders}
              catalog={catalog}
              settings={settings}
              onUpdateSettings={setSettings}
              onMarkClientReadyDelivered={handleMarkClientReadyDelivered}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              catalog={catalog}
              settings={settings}
              onUpdateCatalogItem={handleUpdateCatalogItem}
              onAddCatalogItem={handleAddCatalogItem}
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
        onApplyAchat={handleApplyInvoiceAchat}
        onApplyVente={handleApplyInvoiceVente}
      />

      <NewDirectOrderModal
        isOpen={directOrderModalOpen}
        onClose={() => setDirectOrderModalOpen(false)}
        catalog={catalog}
        onAddOrder={handleAddDirectOrder}
      />

      <NewSupplierLotModal
        isOpen={supplierLotModalOpen}
        onClose={() => setSupplierLotModalOpen(false)}
        catalog={catalog}
        preselectedCatalogId={preselectedLotCatalogId}
        onAddLot={handleAddLot}
      />
    </div>
  );
}
