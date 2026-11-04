/**
 * Stripe (assinatura do SaaS), sem a biblioteca do Stripe: chamadas HTTP diretas e conferência da
 * assinatura do aviso (Stripe-Signature) com HMAC-SHA256. Só entra em uso com STRIPE_ENABLED=true.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BillingPort } from '../../src/shared/core/ports.ts';

const API = 'https://api.stripe.com/v1';

function form(data: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== '') p.append(k, String(v));
  return p.toString();
}

export function stripeBilling(secretKey: string): BillingPort {
  const call = async <T>(path: string, data: Record<string, string | number | undefined>, method = 'POST'): Promise<T> => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: method === 'GET' ? undefined : form(data),
    });
    const body = (await res.json()) as T & { error?: { type?: string } };
    if (!res.ok) throw new Error(`stripe_${res.status}_${body.error?.type || 'erro'}`);
    return body;
  };
  return {
    name: 'stripe',
    async createCheckout(a) {
      const s = await call<{ url: string }>('/checkout/sessions', {
        mode: 'subscription',
        'line_items[0][price]': a.priceId,
        'line_items[0][quantity]': a.quantity,
        success_url: a.successUrl,
        cancel_url: a.cancelUrl,
        client_reference_id: a.tenantId,
        'metadata[tenantId]': a.tenantId,
        'metadata[planId]': a.planId,
        'metadata[period]': a.period,
        'subscription_data[metadata][tenantId]': a.tenantId,
        'subscription_data[metadata][planId]': a.planId,
        'subscription_data[metadata][period]': a.period,
        'subscription_data[description]': a.tenantName,
        locale: 'pt-BR',
        ...(a.customerId ? { customer: a.customerId } : { customer_email: a.customerEmail }),
      });
      return { url: s.url };
    },
    async portal(a) {
      const s = await call<{ url: string }>('/billing_portal/sessions', { customer: a.customerId, return_url: a.returnUrl });
      return { url: s.url };
    },
    async updateQuantity(subscriptionId, quantity) {
      const sub = await call<{ items: { data: { id: string }[] } }>(`/subscriptions/${subscriptionId}`, {}, 'GET');
      const item = sub.items.data[0]?.id;
      if (!item) return;
      await call(`/subscriptions/${subscriptionId}`, { 'items[0][id]': item, 'items[0][quantity]': quantity, proration_behavior: 'create_prorations' });
    },
  };
}

/** Confere o cabeçalho Stripe-Signature (t=...,v1=...) com tolerância de 5 minutos */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  const t = Number(parts.t);
  const v1 = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!t || !v1.length || Math.abs(nowSec - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return v1.some(sig => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

/** Traduz o aviso do Stripe para a operação interna billing.stripeEvent (ou null se não interessa) */
export function stripeEventToOp(ev: StripeEvent, planForPrice: (priceId: string) => { planId: string; period: 'mensal' | 'anual' } | null) {
  const o = ev.data.object as {
    metadata?: { tenantId?: string; planId?: string; period?: string };
    client_reference_id?: string;
    customer?: string;
    subscription?: string;
    id?: string;
    current_period_end?: number;
    items?: { data: { price?: { id?: string }; quantity?: number }[] };
    lines?: { data: { price?: { id?: string } }[] };
  };
  const tenantId = o.metadata?.tenantId || o.client_reference_id || '';
  if (!tenantId) return null;
  const item = o.items?.data?.[0];
  const priceId = item?.price?.id || o.lines?.data?.[0]?.price?.id || '';
  const meta = o.metadata?.planId ? { planId: o.metadata.planId, period: (o.metadata.period === 'anual' ? 'anual' : 'mensal') as 'mensal' | 'anual' } : null;
  const plan = meta || (priceId ? planForPrice(priceId) : null);
  const base = {
    tenantId,
    ...(o.customer ? { customerId: String(o.customer) } : {}),
    ...(plan ? { planId: plan.planId, period: plan.period } : {}),
    ...(item?.quantity !== undefined ? { quantity: item.quantity } : {}),
    ...(o.current_period_end ? { currentPeriodEnd: new Date(o.current_period_end * 1000).toISOString() } : {}),
  };
  switch (ev.type) {
    case 'checkout.session.completed':
      return { kind: 'checkout_done' as const, ...base, ...(o.subscription ? { subscriptionId: String(o.subscription) } : {}) };
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      return { kind: 'subscription_updated' as const, ...base, ...(o.id ? { subscriptionId: o.id } : {}) };
    case 'customer.subscription.deleted':
      return { kind: 'subscription_deleted' as const, ...base, ...(o.id ? { subscriptionId: o.id } : {}) };
    case 'invoice.payment_failed':
      return { kind: 'payment_failed' as const, ...base };
    default:
      return null;
  }
}
