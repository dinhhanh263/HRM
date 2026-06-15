import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  normalizeName,
} from '../../src/domain/recruitment/candidate-normalize.js';

describe('normalizePhone (VN → E.164)', () => {
  it('should convert a leading-zero VN mobile to +84', () => {
    expect(normalizePhone('0901234567')).toBe('+84901234567');
  });

  it('should strip common separators before normalizing', () => {
    expect(normalizePhone('090 123 4567')).toBe('+84901234567');
    expect(normalizePhone('090-123-4567')).toBe('+84901234567');
    expect(normalizePhone('(090) 123.4567')).toBe('+84901234567');
  });

  it('should keep an already-E.164 number', () => {
    expect(normalizePhone('+84901234567')).toBe('+84901234567');
  });

  it('should convert a 00 international prefix to +', () => {
    expect(normalizePhone('0084901234567')).toBe('+84901234567');
  });

  it('should add + to a bare country-code number starting with 84', () => {
    expect(normalizePhone('84901234567')).toBe('+84901234567');
  });

  it('should produce the same E.164 for differently-formatted equal numbers', () => {
    const a = normalizePhone('0901234567');
    const b = normalizePhone('+84 90 123 4567');
    const c = normalizePhone('84901234567');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('should return null for empty or nullish input', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it('should return null for too-short or non-numeric junk', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('0')).toBeNull();
  });

  it('should preserve a non-VN international number with explicit +', () => {
    expect(normalizePhone('+1 415 555 2671')).toBe('+14155552671');
  });
});

describe('normalizeName (diacritic-insensitive key for fuzzy match)', () => {
  it('should lowercase and strip Vietnamese diacritics', () => {
    expect(normalizeName('Nguyễn Văn Á')).toBe('nguyen van a');
    expect(normalizeName('Trần Thị Hoà')).toBe('tran thi hoa');
  });

  it('should map đ/Đ to d', () => {
    expect(normalizeName('Đỗ Đình Đạt')).toBe('do dinh dat');
  });

  it('should collapse repeated whitespace and trim', () => {
    expect(normalizeName('  Lê   Văn  Bình  ')).toBe('le van binh');
  });

  it('should return empty string for nullish input', () => {
    expect(normalizeName('')).toBe('');
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });

  it('should produce equal keys for same name with/without diacritics', () => {
    expect(normalizeName('Phạm Quốc Việt')).toBe(normalizeName('Pham Quoc Viet'));
  });
});
