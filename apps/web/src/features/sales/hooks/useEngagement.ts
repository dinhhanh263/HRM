import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiResponse } from '@hrm/shared';
import { apiClient } from '@/lib/api-client';

// Local DTOs (Phase 4) — server response shapes.
export interface ActivityDto {
  id: string;
  type: string;
  body: string | null;
  author: { id: string; fullName: string } | null;
  deal: { id: string; title: string } | null;
  occurredAt: string;
}
export interface TaskDto {
  id: string;
  type: string;
  title: string;
  dueAt: string;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  completedAt: string | null;
  customer: { id: string; fullName: string } | null;
  deal: { id: string; title: string } | null;
}
export interface EmailMessageDto {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'OPENED' | 'CLICKED';
  sentAt: string | null;
  createdAt: string;
}
export interface EmailTemplateDto {
  id: string;
  name: string;
  subject: string;
  body: string;
  isActive: boolean;
}

const get = async <T>(url: string) => (await apiClient.get<ApiResponse<T>>(url)).data.data;

// ---- Activities ----
export function useActivities(customerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sales', 'activities', customerId],
    enabled: Boolean(customerId) && enabled,
    queryFn: () => get<ActivityDto[]>(`/sales/customers/${customerId}/activities`),
  });
}
export function useAddNote(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiClient.post(`/sales/customers/${customerId}/activities`, { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'activities', customerId] }),
  });
}

// ---- Tasks ----
export function useMyTasks(status?: 'OPEN' | 'DONE') {
  return useQuery({
    queryKey: ['sales', 'tasks', 'mine', status ?? 'all'],
    queryFn: () => get<TaskDto[]>(`/sales/tasks/mine${status ? `?status=${status}` : ''}`),
  });
}
export function useCustomerTasks(customerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sales', 'tasks', 'customer', customerId],
    enabled: Boolean(customerId) && enabled,
    queryFn: () => get<TaskDto[]>(`/sales/customers/${customerId}/tasks`),
  });
}
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; type?: string; customerId: string; dealId?: string | null; dueAt: string }) =>
      apiClient.post('/sales/tasks', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'tasks'] }),
  });
}
export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/sales/tasks/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'tasks'] }),
  });
}

// ---- Email ----
export function useEmailHistory(customerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['sales', 'emails', customerId],
    enabled: Boolean(customerId) && enabled,
    queryFn: () => get<EmailMessageDto[]>(`/sales/customers/${customerId}/emails`),
  });
}
export function useEmailTemplates(enabled = true) {
  return useQuery({
    queryKey: ['sales', 'email-templates'],
    enabled,
    queryFn: () => get<EmailTemplateDto[]>('/sales/email-templates'),
  });
}
export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { customerId: string; dealId?: string | null; templateId?: string | null; subject?: string; body?: string }) =>
      apiClient.post('/sales/emails', body),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['sales', 'emails', vars.customerId] }),
  });
}
export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: { name: string; subject: string; body: string; isActive?: boolean } }) =>
      id ? apiClient.patch(`/sales/email-templates/${id}`, body) : apiClient.post('/sales/email-templates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales', 'email-templates'] }),
  });
}
