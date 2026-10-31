export type EmailStatus = 'scheduled' | 'sending' | 'rescheduled' | 'sent' | 'failed';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  slackConnected: boolean;
  slackTeamName: string | null;
  slackChannel: string | null;
};

export type Sender = {
  id: string;
  label: string;
  fromName: string;
  fromEmail: string;
  createdAt: string;
};

export type EmailJob = {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  previewUrl: string | null;
  sender: {
    id: string;
    label: string;
    fromEmail: string;
    fromName: string;
  };
};

export type QueueStats = {
  waiting: number;
  delayed: number;
  active: number;
  failed: number;
  completed: number;
};

export type Summary = {
  counts: { all: number; scheduled: number; sent: number };
  queue: QueueStats;
};

export type Bucket = 'all' | 'scheduled' | 'sent';
