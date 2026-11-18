// بيانات الموظف الأساسية الناقصة — تظهر علامة صفراء في قائمة الموظفين وملفه
/** البيانات الأساسية الناقصة في ملف الموظف (تظهر علامة صفراء) */
export function missingInfo(r: { name: string; hireDate?: string | null; department?: unknown; basicSalary?: number | null }): string[] {
  const m: string[] = [];
  if (/^موظف \S+$/.test(r.name)) m.push('الاسم');
  if (!r.department) m.push('القسم');
  if (!r.hireDate) m.push('تاريخ التعيين');
  if (!r.basicSalary) m.push('الراتب');
  return m;
}
