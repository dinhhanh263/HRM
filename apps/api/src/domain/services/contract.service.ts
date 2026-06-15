import type { Contract, Prisma, PrismaClient } from '@prisma/client';
import { db } from '../../infrastructure/database/client.js';

type Tx = Prisma.TransactionClient | PrismaClient;
import { contractRepository } from '../repositories/contract.repository.js';
import { employeeRepository } from '../repositories/employee.repository.js';
import { employeeService, type Requester } from './employee.service.js';
import { NotFoundError, BadRequestError } from '../../shared/errors/index.js';
import type {
  ContractDto,
  CreateContractInput,
  UpdateContractInput,
} from '@hrm/shared';

function toContractDto(c: Contract): ContractDto {
  return {
    id: c.id,
    employeeId: c.employeeId,
    type: c.type,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate ? c.endDate.toISOString() : null,
    status: c.status,
    signedAt: c.signedAt ? c.signedAt.toISOString() : null,
    note: c.note,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function assertEmployee(employeeId: string, tenantId: string) {
  const employee = await employeeRepository.findById(employeeId, tenantId);
  if (!employee) {
    throw new NotFoundError('Employee not found');
  }
}

export interface EndContractInput {
  endDate: string;
  status?: 'EXPIRED' | 'TERMINATED';
}

export const contractService = {
  // Read access is row-scoped through employeeService.getById: HR/SUPER_ADMIN
  // see anyone, an EMPLOYEE only their own record, a MANAGER their direct
  // reports. It throws NotFound/Forbidden, which doubles as the existence check.
  async list(employeeId: string, tenantId: string, requester: Requester): Promise<ContractDto[]> {
    await employeeService.getById(employeeId, tenantId, requester);
    const contracts = await contractRepository.findByEmployee(employeeId, tenantId);
    return contracts.map(toContractDto);
  },

  async create(
    employeeId: string,
    tenantId: string,
    input: CreateContractInput,
  ): Promise<ContractDto> {
    await assertEmployee(employeeId, tenantId);
    const created = await db.$transaction((tx) =>
      contractService.createWithinTx(tx, employeeId, tenantId, input),
    );
    return toContractDto(created);
  },

  // Create a contract inside a caller-supplied transaction so it can be made
  // atomic with another mutation (e.g. a probation CONFIRM decision). Holds the
  // one-ACTIVE-contract invariant; callers that already validated the employee
  // (like probation decide) can skip the standalone existence check.
  async createWithinTx(
    tx: Tx,
    employeeId: string,
    tenantId: string,
    input: CreateContractInput,
  ): Promise<Contract> {
    if (input.endDate && new Date(input.endDate) < new Date(input.startDate)) {
      throw new BadRequestError(
        'Contract end date cannot be earlier than start date',
        'CONTRACT_END_BEFORE_START',
      );
    }

    const status = input.status ?? 'ACTIVE';

    // One ACTIVE contract per employee: a new ACTIVE contract expires the prior one.
    if (status === 'ACTIVE') {
      await contractRepository.expireActive(tx, employeeId, tenantId);
    }

    return contractRepository.create(tx, {
      tenant: { connect: { id: tenantId } },
      employee: { connect: { id: employeeId } },
      type: input.type,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      status,
      signedAt: input.signedAt ? new Date(input.signedAt) : null,
      note: input.note ?? null,
    });
  },

  async update(
    id: string,
    employeeId: string,
    tenantId: string,
    input: UpdateContractInput,
  ): Promise<ContractDto> {
    const existing = await contractRepository.findById(id, employeeId, tenantId);
    if (!existing) {
      throw new NotFoundError('Contract not found');
    }

    const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
    const endDate =
      input.endDate === undefined
        ? existing.endDate
        : input.endDate
          ? new Date(input.endDate)
          : null;
    if (endDate && endDate < startDate) {
      throw new BadRequestError(
        'Contract end date cannot be earlier than start date',
        'CONTRACT_END_BEFORE_START',
      );
    }

    const updated = await db.$transaction(async (tx) => {
      // Promoting this contract to ACTIVE expires any other ACTIVE one.
      if (input.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
        await contractRepository.expireActive(tx, employeeId, tenantId, id);
      }

      return contractRepository.update(tx, id, {
        type: input.type,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate:
          input.endDate === undefined
            ? undefined
            : input.endDate
              ? new Date(input.endDate)
              : null,
        status: input.status,
        signedAt:
          input.signedAt === undefined
            ? undefined
            : input.signedAt
              ? new Date(input.signedAt)
              : null,
        note: input.note,
      });
    });

    return toContractDto(updated);
  },

  async end(
    id: string,
    employeeId: string,
    tenantId: string,
    input: EndContractInput,
  ): Promise<ContractDto> {
    const existing = await contractRepository.findById(id, employeeId, tenantId);
    if (!existing) {
      throw new NotFoundError('Contract not found');
    }

    if (new Date(input.endDate) < existing.startDate) {
      throw new BadRequestError(
        'Contract end date cannot be earlier than start date',
        'CONTRACT_END_BEFORE_START',
      );
    }

    const updated = await contractRepository.update(db, id, {
      endDate: new Date(input.endDate),
      status: input.status ?? 'TERMINATED',
    });

    return toContractDto(updated);
  },

  async remove(id: string, employeeId: string, tenantId: string): Promise<void> {
    const existing = await contractRepository.findById(id, employeeId, tenantId);
    if (!existing) {
      throw new NotFoundError('Contract not found');
    }
    await contractRepository.delete(id, tenantId);
  },
};
