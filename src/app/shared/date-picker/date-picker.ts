import { Component, computed, input, output, signal } from '@angular/core';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

@Component({
  selector: 'app-date-picker',
  imports: [],
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
})
export class DatePicker {
  readonly value = input<string | null>(null);
  readonly valueChange = output<string | null>();
  readonly placeholder = input('Select a date');

  protected readonly months = MONTHS;
  protected readonly weekdays = WEEKDAYS;
  protected readonly years = (() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let y = current; y >= 1900; y -= 1) {
      list.push(y);
    }
    return list;
  })();

  protected readonly open = signal(false);
  protected readonly viewYear = signal(2000);
  protected readonly viewMonth = signal(0);

  protected readonly label = computed(() => {
    const parts = this.parse(this.value());
    if (!parts) {
      return this.placeholder();
    }
    return `${MONTHS[parts.month]} ${parts.day}, ${parts.year}`;
  });

  protected readonly hasValue = computed(() => this.parse(this.value()) !== null);

  protected readonly grid = computed<(number | null)[]>(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(d);
    }
    return cells;
  });

  protected toggleOpen(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const parts = this.parse(this.value());
    this.viewYear.set(parts?.year ?? 2000);
    this.viewMonth.set(parts?.month ?? 0);
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected setMonth(month: string): void {
    this.viewMonth.set(Number(month));
  }

  protected setYear(year: string): void {
    this.viewYear.set(Number(year));
  }

  protected isSelected(day: number): boolean {
    const parts = this.parse(this.value());
    return !!parts && parts.year === this.viewYear() && parts.month === this.viewMonth() && parts.day === day;
  }

  protected select(day: number): void {
    this.valueChange.emit(`${this.viewYear()}-${pad(this.viewMonth() + 1)}-${pad(day)}`);
    this.open.set(false);
  }

  private parse(value: string | null): { year: number; month: number; day: number } | null {
    if (!value) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }
}
