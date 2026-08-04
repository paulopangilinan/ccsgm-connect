import { Component, computed, inject, signal } from '@angular/core';
import { MembersService } from '../../../core/members/members.service';
import { GreetingsService } from '../../../core/greetings/greetings.service';
import { MemberSummary } from '../../../core/members/member';
import { birthdayInfo } from '../../../core/util/birthday';

interface BirthdayRow {
  member: MemberSummary;
  isToday: boolean;
  daysUntil: number;
  turningAge: number;
  day: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DEFAULT_MESSAGE =
  "Happy birthday! Wishing you a wonderful day full of joy and God's blessings, from your CCSGM family. 🎉";

@Component({
  selector: 'app-admin-birthdays',
  imports: [],
  templateUrl: './admin-birthdays.html',
  styleUrl: './admin-birthdays.css',
})
export class AdminBirthdays {
  private readonly membersService = inject(MembersService);
  private readonly greetingsService = inject(GreetingsService);

  protected readonly loading = signal(true);
  protected readonly members = signal<MemberSummary[]>([]);
  protected readonly sendingId = signal<string | null>(null);
  protected readonly noteByMember = signal<Map<string, string>>(new Map());
  protected readonly monthName = MONTH_NAMES[new Date().getMonth()];

  protected readonly thisMonth = computed<BirthdayRow[]>(() => {
    const now = new Date();
    const rows: BirthdayRow[] = [];
    for (const member of this.members()) {
      const info = birthdayInfo(member.dateOfBirth, now);
      if (info && info.month === now.getMonth()) {
        rows.push({
          member,
          isToday: info.isToday,
          daysUntil: info.daysUntil,
          turningAge: info.turningAge,
          day: info.day,
        });
      }
    }
    return rows.sort((a, b) => a.day - b.day);
  });

  protected readonly today = computed(() => this.thisMonth().filter((r) => r.isToday));
  protected readonly upcoming = computed(() => this.thisMonth().filter((r) => !r.isToday));

  constructor() {
    void this.load();
  }

  protected noteFor(memberId: string): string | null {
    return this.noteByMember().get(memberId) ?? null;
  }

  protected async greetViaProfile(row: BirthdayRow): Promise<void> {
    await this.send(row, () => this.greetingsService.sendProfileGreeting(row.member.id, DEFAULT_MESSAGE));
  }

  protected async greetViaEmail(row: BirthdayRow): Promise<void> {
    await this.send(row, () => this.greetingsService.sendEmailGreeting(row.member.id));
  }

  protected async greetViaSms(row: BirthdayRow): Promise<void> {
    await this.send(row, () => this.greetingsService.sendSmsGreeting(row.member.id));
  }

  private async send(row: BirthdayRow, action: () => Promise<{ error: string | null }>): Promise<void> {
    if (this.sendingId()) {
      return;
    }
    this.sendingId.set(row.member.id);
    const { error } = await action();
    this.sendingId.set(null);

    const notes = new Map(this.noteByMember());
    notes.set(row.member.id, error ? `Not sent: ${error}` : 'Sent!');
    this.noteByMember.set(notes);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.members.set(await this.membersService.list());
    this.loading.set(false);
  }
}
