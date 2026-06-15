import type { PrismaClient } from '@prisma/client';

// Vietnam statutory public holidays (Điều 112 BLLĐ 2019). Solar-fixed holidays
// recur on the same Gregorian date every year. Lunar-based holidays (Tết, Giỗ
// Tổ Hùng Vương) shift each year, so they are stored non-recurring and looked
// up per Gregorian year from the table below.

interface HolidaySeed {
  date: string; // YYYY-MM-DD
  name: string;
  recurring: boolean;
}

function solarHolidays(year: number): HolidaySeed[] {
  return [
    { date: `${year}-01-01`, name: 'Tết Dương lịch', recurring: true },
    { date: `${year}-04-30`, name: 'Ngày Giải phóng miền Nam', recurring: true },
    { date: `${year}-05-01`, name: 'Quốc tế Lao động', recurring: true },
    { date: `${year}-09-01`, name: 'Quốc khánh (nghỉ liền kề)', recurring: true },
    { date: `${year}-09-02`, name: 'Quốc khánh', recurring: true },
  ];
}

// Lunar-derived holidays per Gregorian year (Tết = 5 days incl. Giao thừa;
// Giỗ Tổ Hùng Vương = 10/3 âm lịch). Extend this table as new years are needed.
const LUNAR_HOLIDAYS: Record<number, HolidaySeed[]> = {
  2026: [
    { date: '2026-02-16', name: 'Tết Nguyên đán (Giao thừa)', recurring: false },
    { date: '2026-02-17', name: 'Tết Nguyên đán (Mùng 1)', recurring: false },
    { date: '2026-02-18', name: 'Tết Nguyên đán (Mùng 2)', recurring: false },
    { date: '2026-02-19', name: 'Tết Nguyên đán (Mùng 3)', recurring: false },
    { date: '2026-02-20', name: 'Tết Nguyên đán (Mùng 4)', recurring: false },
    { date: '2026-04-26', name: 'Giỗ Tổ Hùng Vương', recurring: false },
  ],
  2027: [
    { date: '2027-02-05', name: 'Tết Nguyên đán (Giao thừa)', recurring: false },
    { date: '2027-02-06', name: 'Tết Nguyên đán (Mùng 1)', recurring: false },
    { date: '2027-02-07', name: 'Tết Nguyên đán (Mùng 2)', recurring: false },
    { date: '2027-02-08', name: 'Tết Nguyên đán (Mùng 3)', recurring: false },
    { date: '2027-02-09', name: 'Tết Nguyên đán (Mùng 4)', recurring: false },
    { date: '2027-04-16', name: 'Giỗ Tổ Hùng Vương', recurring: false },
  ],
  2028: [
    { date: '2028-01-25', name: 'Tết Nguyên đán (Giao thừa)', recurring: false },
    { date: '2028-01-26', name: 'Tết Nguyên đán (Mùng 1)', recurring: false },
    { date: '2028-01-27', name: 'Tết Nguyên đán (Mùng 2)', recurring: false },
    { date: '2028-01-28', name: 'Tết Nguyên đán (Mùng 3)', recurring: false },
    { date: '2028-01-29', name: 'Tết Nguyên đán (Mùng 4)', recurring: false },
    { date: '2028-04-04', name: 'Giỗ Tổ Hùng Vương', recurring: false },
  ],
  2029: [
    { date: '2029-02-12', name: 'Tết Nguyên đán (Giao thừa)', recurring: false },
    { date: '2029-02-13', name: 'Tết Nguyên đán (Mùng 1)', recurring: false },
    { date: '2029-02-14', name: 'Tết Nguyên đán (Mùng 2)', recurring: false },
    { date: '2029-02-15', name: 'Tết Nguyên đán (Mùng 3)', recurring: false },
    { date: '2029-02-16', name: 'Tết Nguyên đán (Mùng 4)', recurring: false },
    { date: '2029-04-23', name: 'Giỗ Tổ Hùng Vương', recurring: false },
  ],
  2030: [
    { date: '2030-02-01', name: 'Tết Nguyên đán (Giao thừa)', recurring: false },
    { date: '2030-02-02', name: 'Tết Nguyên đán (Mùng 1)', recurring: false },
    { date: '2030-02-03', name: 'Tết Nguyên đán (Mùng 2)', recurring: false },
    { date: '2030-02-04', name: 'Tết Nguyên đán (Mùng 3)', recurring: false },
    { date: '2030-02-05', name: 'Tết Nguyên đán (Mùng 4)', recurring: false },
    { date: '2030-04-12', name: 'Giỗ Tổ Hùng Vương', recurring: false },
  ],
};

/** Whether the lunar-holiday table covers the given Gregorian year (Tết, Giỗ Tổ). */
export function hasLunarHolidays(year: number): boolean {
  return year in LUNAR_HOLIDAYS;
}

export function vietnamHolidaysForYear(year: number): HolidaySeed[] {
  return [...solarHolidays(year), ...(LUNAR_HOLIDAYS[year] ?? [])];
}

export interface SeedHolidaysOutcome {
  seeded: number;
  lunarCovered: boolean;
}

/** Idempotently seed a tenant's VN statutory holidays for the given year. */
export async function seedHolidaysForTenant(
  prisma: PrismaClient,
  tenantId: string,
  year: number = new Date().getUTCFullYear(),
): Promise<SeedHolidaysOutcome> {
  const holidays = vietnamHolidaysForYear(year);
  for (const h of holidays) {
    const date = new Date(`${h.date}T00:00:00.000Z`);
    await prisma.holiday.upsert({
      where: { tenantId_date: { tenantId, date } },
      update: { name: h.name, recurring: h.recurring },
      create: { tenantId, date, name: h.name, recurring: h.recurring },
    });
  }
  return { seeded: holidays.length, lunarCovered: hasLunarHolidays(year) };
}
