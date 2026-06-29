export type TruckPin = {
  id: string;
  lat: number;
  lng: number;
  status: 'moving' | 'idle' | 'maintenance' | 'offline';
  driverName?: string;
  faultCount?: number;
  address?: string;
};

export const STATUS_COLORS = {
  moving: '#10b981',
  idle: '#f59e0b',
  maintenance: '#3b82f6',
  offline: '#64748b',
} as const;
