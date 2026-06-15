import {
  PrismaClient,
  UserRole,
  UserStatus,
  Gender,
  ContractType,
  EmployeeStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import {
  SYSTEM_ROLES,
  seedPermissionCatalog,
  syncSystemRolesForTenant,
} from '../src/domain/rbac/catalog.js';
import { seedLeaveTypesForTenant } from '../src/domain/leave/defaults.js';
import { defaultPolicyCreateData } from '../src/domain/timesheet/defaults.js';
import { seedHolidaysForTenant } from '../src/domain/timesheet/holiday-defaults.js';
import { seedPipelineTemplatesForTenant } from '../src/domain/recruitment/defaults.js';
import { seedProbationCriteriaForTenant } from '../src/domain/probation/defaults.js';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function seedRbac(): Promise<void> {
  await seedPermissionCatalog(prisma);

  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    const roleIdByKey = await syncSystemRolesForTenant(prisma, tenant.id);

    // Backfill: point every user with the matching legacy enum at its system role.
    for (const def of SYSTEM_ROLES) {
      const roleId = roleIdByKey.get(def.key);
      if (!roleId) continue;
      await prisma.user.updateMany({
        where: { tenantId: tenant.id, role: def.enum },
        data: { roleId },
      });
    }
  }
  console.log(`Seeded RBAC catalog + system roles + backfilled roleId for ${tenants.length} tenant(s)`);
}

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'codecrush' },
    update: {},
    create: {
      name: 'CodeCrush',
      slug: 'codecrush',
      settings: {
        timezone: 'Asia/Ho_Chi_Minh',
        language: 'vi',
      },
    },
  });

  console.log(`Created tenant: ${tenant.name} (${tenant.slug})`);

  // Email domain → tenant mapping used by Google Workspace SSO.
  await prisma.tenantDomain.upsert({
    where: { domain: 'codecrush.asia' },
    update: {},
    create: { tenantId: tenant.id, domain: 'codecrush.asia' },
  });
  console.log('Mapped SSO domain: codecrush.asia → codecrush');

  const departments = await Promise.all([
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Engineering' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Engineering',
        description: 'Software development and technical teams',
      },
    }),
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Human Resources' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Human Resources',
        description: 'HR and people operations',
      },
    }),
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Finance' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Finance',
        description: 'Financial planning and accounting',
      },
    }),
    prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Marketing' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Marketing',
        description: 'Marketing and communications',
      },
    }),
  ]);

  console.log(`Created ${departments.length} departments`);

  const [engineering, hr, finance, marketing] = departments;

  const positions = await Promise.all([
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Software Engineer' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: engineering.id,
        name: 'Software Engineer',
        level: 2,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Senior Software Engineer' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: engineering.id,
        name: 'Senior Software Engineer',
        level: 3,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Tech Lead' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: engineering.id,
        name: 'Tech Lead',
        level: 4,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'HR Manager' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: hr.id,
        name: 'HR Manager',
        level: 4,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'HR Specialist' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: hr.id,
        name: 'HR Specialist',
        level: 2,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Accountant' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: finance.id,
        name: 'Accountant',
        level: 2,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Junior Software Engineer' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: engineering.id,
        name: 'Junior Software Engineer',
        level: 1,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Engineering Manager' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: engineering.id,
        name: 'Engineering Manager',
        level: 5,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Senior Accountant' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: finance.id,
        name: 'Senior Accountant',
        level: 3,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Finance Manager' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: finance.id,
        name: 'Finance Manager',
        level: 5,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Marketing Specialist' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: marketing.id,
        name: 'Marketing Specialist',
        level: 2,
      },
    }),
    prisma.position.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Marketing Manager' } },
      update: {},
      create: {
        tenantId: tenant.id,
        departmentId: marketing.id,
        name: 'Marketing Manager',
        level: 5,
      },
    }),
  ]);

  console.log(`Created ${positions.length} positions`);

  const [
    softwareEngineer,
    seniorEngineer,
    techLead,
    hrManager,
    hrSpecialist,
    accountant,
    juniorEngineer,
    engineeringManager,
    seniorAccountant,
    financeManager,
    marketingSpecialist,
    marketingManager,
  ] = positions;

  const adminPassword = await bcrypt.hash('Admin@123', BCRYPT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'admin@codecrush.asia',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@codecrush.asia',
      passwordHash: adminPassword,
      fullName: 'Đinh Văn Hạnh',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  console.log(`Created user: ${admin.fullName} (${admin.email}) - ${admin.role}`);

  // Link the admin to an employee profile so the default login can use the
  // self-service features (file leave, view own balances) end-to-end.
  await prisma.employee.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      employeeCode: 'EMP-000',
      fullName: admin.fullName,
      gender: Gender.MALE,
      joinDate: new Date('2022-01-01'),
      contractType: ContractType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: engineering.id,
      positionId: techLead.id,
    },
  });

  console.log(`Created admin employee profile: ${admin.fullName}`);

  // The founder account (hanhdinh@codecrush.asia) is created via registration,
  // not by this seed. If it exists, link an employee profile so it can use the
  // self-service surfaces (check-in, leave, own summary) end-to-end.
  const founder = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: 'hanhdinh@codecrush.asia' } },
  });
  if (founder) {
    await prisma.employee.upsert({
      where: { userId: founder.id },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: founder.id,
        employeeCode: 'EMP-900',
        fullName: founder.fullName,
        gender: Gender.MALE,
        joinDate: new Date('2022-01-01'),
        contractType: ContractType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        departmentId: engineering.id,
        positionId: techLead.id,
      },
    });
    console.log(`Linked founder employee profile: ${founder.fullName}`);
  }

  // Self-service test login (employee@codecrush.asia). A plain EMPLOYEE used to
  // verify role-scoped surfaces end-to-end. The employee directory is row-scoped
  // to the requester for non-HR roles, so without a linked profile this account
  // sees an empty list — it must own an Employee record to see itself.
  const testEmployeePassword = await bcrypt.hash('Employee@123', BCRYPT_ROUNDS);
  const testEmployeeUser = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'employee@codecrush.asia' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'employee@codecrush.asia',
      passwordHash: testEmployeePassword,
      fullName: 'Test Employee',
      role: UserRole.EMPLOYEE,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.employee.upsert({
    where: { userId: testEmployeeUser.id },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: testEmployeeUser.id,
      employeeCode: 'EMP-910',
      fullName: 'Test Employee',
      gender: Gender.OTHER,
      joinDate: new Date('2024-01-01'),
      contractType: ContractType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: engineering.id,
      positionId: softwareEngineer.id,
    },
  });

  console.log(`Linked Test Employee profile: ${testEmployeeUser.email}`);

  const hrUserPassword = await bcrypt.hash('Hr@12345', BCRYPT_ROUNDS);
  const hrUser = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'hr@codecrush.asia',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'hr@codecrush.asia',
      passwordHash: hrUserPassword,
      fullName: 'Nguyễn Thị Mai',
      role: UserRole.HR_MANAGER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });

  const hrEmployee = await prisma.employee.upsert({
    where: { userId: hrUser.id },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: hrUser.id,
      employeeCode: 'EMP-001',
      fullName: 'Nguyễn Thị Mai',
      dateOfBirth: new Date('1990-05-15'),
      gender: Gender.FEMALE,
      idNumber: '001090012345',
      phone: '0901234567',
      joinDate: new Date('2023-01-15'),
      contractType: ContractType.FULL_TIME,
      status: EmployeeStatus.ACTIVE,
      departmentId: hr.id,
      positionId: hrManager.id,
    },
  });

  console.log(`Created HR Manager: ${hrUser.fullName}`);

  const employeeData = [
    {
      email: 'tuan.le@codecrush.asia',
      fullName: 'Lê Văn Tuấn',
      role: UserRole.MANAGER,
      dateOfBirth: new Date('1988-03-20'),
      gender: Gender.MALE,
      idNumber: '001088023456',
      phone: '0912345678',
      joinDate: new Date('2022-06-01'),
      departmentId: engineering.id,
      positionId: techLead.id,
      employeeCode: 'EMP-002',
    },
    {
      email: 'linh.pham@codecrush.asia',
      fullName: 'Phạm Thùy Linh',
      role: UserRole.EMPLOYEE,
      dateOfBirth: new Date('1995-08-10'),
      gender: Gender.FEMALE,
      idNumber: '001095034567',
      phone: '0923456789',
      joinDate: new Date('2023-03-01'),
      departmentId: engineering.id,
      positionId: seniorEngineer.id,
      employeeCode: 'EMP-003',
    },
    {
      email: 'duc.nguyen@codecrush.asia',
      fullName: 'Nguyễn Minh Đức',
      role: UserRole.EMPLOYEE,
      dateOfBirth: new Date('1997-12-05'),
      gender: Gender.MALE,
      idNumber: '001097045678',
      phone: '0934567890',
      joinDate: new Date('2023-09-15'),
      departmentId: engineering.id,
      positionId: softwareEngineer.id,
      employeeCode: 'EMP-004',
    },
    {
      email: 'hoa.tran@codecrush.asia',
      fullName: 'Trần Thị Hoa',
      role: UserRole.EMPLOYEE,
      dateOfBirth: new Date('1993-04-25'),
      gender: Gender.FEMALE,
      idNumber: '001093056789',
      phone: '0945678901',
      joinDate: new Date('2024-01-10'),
      departmentId: hr.id,
      positionId: hrSpecialist.id,
      employeeCode: 'EMP-005',
    },
  ];

  const defaultPassword = await bcrypt.hash('Employee@123', BCRYPT_ROUNDS);

  const employeesByEmail: Record<string, { id: string }> = {};

  for (const emp of employeeData) {
    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: emp.email,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        email: emp.email,
        passwordHash: defaultPassword,
        fullName: emp.fullName,
        role: emp.role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const employee = await prisma.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: user.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        dateOfBirth: emp.dateOfBirth,
        gender: emp.gender,
        idNumber: emp.idNumber,
        phone: emp.phone,
        joinDate: emp.joinDate,
        contractType: ContractType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        departmentId: emp.departmentId,
        positionId: emp.positionId,
      },
    });

    employeesByEmail[emp.email] = employee;

    console.log(`Created employee: ${emp.fullName} (${emp.email})`);
  }

  // Wire up the org chart so the leave approval flow can resolve real
  // approvers instead of auto-skipping every step (NO_APPROVER).
  //   Engineering: Lê Văn Tuấn (Tech Lead) is dept head; Linh & Đức report to him.
  //   HR:          Nguyễn Thị Mai (HR Manager) is dept head; Hoa reports to her.
  // Done as explicit updates (idempotent) after all employees exist, so the
  // manager references are guaranteed resolvable regardless of insert order.
  const tuanLe = employeesByEmail['tuan.le@codecrush.asia'];

  await prisma.department.update({
    where: { id: engineering.id },
    data: { managerId: tuanLe.id },
  });
  await prisma.department.update({
    where: { id: hr.id },
    data: { managerId: hrEmployee.id },
  });

  await prisma.employee.update({
    where: { id: employeesByEmail['linh.pham@codecrush.asia'].id },
    data: { managerId: tuanLe.id },
  });
  await prisma.employee.update({
    where: { id: employeesByEmail['duc.nguyen@codecrush.asia'].id },
    data: { managerId: tuanLe.id },
  });
  await prisma.employee.update({
    where: { id: employeesByEmail['hoa.tran@codecrush.asia'].id },
    data: { managerId: hrEmployee.id },
  });

  console.log('Wired org chart: department heads + direct managers');

  // --- Bulk test data: 20 employees spanning every position ----------------
  // Gives the Direct Manager dropdown real level-5 candidates (Engineering /
  // Finance / Marketing Manager) plus a full org tree to test against.
  // `managerEmail` is resolved to managerId in a second pass so insert order
  // never matters.
  const additionalEmployees: Array<{
    email: string;
    fullName: string;
    role: UserRole;
    gender: Gender;
    dateOfBirth: Date;
    idNumber: string;
    phone: string;
    joinDate: Date;
    departmentId: string;
    positionId: string;
    employeeCode: string;
    contractType?: ContractType;
    managerEmail?: string;
  }> = [
    {
      email: 'khoa.vu@codecrush.asia',
      fullName: 'Vũ Đình Khoa',
      role: UserRole.MANAGER,
      gender: Gender.MALE,
      dateOfBirth: new Date('1985-02-12'),
      idNumber: '001085100001',
      phone: '0900000006',
      joinDate: new Date('2021-03-01'),
      departmentId: engineering.id,
      positionId: engineeringManager.id,
      employeeCode: 'EMP-006',
    },
    {
      email: 'lan.do@codecrush.asia',
      fullName: 'Đỗ Thị Lan',
      role: UserRole.MANAGER,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1986-07-22'),
      idNumber: '001086100002',
      phone: '0900000007',
      joinDate: new Date('2021-05-15'),
      departmentId: finance.id,
      positionId: financeManager.id,
      employeeCode: 'EMP-007',
    },
    {
      email: 'huy.bui@codecrush.asia',
      fullName: 'Bùi Quang Huy',
      role: UserRole.MANAGER,
      gender: Gender.MALE,
      dateOfBirth: new Date('1987-11-03'),
      idNumber: '001087100003',
      phone: '0900000008',
      joinDate: new Date('2021-08-01'),
      departmentId: marketing.id,
      positionId: marketingManager.id,
      employeeCode: 'EMP-008',
    },
    {
      email: 'tung.ngo@codecrush.asia',
      fullName: 'Ngô Thanh Tùng',
      role: UserRole.MANAGER,
      gender: Gender.MALE,
      dateOfBirth: new Date('1989-09-18'),
      idNumber: '001089100004',
      phone: '0900000009',
      joinDate: new Date('2022-02-01'),
      departmentId: engineering.id,
      positionId: techLead.id,
      employeeCode: 'EMP-009',
      managerEmail: 'khoa.vu@codecrush.asia',
    },
    {
      email: 'nam.hoang@codecrush.asia',
      fullName: 'Hoàng Văn Nam',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1992-01-09'),
      idNumber: '001092100005',
      phone: '0900000010',
      joinDate: new Date('2022-04-12'),
      departmentId: engineering.id,
      positionId: seniorEngineer.id,
      employeeCode: 'EMP-010',
      managerEmail: 'tung.ngo@codecrush.asia',
    },
    {
      email: 'ha.dang@codecrush.asia',
      fullName: 'Đặng Thu Hà',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1994-06-27'),
      idNumber: '001094100006',
      phone: '0900000011',
      joinDate: new Date('2023-01-09'),
      departmentId: engineering.id,
      positionId: seniorEngineer.id,
      employeeCode: 'EMP-011',
      managerEmail: 'tung.ngo@codecrush.asia',
    },
    {
      email: 'quan.ly@codecrush.asia',
      fullName: 'Lý Minh Quân',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1996-03-14'),
      idNumber: '001096100007',
      phone: '0900000012',
      joinDate: new Date('2023-06-01'),
      departmentId: engineering.id,
      positionId: softwareEngineer.id,
      employeeCode: 'EMP-012',
      managerEmail: 'tung.ngo@codecrush.asia',
    },
    {
      email: 'son.trinh@codecrush.asia',
      fullName: 'Trịnh Văn Sơn',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1997-08-30'),
      idNumber: '001097100008',
      phone: '0900000013',
      joinDate: new Date('2023-10-02'),
      departmentId: engineering.id,
      positionId: softwareEngineer.id,
      employeeCode: 'EMP-013',
      managerEmail: 'khoa.vu@codecrush.asia',
    },
    {
      email: 'ngoc.phan@codecrush.asia',
      fullName: 'Phan Thị Ngọc',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2000-12-01'),
      idNumber: '001000100009',
      phone: '0900000014',
      joinDate: new Date('2024-07-01'),
      departmentId: engineering.id,
      positionId: juniorEngineer.id,
      employeeCode: 'EMP-014',
      contractType: ContractType.INTERN,
      managerEmail: 'khoa.vu@codecrush.asia',
    },
    {
      email: 'anh.cao@codecrush.asia',
      fullName: 'Cao Đức Anh',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1999-04-19'),
      idNumber: '001099100010',
      phone: '0900000015',
      joinDate: new Date('2024-09-16'),
      departmentId: engineering.id,
      positionId: juniorEngineer.id,
      employeeCode: 'EMP-015',
      contractType: ContractType.PROBATION,
      managerEmail: 'tung.ngo@codecrush.asia',
    },
    {
      email: 'huong.mai@codecrush.asia',
      fullName: 'Mai Thị Hương',
      role: UserRole.HR_MANAGER,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1988-10-05'),
      idNumber: '001088100011',
      phone: '0900000016',
      joinDate: new Date('2022-03-21'),
      departmentId: hr.id,
      positionId: hrManager.id,
      employeeCode: 'EMP-016',
    },
    {
      email: 'binh.nguyen@codecrush.asia',
      fullName: 'Nguyễn Văn Bình',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1995-05-23'),
      idNumber: '001095100012',
      phone: '0900000017',
      joinDate: new Date('2023-02-13'),
      departmentId: hr.id,
      positionId: hrSpecialist.id,
      employeeCode: 'EMP-017',
      managerEmail: 'huong.mai@codecrush.asia',
    },
    {
      email: 'thao.le@codecrush.asia',
      fullName: 'Lê Thị Thảo',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1996-09-11'),
      idNumber: '001096100013',
      phone: '0900000018',
      joinDate: new Date('2023-11-06'),
      departmentId: hr.id,
      positionId: hrSpecialist.id,
      employeeCode: 'EMP-018',
      managerEmail: 'huong.mai@codecrush.asia',
    },
    {
      email: 'viet.tran@codecrush.asia',
      fullName: 'Trần Quốc Việt',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1994-02-28'),
      idNumber: '001094100014',
      phone: '0900000019',
      joinDate: new Date('2023-04-03'),
      departmentId: finance.id,
      positionId: accountant.id,
      employeeCode: 'EMP-019',
      managerEmail: 'lan.do@codecrush.asia',
    },
    {
      email: 'kim.vo@codecrush.asia',
      fullName: 'Võ Thị Kim',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1997-07-07'),
      idNumber: '001097100015',
      phone: '0900000020',
      joinDate: new Date('2024-01-15'),
      departmentId: finance.id,
      positionId: accountant.id,
      employeeCode: 'EMP-020',
      managerEmail: 'lan.do@codecrush.asia',
    },
    {
      email: 'long.dinh@codecrush.asia',
      fullName: 'Đinh Hoàng Long',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1991-11-29'),
      idNumber: '001091100016',
      phone: '0900000021',
      joinDate: new Date('2022-09-19'),
      departmentId: finance.id,
      positionId: seniorAccountant.id,
      employeeCode: 'EMP-021',
      managerEmail: 'lan.do@codecrush.asia',
    },
    {
      email: 'yen.ho@codecrush.asia',
      fullName: 'Hồ Thị Yến',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1996-01-16'),
      idNumber: '001096100017',
      phone: '0900000022',
      joinDate: new Date('2023-05-22'),
      departmentId: marketing.id,
      positionId: marketingSpecialist.id,
      employeeCode: 'EMP-022',
      managerEmail: 'huy.bui@codecrush.asia',
    },
    {
      email: 'tai.duong@codecrush.asia',
      fullName: 'Dương Văn Tài',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1998-03-08'),
      idNumber: '001098100018',
      phone: '0900000023',
      joinDate: new Date('2024-02-26'),
      departmentId: marketing.id,
      positionId: marketingSpecialist.id,
      employeeCode: 'EMP-023',
      managerEmail: 'huy.bui@codecrush.asia',
    },
    {
      email: 'dieu.pham@codecrush.asia',
      fullName: 'Phạm Thị Diệu',
      role: UserRole.EMPLOYEE,
      gender: Gender.FEMALE,
      dateOfBirth: new Date('1999-10-21'),
      idNumber: '001099100019',
      phone: '0900000024',
      joinDate: new Date('2024-06-10'),
      departmentId: marketing.id,
      positionId: marketingSpecialist.id,
      employeeCode: 'EMP-024',
      contractType: ContractType.PART_TIME,
      managerEmail: 'huy.bui@codecrush.asia',
    },
    {
      email: 'phuoc.nguyen@codecrush.asia',
      fullName: 'Nguyễn Hữu Phước',
      role: UserRole.EMPLOYEE,
      gender: Gender.MALE,
      dateOfBirth: new Date('1995-12-12'),
      idNumber: '001095100020',
      phone: '0900000025',
      joinDate: new Date('2023-08-14'),
      departmentId: engineering.id,
      positionId: softwareEngineer.id,
      employeeCode: 'EMP-025',
      contractType: ContractType.CONTRACT,
      managerEmail: 'tung.ngo@codecrush.asia',
    },
  ];

  for (const emp of additionalEmployees) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: emp.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: emp.email,
        passwordHash: defaultPassword,
        fullName: emp.fullName,
        role: emp.role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const employee = await prisma.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: user.id,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        dateOfBirth: emp.dateOfBirth,
        gender: emp.gender,
        idNumber: emp.idNumber,
        phone: emp.phone,
        joinDate: emp.joinDate,
        contractType: emp.contractType ?? ContractType.FULL_TIME,
        status: EmployeeStatus.ACTIVE,
        departmentId: emp.departmentId,
        positionId: emp.positionId,
      },
    });

    employeesByEmail[emp.email] = employee;
  }

  // Second pass: resolve managerEmail → managerId now that all rows exist.
  for (const emp of additionalEmployees) {
    if (!emp.managerEmail) continue;
    const manager = employeesByEmail[emp.managerEmail];
    if (!manager) continue;
    await prisma.employee.update({
      where: { id: employeesByEmail[emp.email].id },
      data: { managerId: manager.id },
    });
  }

  console.log(`Created ${additionalEmployees.length} additional employees with org links`);

  await seedRbac();

  await seedLeaveTypesForTenant(prisma, tenant.id);
  console.log('Seeded default leave types');

  await seedProbationCriteriaForTenant(prisma, tenant.id);
  console.log('Seeded default probation criteria');

  await prisma.timesheetPolicy.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: defaultPolicyCreateData(tenant.id),
  });
  const holidayCount = await seedHolidaysForTenant(prisma, tenant.id);
  console.log(`Seeded timesheet policy + ${holidayCount} VN holidays`);

  await seedPipelineTemplatesForTenant(prisma, tenant.id);
  console.log('Seeded default recruitment pipeline templates');

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
