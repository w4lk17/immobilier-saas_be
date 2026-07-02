export type DashboardActivity = {
  id: string;
  action: string;
  user?: string;
  type: 'success' | 'warning' | 'info' | 'error';
  occurredAt: Date;
};

export type DashboardDocumentSummary = {
  contract: number;
  receipts: number;
  insurance: number;
};

export type DashboardHousingSummary = {
  title: string;
  address: string;
  owner?: {
    name: string;
    phone?: string | null;
  };
  leaseStart: Date;
  leaseEnd?: Date | null;
};

