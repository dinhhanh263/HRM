import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

export interface SalesOverview {
  lifecycleCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  pipeline: { name: string; type: string; count: number; amount: string }[];
  openPipelineTotal: string;
  wonThisMonth: { count: number; amount: string };
  lostThisMonth: { count: number; amount: string };
}
export interface SalesForecast {
  weightedTotal: string;
  byStage: { name: string; weighted: string }[];
}
export interface OwnerStat {
  ownerId: string | null;
  ownerName: string;
  count: number;
}

const get = async <T>(url: string) => (await apiClient.get<ApiResponse<T>>(url)).data.data;

export function useSalesOverview() {
  return useQuery({ queryKey: ['sales', 'report', 'overview'], queryFn: () => get<SalesOverview>('/sales/reports/overview'), staleTime: 60_000 });
}
export function useSalesForecast() {
  return useQuery({ queryKey: ['sales', 'report', 'forecast'], queryFn: () => get<SalesForecast>('/sales/reports/forecast'), staleTime: 60_000 });
}
export function useSalesByOwner(enabled: boolean) {
  return useQuery({ queryKey: ['sales', 'report', 'by-owner'], enabled, queryFn: () => get<OwnerStat[]>('/sales/reports/by-owner'), staleTime: 60_000 });
}
