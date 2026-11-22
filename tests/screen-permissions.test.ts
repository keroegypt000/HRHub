import { describe, it, expect } from 'vitest';
import { canRead, canWrite, userScreens, type AuthUser } from '@/lib/auth';

const user = (role: string, screens?: Record<string, string>): AuthUser => ({
  id: 'u', username: 'u', name: 'u', role, active: true, employeeId: null,
  permissions: screens ? { screens } : null,
} as AuthUser);

describe('per-user screen permissions', () => {
  it('admin always has everything, even with a custom map', () => {
    const a = user('admin', { payroll: 'none' });
    expect(canRead(a, 'payroll-periods')).toBe(true);
    expect(canWrite(a, 'payroll-periods')).toBe(true);
    expect(userScreens(a).payroll).toBe('edit');
  });
  it('role defaults apply when nothing is customized', () => {
    const hr = user('hr');
    expect(userScreens(hr).employees).toBe('edit');
    expect(userScreens(hr).settings).toBe('none');
    expect(canWrite(hr, 'employees')).toBe(true);
  });
  it('hidden screen blocks its data, view blocks editing, edit allows it', () => {
    const u = user('hr', { payroll: 'none', employees: 'view', vehicles: 'edit' });
    expect(canRead(u, 'payroll-periods')).toBe(false);
    expect(canWrite(u, 'payroll-periods')).toBe(false);
    expect(canRead(u, 'employees')).toBe(true);
    expect(canWrite(u, 'employees')).toBe(false);
    expect(canWrite(u, 'vehicles')).toBe(true);
    expect(userScreens(u).payroll).toBe('none');
  });
  it('lookup lists stay readable when their screen is hidden', () => {
    const u = user('hr', { employees: 'none', 'daily-attendance': 'view' });
    expect(canRead(u, 'employees')).toBe(true); // قوائم اختيار الموظف في الحضور
    expect(canWrite(u, 'employees')).toBe(false);
  });
  it('can grant a viewer edit on one screen', () => {
    const v = user('viewer', { leaves: 'edit' });
    expect(canWrite(v, 'leaves')).toBe(true);
    expect(canWrite(v, 'employees')).toBe(false);
  });
  it('admin-only screens can never be granted to others', () => {
    const u = user('hr', { settings: 'edit', users: 'edit' });
    expect(canRead(u, 'settings')).toBe(false);
    expect(userScreens(u).users).toBe('none');
  });
});
