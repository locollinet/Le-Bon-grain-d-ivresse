import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import type { ActiveTab } from '../../types/wine';
import { formatDateFR } from '../../utils/wineMath';
import { askAssistant, sendAssistantFeedback } from './client';
import {
  getContextualSuggestions,
  HELP_ARTICLES,
  searchHelpArticles,
} from './helpContent';
import type { AssistantToolContext } from './tools';
import type {
  AssistantAction,
  AssistantContent,
  AssistantThread,
  ChatMessage,
  MetricTone,
  ResultCard,
} from './types';

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  ctx: AssistantToolContext;
  tabLabel: string;
  onExecuteAction: (action: AssistantAction) => void;
  threads?: AssistantThread[];
  currentUserUid?: string;
  userDisplayName?: string;
  onSaveThread?: (thread: AssistantThread) => Promise<void>;
  onDeleteThread?: (threadId: string) => Promise<void>;
}

const TONE_TEXT_CLASS: Record<MetricTone, string> = {
  neutral: 'text-[#141413]',
  ok: 'text-[#15803D]',
  warn: 'text-[#B45309]',
  bad: 'text-[#B91C1C]',
  brand: 'text-[#721C24]',
};

const TONE_BADGE_CLASS: Record<MetricTone, string> = {
  neutral: 'bg-[#F6F6F4] text-[#6B6B66] border-[#E5E4DF]',
  ok: 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]',
  warn: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  bad: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
  brand: 'bg-[#721C24]/10 text-[#721C24] border-[#721C24]/20',
};

const TAB_NAMES: Record<ActiveTab, string> = {
  dashboard: 'Tableau de bord',
  stock: 'Stock & Cave',
  domains: 'Domaines & Achats',
  orders: 'Commandes',
  finance: 'Bilans financiers',
  accounting: 'Facturation & TVA',
  clients: 'Clients & CRM',
  catalog: 'Catalogue & Tarifs',
  winelist: 'Carte des vins',
  settings: 'Paramètres',
};

export const AssistantPanel: React.FC<AssistantPanelProps> = ({
  isOpen,
  onClose,
  ctx,
  tabLabel,
  onExecuteAction,
  threads = [],
  currentUserUid,
  userDisplayName,
  onSaveThread,
  onDeleteThread,
}) => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeThreadCreatedAt, setActiveThreadCreatedAt] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<AssistantContent[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stepLabel, setStepLabel] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isLoading, stepLabel]);

  if (!isOpen) return null;

  const suggestions = getContextualSuggestions(ctx.activeTab);
  const matchingHelp = input.trim()
    ? searchHelpArticles(input, 3)
    : HELP_ARTICLES.slice(0, 4);

  const handleReset = () => {
    setActiveThreadId(null);
    setActiveThreadCreatedAt(null);
    setMessages([]);
    setHistory([]);
    setInput('');
    setStepLabel('');
    setShowHistory(false);
    setShowHelp(false);
  };

  const handleLoadThread = (thread: AssistantThread) => {
    setActiveThreadId(thread.id);
    setActiveThreadCreatedAt(thread.createdAt);
    setMessages(thread.messages);
    setHistory(thread.history);
    setShowHistory(false);
    setShowHelp(false);
  };

  const handleDeleteSavedThread = (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    if (threadId === activeThreadId) {
      handleReset();
    }
    if (onDeleteThread) {
      void onDeleteThread(threadId);
    }
  };

  const persistThread = (
    nextMessages: ChatMessage[],
    nextHistory: AssistantContent[],
    existingId: string | null,
    existingCreatedAt: string | null
  ) => {
    if (!onSaveThread || !currentUserUid || nextMessages.length === 0) return;
    const now = new Date().toISOString();
    const id =
      existingId ??
      `thr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = existingCreatedAt ?? now;
    const firstUserMsg = nextMessages.find((m) => m.role === 'user')?.text ?? 'Conversation';
    const title = firstUserMsg.trim().slice(0, 120) || 'Conversation';

    if (!existingId) {
      setActiveThreadId(id);
      setActiveThreadCreatedAt(createdAt);
    }

    void onSaveThread({
      id,
      ownerUid: currentUserUid,
      title,
      messages: nextMessages,
      history: nextHistory,
      messageCount: nextMessages.length,
      createdAt,
      updatedAt: now,
    });
  };

  const handleActionClick = (action: AssistantAction, actionKey: string) => {
    if (action.type === 'copy_text') {
      setCopiedId(actionKey);
      setTimeout(() => setCopiedId(null), 2000);
    }
    onExecuteAction(action);
  };

  const handleSend = async (promptText?: string) => {
    const q = (promptText ?? input).trim();
    if (!q || isLoading) return;

    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      text: q,
    };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    if (!promptText) setInput('');
    setShowHelp(false);
    setShowHistory(false);

    if (!isOnline) {
      const localHelp = searchHelpArticles(q, 2);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          error: true,
          text:
            localHelp.length > 0
              ? `Mode hors-ligne : voici la fiche d’aide locale la plus proche (« ${localHelp[0].title} ») — ${localHelp[0].summary}`
              : 'Vous êtes hors-ligne. L’assistant IA nécessite une connexion internet pour interroger Gemini.',
        },
      ]);
      return;
    }

    setIsLoading(true);
    setStepLabel('Analyse de votre demande…');

    try {
      const res = await askAssistant({
        question: q,
        history,
        ctx,
        onStep: (label) => setStepLabel(label),
      });

      const assistantMsg: ChatMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        text: res.answer.text,
        cards: res.cards,
        followUps: res.answer.followUps,
        usedTools: res.answer.usedTools,
        model: res.model,
        questionId: res.questionId,
      };
      const nextMessages = [...withUser, assistantMsg];

      setHistory(res.history);
      setMessages(nextMessages);
      persistThread(nextMessages, res.history, activeThreadId, activeThreadCreatedAt);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Impossible de joindre l’assistant IA.';
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_e_${Date.now()}`,
          role: 'assistant',
          error: true,
          text: msg,
        },
      ]);
    } finally {
      setIsLoading(false);
      setStepLabel('');
    }
  };

  const handleVote = async (msg: ChatMessage, vote: 'up' | 'down') => {
    if (!msg.questionId || msg.vote === vote) return;
    const nextMessages = messages.map((m) =>
      m.id === msg.id ? { ...m, vote } : m
    );
    setMessages(nextMessages);
    if (activeThreadId) {
      persistThread(nextMessages, history, activeThreadId, activeThreadCreatedAt);
    }
    try {
      await sendAssistantFeedback({
        questionId: msg.questionId,
        vote,
        model: msg.model,
        usedTools: msg.usedTools,
      });
    } catch {
      // ignore network error on non-blocking feedback
    }
  };

  const renderCard = (card: ResultCard, msgId: string) => {
    const borderClass =
      card.tone === 'bad'
        ? 'border-[#FECACA] bg-[#FEF2F2]/40'
        : card.tone === 'warn'
          ? 'border-[#FDE68A] bg-[#FFFBEB]/40'
          : card.tone === 'brand'
            ? 'border-[#721C24]/25 bg-[#FAF9F7]'
            : 'border-[#E5E4DF] bg-white';

    return (
      <div
        key={`${msgId}_${card.id}`}
        className={`rounded-xl border p-3.5 space-y-2.5 text-xs ${borderClass}`}
      >
        <div>
          <div className="font-semibold text-[#141413] text-[13px]">
            {card.title}
          </div>
          {card.subtitle && (
            <div className="text-[#6B6B66] mt-0.5 leading-relaxed">
              {card.subtitle}
            </div>
          )}
        </div>

        {card.metrics && card.metrics.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {card.metrics.slice(0, 3).map((m, idx) => (
              <div
                key={idx}
                className="bg-white border border-[#ECEAE4] rounded-lg px-2.5 py-1.5"
              >
                <div className="text-[10px] text-[#6B6B66] truncate">
                  {m.label}
                </div>
                <div
                  className={`font-semibold font-mono-num text-xs mt-0.5 truncate ${
                    TONE_TEXT_CLASS[m.tone ?? 'neutral']
                  }`}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {card.items && card.items.length > 0 && (
          <div className="divide-y divide-[#ECEAE4] bg-white border border-[#ECEAE4] rounded-lg overflow-hidden">
            {card.items.slice(0, 8).map((item) => {
              const inner = (
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#141413] truncate">
                      {item.title}
                    </div>
                    {item.subtitle && (
                      <div className="text-[11px] text-[#6B6B66] truncate">
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded border whitespace-nowrap ${
                          TONE_BADGE_CLASS[item.badgeTone ?? 'neutral']
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.rightValue && (
                      <span className="font-mono-num font-semibold text-[#141413]">
                        {item.rightValue}
                      </span>
                    )}
                  </div>
                </div>
              );

              if (item.action) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      handleActionClick(item.action!, `${msgId}_${item.id}`)
                    }
                    className="w-full hover:bg-[#FAF9F7] transition-colors block"
                  >
                    {inner}
                  </button>
                );
              }
              return <div key={item.id}>{inner}</div>;
            })}
          </div>
        )}

        {card.action && card.actionLabel && (
          <button
            type="button"
            onClick={() =>
              handleActionClick(card.action!, `${msgId}_${card.id}_cta`)
            }
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#721C24] hover:bg-[#5B151C] rounded-lg transition-colors"
          >
            {card.action.type === 'copy_text' ? (
              copiedId === `${msgId}_${card.id}_cta` ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Message copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>{card.actionLabel}</span>
                </>
              )
            ) : (
              <>
                <span>{card.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print">
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Assistant IA Le Bon Grain d'Ivresse"
        className="relative z-10 w-full max-w-[490px] bg-[#FAF9F7] border-l border-[#E5E4DF] shadow-2xl flex flex-col h-full"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E5E4DF] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo-lbg.png"
              alt="Le Bon Grain d’Ivresse"
              className="w-9 h-9 rounded-lg object-cover border border-[#E5E4DF] shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#721C24] shrink-0" />
                <h2 className="text-sm font-semibold text-[#141413] truncate">
                  Assistant Négoce IA
                </h2>
              </div>
              <div className="text-[11px] text-[#6B6B66] truncate">
                {userDisplayName || 'Romain Becker'} · {tabLabel || TAB_NAMES[ctx.activeTab]}
                {ctx.settings.anonymizeClients ? ' · Confidentialité' : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowHistory((v) => !v);
                setShowHelp(false);
              }}
              title="Historique des conversations"
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                showHistory
                  ? 'bg-[#721C24]/10 text-[#721C24]'
                  : 'text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4]'
              }`}
            >
              <History className="w-4 h-4" />
              {threads.length > 0 && (
                <span className="font-mono-num text-[11px] font-medium">
                  {threads.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowHelp((v) => !v);
                setShowHistory(false);
              }}
              title="Fiches d’aide métier"
              className={`p-2 rounded-lg text-xs transition-colors ${
                showHelp
                  ? 'bg-[#721C24]/10 text-[#721C24]'
                  : 'text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleReset}
              title="Nouvelle conversation"
              className="p-2 text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4] rounded-lg transition-colors"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer l’assistant"
              className="p-2 text-[#6B6B66] hover:text-[#141413] hover:bg-[#F6F6F4] rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!isOnline && (
          <div className="px-4 py-2 bg-[#FEF2F2] border-b border-[#FECACA] text-xs text-[#B91C1C] flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              Connexion hors-ligne détectée. Consultez les fiches d’aide ci-dessous.
            </span>
          </div>
        )}

        {/* Messages / History / Help Body */}
        <div
          ref={scrollRef}
          aria-live="polite"
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {showHistory && (
            <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#721C24]">
                  Historique cloud ({threads.length})
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-xs font-medium text-[#721C24] hover:underline"
                  >
                    + Nouvelle
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="text-xs text-[#6B6B66] hover:text-[#141413]"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              {threads.length === 0 ? (
                <p className="text-xs text-[#6B6B66] py-3 text-center">
                  Aucune conversation sauvegardée pour le moment. Vos échanges sont
                  enregistrés automatiquement dès la première réponse.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {threads.map((t) => {
                    const isCurrent = t.id === activeThreadId;
                    const dateLabel = t.updatedAt
                      ? `${formatDateFR(t.updatedAt)} · ${t.updatedAt.slice(11, 16)}`
                      : '';
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleLoadThread(t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleLoadThread(t);
                          }
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                          isCurrent
                            ? 'bg-[#FDF8F8] border-[#721C24]/35'
                            : 'bg-[#FAF9F7] border-[#ECEAE4] hover:bg-[#F3F1EC]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[#141413] truncate">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-[#6B6B66] mt-0.5 flex items-center gap-1.5">
                            <span>{dateLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num">
                              {t.messageCount} msg
                            </span>
                            {isCurrent && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-[#721C24] font-medium">
                                  Ouverte
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {onDeleteThread && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSavedThread(e, t.id)}
                            title="Supprimer cette conversation"
                            aria-label="Supprimer cette conversation"
                            className="p-1.5 text-[#9E9B93] hover:text-[#B91C1C] hover:bg-white rounded-md transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showHelp && (
            <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#721C24]">
                  Fiches réflexes négoce
                </span>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  className="text-xs text-[#6B6B66] hover:text-[#141413]"
                >
                  Fermer
                </button>
              </div>
              <div className="space-y-2.5">
                {matchingHelp.map((art) => (
                  <div
                    key={art.id}
                    className="p-3 bg-[#FAF9F7] border border-[#ECEAE4] rounded-lg space-y-1"
                  >
                    <div className="text-xs font-semibold text-[#141413]">
                      {art.title}
                    </div>
                    <p className="text-[11px] text-[#6B6B66]">{art.summary}</p>
                    <ul className="text-[11px] text-[#141413] list-disc pl-4 space-y-0.5 pt-1">
                      {art.steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {messages.length === 0 && !showHelp && !showHistory && (
            <div className="space-y-4 pt-2">
              <div className="bg-white border border-[#E5E4DF] rounded-xl p-4 space-y-2">
                <div className="font-display text-lg font-semibold text-[#141413]">
                  Votre copilote négoce au quotidien
                </div>
                <p className="text-xs text-[#6B6B66] leading-relaxed">
                  Interrogez en direct vos stocks, allocations, achats en avance,
                  marges nettes, TVA ou clients — et pré-remplissez vos saisies
                  sans jamais risquer d’écriture automatique.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6B6B66] px-1">
                  Suggestions sur « {tabLabel} »
                </div>
                <div className="space-y-1.5">
                  {suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => handleSend(sug)}
                      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-[#141413] bg-white hover:bg-[#F3F1EC] border border-[#E5E4DF] rounded-xl transition-colors flex items-center justify-between gap-2"
                    >
                      <span>{sug}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#721C24] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-[#721C24] text-white text-xs leading-relaxed shadow-sm">
                    {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className="space-y-2.5">
                <div
                  className={`px-3.5 py-2.5 rounded-2xl rounded-bl-sm border text-xs leading-relaxed whitespace-pre-line ${
                    msg.error
                      ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                      : 'bg-white border-[#E5E4DF] text-[#141413]'
                  }`}
                >
                  {msg.text}
                </div>

                {msg.cards &&
                  msg.cards.map((card) => renderCard(card, msg.id))}

                {msg.followUps && msg.followUps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.followUps.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => handleSend(f)}
                        className="px-2.5 py-1 text-[11px] font-medium text-[#721C24] bg-white hover:bg-[#721C24]/8 border border-[#721C24]/25 rounded-full transition-colors text-left"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}

                {msg.questionId && !msg.error && (
                  <div className="flex items-center justify-between px-1 text-[11px] text-[#9E9B93]">
                    <span>
                      {msg.usedTools && msg.usedTools.length > 0
                        ? `Sources : ${msg.usedTools.join(', ')}`
                        : 'Réponse directe'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleVote(msg, 'up')}
                        aria-label="Réponse utile"
                        className={`p-1 rounded hover:bg-[#ECEAE4] transition-colors ${
                          msg.vote === 'up'
                            ? 'text-[#15803D]'
                            : 'text-[#9E9B93]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVote(msg, 'down')}
                        aria-label="Réponse à améliorer"
                        className={`p-1 rounded hover:bg-[#ECEAE4] transition-colors ${
                          msg.vote === 'down'
                            ? 'text-[#B91C1C]'
                            : 'text-[#9E9B93]'
                        }`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-[#E5E4DF] rounded-xl text-xs text-[#6B6B66]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#721C24] shrink-0" />
              <span>{stepLabel || 'Réflexion en cours…'}</span>
            </div>
          )}
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3.5 bg-white border-t border-[#E5E4DF]"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question ou demandez une saisie (⌘K)…"
              disabled={isLoading}
              className="flex-1 px-3.5 py-2 text-xs bg-[#FAF9F7] border border-[#D8D6D0] rounded-lg focus:outline-none focus:border-[#721C24] focus:bg-white disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Envoyer"
              className="p-2 bg-[#721C24] hover:bg-[#5B151C] disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
};
