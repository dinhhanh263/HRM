# Implementation Plan: Employee Management Module

**Spec:** [docs/specs/002-employee-management.md](../docs/specs/002-employee-management.md)  
**Created:** 2026-05-29  
**Estimated:** 20-25 tasks, ~3-4 days

---

## Overview

Vertical slices approach - each feature delivered end-to-end (DB → API → UI).

```
Phase 1: Foundation       → Prisma schema, shared types, permissions
Phase 2: Department CRUD  → Full stack department management
Phase 3: Position CRUD    → Full stack position management
Phase 4: Employee CRUD    → Full stack employee management
Phase 5: Status & Avatar  → Status transitions, file upload
```

---

## Phase 1: Foundation

### Task 1.1: Update Prisma Schema

**Objective:** Add Department, Position, Employee models

**Files to modify:**
- `apps/api/prisma/schema.prisma`

**Acceptance Criteria:**
- [ ] Department model with tenant relation
- [ ] Position model with department relation
- [ ] Employee model with all fields from spec
- [ ] Enums: Gender, ContractType, EmployeeStatus
- [ ] Update User model to have optional Employee relation
- [ ] Migration runs successfully

---

### Task 1.2: Add Shared Types

**Objective:** Define DTOs and types for employee module

**Files to create:**
- `packages/shared/src/types/employee.ts`
- `packages/shared/src/types/department.ts`
- `packages/shared/src/types/position.ts`

**Acceptance Criteria:**
- [ ] DepartmentDto, CreateDepartmentRequest, UpdateDepartmentRequest
- [ ] PositionDto, CreatePositionRequest, UpdatePositionRequest
- [ ] EmployeeDto, CreateEmployeeRequest, UpdateEmployeeRequest
- [ ] Enums exported: Gender, ContractType, EmployeeStatus

---

### Task 1.3: Add Permission Middleware

**Objective:** Role-based access control for employee routes

**Files to create:**
- `apps/api/src/app/middlewares/authorize.middleware.ts`

**Acceptance Criteria:**
- [ ] `authorize(...roles)` middleware
- [ ] Check user role from JWT
- [ ] Return 403 Forbidden if not authorized
- [ ] Reusable across all protected routes

---

## Checkpoint: Foundation Complete ✓

---

## Phase 2: Department CRUD

### Task 2.1: Department API - Create & List

**Objective:** Create and list departments

**Files to create:**
- `apps/api/src/domain/repositories/department.repository.ts`
- `apps/api/src/domain/services/department.service.ts`
- `apps/api/src/app/validators/department.validator.ts`
- `apps/api/src/app/controllers/department.controller.ts`
- `apps/api/src/app/routes/v1/department.routes.ts`

**Acceptance Criteria:**
- [ ] POST /api/v1/departments - Create department
- [ ] GET /api/v1/departments - List all departments (tenant-scoped)
- [ ] Validation: name required, unique per tenant
- [ ] Only HR_MANAGER and SUPER_ADMIN can access

**Verification:**
```bash
curl -X POST http://localhost:3000/api/v1/departments \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Engineering","description":"Tech team"}'
```

---

### Task 2.2: Department API - Get, Update, Delete

**Objective:** Complete CRUD for departments

**Files to modify:**
- `apps/api/src/domain/services/department.service.ts`
- `apps/api/src/app/controllers/department.controller.ts`

**Acceptance Criteria:**
- [ ] GET /api/v1/departments/:id - Get single department
- [ ] PATCH /api/v1/departments/:id - Update department
- [ ] DELETE /api/v1/departments/:id - Delete (only if no employees)
- [ ] Return 400 if trying to delete department with employees

---

### Task 2.3: Department UI - List & Create Dialog

**Objective:** Frontend for department management

**Files to create:**
- `apps/web/src/features/departments/api/department.api.ts`
- `apps/web/src/features/departments/hooks/useDepartments.ts`
- `apps/web/src/features/departments/components/DepartmentList.tsx`
- `apps/web/src/features/departments/components/DepartmentFormDialog.tsx`
- `apps/web/src/features/departments/pages/DepartmentsPage.tsx`

**Acceptance Criteria:**
- [ ] Table showing all departments
- [ ] "Add Department" button opens dialog
- [ ] Form with name (required) and description
- [ ] Success toast on create
- [ ] Add route to router

---

### Task 2.4: Department UI - Edit & Delete

**Objective:** Complete department UI

**Files to modify:**
- `apps/web/src/features/departments/components/DepartmentList.tsx`
- `apps/web/src/features/departments/components/DepartmentFormDialog.tsx`

**Acceptance Criteria:**
- [ ] Edit button opens dialog with existing data
- [ ] Delete button with confirmation dialog
- [ ] Show error if delete fails (has employees)
- [ ] Optimistic updates with React Query

---

## Checkpoint: Departments Complete ✓

---

## Phase 3: Position CRUD

### Task 3.1: Position API - Full CRUD

**Objective:** Complete position backend

**Files to create:**
- `apps/api/src/domain/repositories/position.repository.ts`
- `apps/api/src/domain/services/position.service.ts`
- `apps/api/src/app/validators/position.validator.ts`
- `apps/api/src/app/controllers/position.controller.ts`
- `apps/api/src/app/routes/v1/position.routes.ts`

**Acceptance Criteria:**
- [ ] Full CRUD endpoints for positions
- [ ] Link position to department (optional)
- [ ] Level field (1-5)
- [ ] Delete only if no employees assigned

---

### Task 3.2: Position UI - Full CRUD

**Objective:** Complete position frontend

**Files to create:**
- `apps/web/src/features/positions/api/position.api.ts`
- `apps/web/src/features/positions/hooks/usePositions.ts`
- `apps/web/src/features/positions/components/PositionList.tsx`
- `apps/web/src/features/positions/components/PositionFormDialog.tsx`
- `apps/web/src/features/positions/pages/PositionsPage.tsx`

**Acceptance Criteria:**
- [ ] Table showing positions with department
- [ ] Create/Edit dialog with department dropdown
- [ ] Level selector (Junior → Manager)
- [ ] Delete with confirmation

---

## Checkpoint: Positions Complete ✓

---

## Phase 4: Employee CRUD

### Task 4.1: Employee API - Create Employee

**Objective:** Create employee with auto user account

**Files to create:**
- `apps/api/src/domain/repositories/employee.repository.ts`
- `apps/api/src/domain/services/employee.service.ts`
- `apps/api/src/app/validators/employee.validator.ts`
- `apps/api/src/app/controllers/employee.controller.ts`
- `apps/api/src/app/routes/v1/employee.routes.ts`
- `apps/api/src/shared/helpers/employee-code.helper.ts`

**Acceptance Criteria:**
- [ ] POST /api/v1/employees creates employee
- [ ] Auto-create User account with EMPLOYEE role
- [ ] Generate unique employee code (e.g., EMP-001)
- [ ] Validate email unique in tenant
- [ ] Set random password (employee resets later)

---

### Task 4.2: Employee API - List with Filters

**Objective:** Paginated employee list with search/filter

**Files to modify:**
- `apps/api/src/domain/repositories/employee.repository.ts`
- `apps/api/src/domain/services/employee.service.ts`
- `apps/api/src/app/controllers/employee.controller.ts`

**Acceptance Criteria:**
- [ ] GET /api/v1/employees with pagination
- [ ] Search by name or email
- [ ] Filter by: departmentId, positionId, status, contractType
- [ ] Sort by: fullName, joinDate (asc/desc)
- [ ] Return total count for pagination

**Query example:**
```
GET /api/v1/employees?page=1&limit=20&search=john&status=ACTIVE&sort=fullName&order=asc
```

---

### Task 4.3: Employee API - Get, Update, Delete

**Objective:** Complete employee CRUD

**Files to modify:**
- `apps/api/src/domain/services/employee.service.ts`
- `apps/api/src/app/controllers/employee.controller.ts`

**Acceptance Criteria:**
- [ ] GET /api/v1/employees/:id - Get employee with relations
- [ ] PATCH /api/v1/employees/:id - Update employee
- [ ] Cannot change email field
- [ ] Soft delete (set status to TERMINATED)

---

### Task 4.4: Employee UI - List Page

**Objective:** Employee list with table, search, filters

**Files to create:**
- `apps/web/src/features/employees/api/employee.api.ts`
- `apps/web/src/features/employees/hooks/useEmployees.ts`
- `apps/web/src/features/employees/components/EmployeeTable.tsx`
- `apps/web/src/features/employees/components/EmployeeFilters.tsx`
- `apps/web/src/features/employees/pages/EmployeeListPage.tsx`

**Acceptance Criteria:**
- [ ] Data table with columns: Avatar, Name, Email, Dept, Position, Status, Join Date
- [ ] Search input (debounced)
- [ ] Filter dropdowns: Department, Status
- [ ] Pagination controls
- [ ] "Add Employee" button

---

### Task 4.5: Employee UI - Create Form

**Objective:** Add new employee form

**Files to create:**
- `apps/web/src/features/employees/components/EmployeeForm.tsx`
- `apps/web/src/features/employees/pages/EmployeeCreatePage.tsx`

**Acceptance Criteria:**
- [ ] Form with all employee fields
- [ ] Department and Position dropdowns
- [ ] Date pickers for DOB and Join Date
- [ ] Contract type select
- [ ] Validation with error messages
- [ ] Redirect to list on success

---

### Task 4.6: Employee UI - Detail Page

**Objective:** View employee profile

**Files to create:**
- `apps/web/src/features/employees/components/EmployeeProfile.tsx`
- `apps/web/src/features/employees/pages/EmployeeDetailPage.tsx`

**Acceptance Criteria:**
- [ ] Display all employee info in cards
- [ ] Personal info section
- [ ] Employment info section
- [ ] Edit button (link to edit page)
- [ ] Status badge

---

### Task 4.7: Employee UI - Edit Form

**Objective:** Edit existing employee

**Files to create:**
- `apps/web/src/features/employees/pages/EmployeeEditPage.tsx`

**Acceptance Criteria:**
- [ ] Pre-fill form with existing data
- [ ] Email field disabled
- [ ] Save changes
- [ ] Cancel returns to detail page

---

## Checkpoint: Employee CRUD Complete ✓

---

## Phase 5: Status Management & Avatar

### Task 5.1: Employee Status API

**Objective:** Status transition endpoints

**Files to modify:**
- `apps/api/src/domain/services/employee.service.ts`
- `apps/api/src/app/controllers/employee.controller.ts`

**Acceptance Criteria:**
- [ ] POST /employees/:id/deactivate - Set INACTIVE
- [ ] POST /employees/:id/activate - Set ACTIVE (from INACTIVE)
- [ ] POST /employees/:id/terminate - Set TERMINATED with reason
- [ ] Update User status when employee terminated
- [ ] Cannot reactivate TERMINATED

---

### Task 5.2: Employee Status UI

**Objective:** Status management in UI

**Files to modify:**
- `apps/web/src/features/employees/components/EmployeeProfile.tsx`
- `apps/web/src/features/employees/components/EmployeeTable.tsx`

**Files to create:**
- `apps/web/src/features/employees/components/StatusChangeDialog.tsx`

**Acceptance Criteria:**
- [ ] Status badge with color
- [ ] Dropdown menu: Deactivate, Activate, Terminate
- [ ] Confirmation dialog for status changes
- [ ] Termination dialog asks for reason

---

### Task 5.3: Avatar Upload API

**Objective:** Upload and serve employee avatars

**Files to create:**
- `apps/api/src/app/middlewares/upload.middleware.ts`
- `apps/api/src/shared/helpers/file.helper.ts`

**Files to modify:**
- `apps/api/src/app/controllers/employee.controller.ts`
- `apps/api/src/app.ts` (static files)

**Acceptance Criteria:**
- [ ] POST /employees/:id/avatar - Upload image
- [ ] Validate file type (jpg, png)
- [ ] Max size 2MB
- [ ] Save to `uploads/avatars/`
- [ ] Serve static files from `/uploads`
- [ ] Return avatar URL in response

---

### Task 5.4: Avatar Upload UI

**Objective:** Avatar upload in employee form

**Files to create:**
- `apps/web/src/components/ui/avatar-upload.tsx`

**Files to modify:**
- `apps/web/src/features/employees/components/EmployeeForm.tsx`
- `apps/web/src/features/employees/components/EmployeeProfile.tsx`

**Acceptance Criteria:**
- [ ] Click avatar to upload
- [ ] Preview before save
- [ ] Show loading during upload
- [ ] Display current avatar or default

---

## Checkpoint: Employee Module Complete ✓

---

## Phase 6: Integration Tests

### Task 6.1: API Integration Tests

**Objective:** Test all employee module endpoints

**Files to create:**
- `apps/api/tests/integration/department.test.ts`
- `apps/api/tests/integration/position.test.ts`
- `apps/api/tests/integration/employee.test.ts`

**Acceptance Criteria:**
- [ ] Department CRUD tests
- [ ] Position CRUD tests
- [ ] Employee CRUD tests
- [ ] Permission tests (403 for unauthorized)
- [ ] Filter and search tests

---

### Task 6.2: Seed Sample Data

**Objective:** Update seed script with departments, positions, employees

**Files to modify:**
- `apps/api/prisma/seed.ts`

**Acceptance Criteria:**
- [ ] Create sample departments: Engineering, HR, Sales
- [ ] Create sample positions: Developer, Manager, etc.
- [ ] Create sample employees linked to users
- [ ] Idempotent (can run multiple times)

---

## Final Checkpoint: Module Complete ✓

**Definition of Done:**
- [ ] All CRUD operations work for Dept, Position, Employee
- [ ] Permissions enforced (HR + Admin only)
- [ ] Search and filter working
- [ ] Avatar upload working
- [ ] Status transitions working
- [ ] All tests passing
- [ ] No TypeScript errors

---

## Task Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Foundation | 3 tasks | 1-2 hours |
| 2. Department CRUD | 4 tasks | 2-3 hours |
| 3. Position CRUD | 2 tasks | 1-2 hours |
| 4. Employee CRUD | 7 tasks | 4-6 hours |
| 5. Status & Avatar | 4 tasks | 2-3 hours |
| 6. Tests & Seed | 2 tasks | 1-2 hours |
| **Total** | **22 tasks** | **11-18 hours** |

---

## Next Steps

Run `/build` to start implementing tasks in order.
