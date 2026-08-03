export interface BirthdayInfo {
  isToday: boolean;
  daysUntil: number;
  turningAge: number;
  month: number; // 0-11
  day: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Next occurrence of a date_of_birth's month/day, relative to `now`. */
export function birthdayInfo(dateOfBirth: string | null, now: Date = new Date()): BirthdayInfo | null {
  if (!dateOfBirth) {
    return null;
  }
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const month = dob.getMonth();
  const day = dob.getDate();
  const today = startOfDay(now);

  let next = new Date(now.getFullYear(), month, day);
  if (startOfDay(next) < today) {
    next = new Date(now.getFullYear() + 1, month, day);
  }

  const daysUntil = Math.round((startOfDay(next).getTime() - today.getTime()) / 86_400_000);
  const turningAge = next.getFullYear() - dob.getFullYear();

  return { isToday: daysUntil === 0, daysUntil, turningAge, month, day };
}
