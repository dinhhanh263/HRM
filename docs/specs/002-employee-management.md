# SPEC-002: Employee Management Module

**Status:** Draft  
**Created:** 2026-05-29  
**Author:** Claude + Hạnh  
**Depends on:** SPEC-001 (Auth)

---

## Objective

Build a complete employee management module that allows HR managers to manage employee records including personal info, department assignment, position, and employment status.

## Target Users

| User | Actions |
|------|---------|
| **Super Admin** | Full CRUD on all employees across tenants |
| **HR Manager** | Full CRUD on employees within their tenant |
| **Manager** | View team members (read-only) |
| **Employee** | View own profile only |

---

## Core Features

### 1. Department Management
**Acceptance Criteria:**
- [ ] List all departments in tenant
- [ ] Create new department (name, description)
- [ ] Edit department
- [ ] Delete department (only if no employees assigned)
- [ ] Departments are tenant-scoped

### 2. Position Management
**Acceptance Criteria:**
- [ ] List all positions in tenant
- [ ] Create new position (name, department, level)
- [ ] Edit position
- [ ] Delete position (only if no employees assigned)
- [ ] Positions can be linked to a department (optional)

### 3. Employee List
**Acceptance Criteria:**
- [ ] Display paginated employee table (20 per page)
- [ ] Columns: Avatar, Name, Email, Department, Position, Status, Join Date
- [ ] Search by name or email
- [ ] Filter by: Department, Position, Status, Contract Type
- [ ] Sort by: Name, Join Date, Department
- [ ] Quick actions: View, Edit, Deactivate

### 4. Employee Detail / Profile
**Acceptance Criteria:**
- [ ] Display full employee information
- [ ] Sections: Personal Info, Employment Info, Documents (future)
- [ ] Show employment history timeline (future)
- [ ] Edit button (for authorized users)

### 5. Add New Employee
**Acceptance Criteria:**
- [ ] Multi-step form or single page form
- [ ] Required fields: Full name, Email, Department, Position, Join date
- [ ] Optional fields: DOB, Gender, ID number, Phone, Address, Avatar
- [ ] Auto-create user account with EMPLOYEE role
- [ ] Send welcome email (future - Phase 2)
- [ ] Validation: unique email within tenant

### 6. Edit Employee
**Acceptance Criteria:**
- [ ] Edit all employee fields
- [ ] Cannot change email (linked to user account)
- [ ] Track modification history (updatedAt, updatedBy)

### 7. Employee Status Management
**Acceptance Criteria:**
- [ ] Status transitions: Active → Inactive, Active → Terminated
- [ ] Deactivate: temporarily disable (can reactivate)
- [ ] Terminate: permanent (with termination date and reason)
- [ ] Terminated employees cannot login
- [ ] Confirmation dialog for status changes

### 8. Avatar Upload
**Acceptance Criteria:**
- [ ] Upload image (JPG, PNG, max 2MB)
- [ ] Crop/resize to 200x200
- [ ] Store in local `uploads/avatars/` directory
- [ ] Serve via static file route `/uploads/avatars/:filename`
- [ ] Default avatar for employees without photo

---

## Out of Scope (Phase 1)

- Bulk import employees (CSV/Excel)
- Employee documents management
- Employment history tracking
- Organization chart view
- Employee self-service edit
- Welcome email on create
- Advanced reporting

---

## Data Models

### Department
```prisma
model Department {
  id          String   @id @default(cuid())
  tenantId    String   @map("tenant_id")
  name        String
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  tenant      Tenant     @relation(fields: [tenantId], references: [id])
  positions   Position[]
  employees   Employee[]

  @@unique([tenantId, name])
  @@map("departments")
}
```

### Position
```prisma
model Position {
  id           String   @id @default(cuid())
  tenantId     String   @map("tenant_id")
  departmentId String?  @map("department_id")
  name         String
  level        Int      @default(1)  // 1=Junior, 2=Mid, 3=Senior, 4=Lead, 5=Manager
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  tenant       Tenant      @relation(fields: [tenantId], references: [id])
  department   Department? @relation(fields: [departmentId], references: [id])
  employees    Employee[]

  @@unique([tenantId, name])
  @@map("positions")
}
```

### Employee
```prisma
model Employee {
  id             String         @id @default(cuid())
  tenantId       String         @map("tenant_id")
  userId         String         @unique @map("user_id")
  employeeCode   String         @map("employee_code")
  departmentId   String?        @map("department_id")
  positionId     String?        @map("position_id")
  
  // Personal Info
  fullName       String         @map("full_name")
  dateOfBirth    DateTime?      @map("date_of_birth")
  gender         Gender?
  idNumber       String?        @map("id_number")
  phone          String?
  address        String?
  avatar         String?
  
  // Employment Info
  joinDate       DateTime       @map("join_date")
  contractType   ContractType   @map("contract_type")
  status         EmployeeStatus @default(ACTIVE)
  terminatedAt   DateTime?      @map("terminated_at")
  terminationReason String?     @map("termination_reason")
  
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  tenant         Tenant         @relation(fields: [tenantId], references: [id])
  user           User           @relation(fields: [userId], references: [id])
  department     Department?    @relation(fields: [departmentId], references: [id])
  position       Position?      @relation(fields: [positionId], references: [id])

  @@unique([tenantId, employeeCode])
  @@index([tenantId, status])
  @@map("employees")
}

enum Gender {
  MALE
  FEMALE
  OTHER
}

enum ContractType {
  FULL_TIME
  PART_TIME
  CONTRACT
  INTERN
  PROBATION
}

enum EmployeeStatus {
  ACTIVE
  INACTIVE
  TERMINATED
}
```

---

## API Endpoints

### Departments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/departments | List departments |
| POST | /api/v1/departments | Create department |
| GET | /api/v1/departments/:id | Get department |
| PATCH | /api/v1/departments/:id | Update department |
| DELETE | /api/v1/departments/:id | Delete department |

### Positions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/positions | List positions |
| POST | /api/v1/positions | Create position |
| GET | /api/v1/positions/:id | Get position |
| PATCH | /api/v1/positions/:id | Update position |
| DELETE | /api/v1/positions/:id | Delete position |

### Employees
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/employees | List employees (paginated, filterable) |
| POST | /api/v1/employees | Create employee |
| GET | /api/v1/employees/:id | Get employee detail |
| PATCH | /api/v1/employees/:id | Update employee |
| POST | /api/v1/employees/:id/deactivate | Deactivate employee |
| POST | /api/v1/employees/:id/activate | Reactivate employee |
| POST | /api/v1/employees/:id/terminate | Terminate employee |
| POST | /api/v1/employees/:id/avatar | Upload avatar |

### Query Parameters for List
```
GET /api/v1/employees?page=1&limit=20&search=john&department=xxx&status=ACTIVE&sort=fullName&order=asc
```

---

## Frontend Pages

| Route | Page | Access |
|-------|------|--------|
| /employees | Employee List | HR, Admin |
| /employees/new | Add Employee | HR, Admin |
| /employees/:id | Employee Detail | HR, Admin, Manager (team), Self |
| /employees/:id/edit | Edit Employee | HR, Admin |
| /departments | Department List | HR, Admin |
| /positions | Position List | HR, Admin |

---

## Testing Strategy

### Unit Tests
- Employee service: CRUD operations, status transitions
- Validation: employee code generation, unique constraints
- Permission checks

### Integration Tests
- Employee API endpoints
- Department/Position API endpoints
- File upload

### E2E Tests (future)
- Create employee flow
- Search and filter
- Status change flow

---

## Boundaries

### Always Do
- Validate tenant scope on all operations
- Check user permissions before any write operation
- Soft delete for employees (never hard delete)
- Generate unique employee code per tenant

### Ask First
- Changing employee code format
- Adding new employee fields
- Modifying status transition rules

### Never Do
- Delete employee records permanently
- Allow cross-tenant data access
- Skip permission checks

---

## Implementation Phases

### Phase 1 (This Spec)
- Department CRUD
- Position CRUD  
- Employee CRUD
- Basic list with search/filter
- Avatar upload (local)

### Phase 2 (Future)
- Welcome email
- Bulk import
- Document management
- Employment history

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Department management | CRUD - separate entity |
| Position management | CRUD - separate entity, linked to department |
| Avatar storage | Local filesystem (`uploads/avatars/`) |
| Permissions | HR Manager + Super Admin only for write |

---

## Approval

- [ ] Spec reviewed by stakeholder
- [ ] Ready for `/plan`
