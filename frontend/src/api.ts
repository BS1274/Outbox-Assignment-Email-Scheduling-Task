import type { Bucket, EmailJob, EmailStatus, Sender, SessionUser, Summary } from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return body;
}

export const api = {
  config: () => request<{ google: boolean; slack: boolean }>('/api/auth/config'),
  me: () => request<{ user: SessionUser }>('/api/auth/me'),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  login: (credentials: { email: string; password: string }) =>
    request<{ ok: boolean; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (data: { email: string; password: string; name?: string }) =>
    request<{ ok: boolean; user: SessionUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  summary: () => request<Summary>('/api/emails/summary'),
  emails: (params: {
    bucket: Bucket;
    status?: EmailStatus | '';
    senderId?: string;
    q?: string;
    sort: 'newest' | 'oldest';
  }) => {
    const search = new URLSearchParams();
    search.set('bucket', params.bucket);
    search.set('sort', params.sort);
    if (params.status) search.set('status', params.status);
    if (params.senderId) search.set('senderId', params.senderId);
    if (params.q) search.set('q', params.q);
    return request<{ emails: EmailJob[]; engine: 'postgres' | 'elasticsearch' }>(
      `/api/emails?${search.toString()}`,
    );
  },
  senders: () => request<{ senders: Sender[] }>('/api/senders'),
  addSender: () => request<{ sender: Sender }>('/api/senders', { method: 'POST' }),
  ensureSenders: () => request<{ senders: Sender[] }>('/api/senders/ensure', { method: 'POST' }),
  slackStatus: () =>
    request<{ configured: boolean; connected: boolean; teamName: string | null; channel: string | null }>(
      '/api/slack/status',
    ),
  disconnectSlack: () => request<{ connected: boolean }>('/api/slack/disconnect', { method: 'POST' }),
  schedule: (body: {
    subject: string;
    body: string;
    leadsText: string;
    startAt: string;
    delayBetweenSeconds: number;
    hourlyLimit: number;
    senderId?: string;
  }) =>
    request<{
      created: boolean;
      campaignId: string;
      total: number;
      hourlyLimit: number;
      hourlyLimitCapped: boolean;
      delayBetweenMs: number;
      firstSendAt: string | null;
      lastSendAt: string | null;
    }>('/api/campaigns', { method: 'POST', body: JSON.stringify(body) }),
};
