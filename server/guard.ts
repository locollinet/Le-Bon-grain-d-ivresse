import type { NextFunction, Request, Response } from 'express';

const ONE_HOUR_MS = 60 * 60 * 1000;
const QUESTION_TTL_MS = 2 * 60 * 1000;
export const MAX_CALLS_PER_QUESTION = 5;
export const ASSISTANT_HOURLY_LIMIT = 60;
export const INVOICE_HOURLY_LIMIT = 30;

interface QuestionEntry {
  ownerKey: string;
  count: number;
  expiresAt: number;
}

const hourlyBuckets = new Map<string, number[]>();
const questionWindows = new Map<string, QuestionEntry>();

export function resetGuardsForTest(): void {
  hourlyBuckets.clear();
  questionWindows.clear();
}

export function getClientOwnerKey(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const firstIp = Array.isArray(fwd)
    ? fwd[0]
    : typeof fwd === 'string'
      ? fwd.split(',')[0]
      : '';
  const ip = (firstIp || req.ip || req.socket?.remoteAddress || 'local').trim();
  return `ip:${ip}`;
}

export function requireAccessIfConfigured(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const expected = process.env.LBG_ACCESS_TOKEN?.trim();
  if (!expected) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const bearer =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : '';
  const customHeader =
    typeof req.headers['x-access-token'] === 'string'
      ? req.headers['x-access-token'].trim()
      : '';

  if (bearer === expected || customHeader === expected) {
    next();
    return;
  }

  res.status(401).json({
    error: 'Accès non autorisé à l’API IA.',
  });
}

function consumeHourlyQuota(
  bucketKey: string,
  limit: number,
  now = Date.now()
): { allowed: boolean; remaining: number } {
  const cutoff = now - ONE_HOUR_MS;
  const existing = (hourlyBuckets.get(bucketKey) ?? []).filter(
    (ts) => ts > cutoff
  );
  if (existing.length >= limit) {
    hourlyBuckets.set(bucketKey, existing);
    return { allowed: false, remaining: 0 };
  }
  existing.push(now);
  hourlyBuckets.set(bucketKey, existing);
  return { allowed: true, remaining: Math.max(0, limit - existing.length) };
}

export function checkInvoiceRateLimit(
  ownerKey: string,
  now = Date.now()
): { allowed: boolean; error?: string } {
  const res = consumeHourlyQuota(`invoice:${ownerKey}`, INVOICE_HOURLY_LIMIT, now);
  if (!res.allowed) {
    return {
      allowed: false,
      error: 'Trop d’analyses de factures sur la dernière heure. Réessayez plus tard.',
    };
  }
  return { allowed: true };
}

export function checkQuestionTurn(
  questionId: string,
  ownerKey: string,
  now = Date.now(),
  hourlyLimit = ASSISTANT_HOURLY_LIMIT
): { allowed: boolean; turnCount: number; error?: string } {
  // Purge des fenêtres expirées
  for (const [k, entry] of questionWindows.entries()) {
    if (entry.expiresAt <= now) {
      questionWindows.delete(k);
    }
  }

  const cleanQid = questionId.trim();
  if (!cleanQid) {
    return {
      allowed: false,
      turnCount: 0,
      error: 'Identifiant de question (X-Question-Id) manquant.',
    };
  }

  const mapKey = `${ownerKey}::${cleanQid}`;
  const existing = questionWindows.get(mapKey);

  if (existing && existing.expiresAt > now) {
    if (existing.count >= MAX_CALLS_PER_QUESTION) {
      return {
        allowed: false,
        turnCount: existing.count,
        error: `Plafond de ${MAX_CALLS_PER_QUESTION} tours atteint pour cette question.`,
      };
    }
    existing.count += 1;
    existing.expiresAt = now + QUESTION_TTL_MS;
    return { allowed: true, turnCount: existing.count };
  }

  // 1er appel pour ce questionId : décompte 1 unité sur le quota horaire
  const quota = consumeHourlyQuota(`assistant:${ownerKey}`, hourlyLimit, now);
  if (!quota.allowed) {
    return {
      allowed: false,
      turnCount: 0,
      error:
        'Quota horaire de l’assistant IA atteint. Patientez quelques minutes avant de relancer.',
    };
  }

  questionWindows.set(mapKey, {
    ownerKey,
    count: 1,
    expiresAt: now + QUESTION_TTL_MS,
  });
  return { allowed: true, turnCount: 1 };
}
