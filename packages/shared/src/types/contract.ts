import type { ContractType } from './employee.js';

export const ContractStatus = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  TERMINATED: 'TERMINATED',
} as const;

export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

export interface ContractDto {
  id: string;
  employeeId: string;
  type: ContractType;
  startDate: string;
  /** null = indefinite-term contract (never generates an expiry reminder). */
  endDate: string | null;
  status: ContractStatus;
  signedAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractInput {
  type: ContractType;
  startDate: string;
  endDate?: string | null;
  status?: ContractStatus;
  signedAt?: string | null;
  note?: string | null;
}

export interface UpdateContractInput {
  type?: ContractType;
  startDate?: string;
  endDate?: string | null;
  status?: ContractStatus;
  signedAt?: string | null;
  note?: string | null;
}
