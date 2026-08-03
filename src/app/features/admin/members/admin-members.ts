import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MembersService } from '../../../core/members/members.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { MemberAnswer, MemberSummary } from '../../../core/members/member';
import { ageFromDob } from '../../../core/util/age';

@Component({
  selector: 'app-admin-members',
  imports: [NgTemplateOutlet],
  templateUrl: './admin-members.html',
  styleUrl: './admin-members.css',
})
export class AdminMembers {
  private readonly membersService = inject(MembersService);
  private readonly notifications = inject(NotificationsService);

  protected readonly loading = signal(true);
  protected readonly members = signal<MemberSummary[]>([]);
  protected readonly expandedId = signal<string | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly answers = signal<MemberAnswer[]>([]);
  protected readonly updatingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly pending = computed(() =>
    this.members().filter((m) => m.membershipStatus === 'pending'),
  );
  protected readonly active = computed(() =>
    this.members().filter((m) => m.membershipStatus !== 'pending'),
  );

  constructor() {
    void this.load();
    // Reload live when a new member signs up (realtime bumps pendingCount).
    let first = true;
    effect(() => {
      this.notifications.pendingCount();
      if (first) {
        first = false;
        return;
      }
      void this.load();
    });
  }

  protected async approve(member: MemberSummary): Promise<void> {
    await this.updateStatus(member, 'approved');
  }

  protected async reject(member: MemberSummary): Promise<void> {
    await this.updateStatus(member, 'rejected');
  }

  private async updateStatus(
    member: MemberSummary,
    status: MemberSummary['membershipStatus'],
  ): Promise<void> {
    if (this.updatingId()) {
      return;
    }
    this.errorMessage.set(null);
    this.updatingId.set(member.id);
    const { error } = await this.membersService.setMembershipStatus(member.id, status);
    this.updatingId.set(null);

    if (error) {
      this.errorMessage.set(error);
      return;
    }
    await this.notifications.refreshPendingCount();
    await this.load();
  }

  protected cefSectorLabel(sector: number | null): string {
    return sector === null ? 'None' : `Sector ${sector}`;
  }

  protected ageOf(member: MemberSummary): number | null {
    return ageFromDob(member.dateOfBirth);
  }

  protected metaLine(member: MemberSummary): string {
    const age = this.ageOf(member);
    const parts = [
      age !== null ? `${age} yrs` : null,
      member.gender ? member.gender[0].toUpperCase() + member.gender.slice(1) : null,
      member.cityAddress,
      member.church,
    ].filter((part): part is string => !!part);
    return parts.length ? parts.join(' · ') : 'Profile not completed';
  }

  protected formatAnswer(answer: MemberAnswer): string {
    if (typeof answer.value === 'boolean') {
      return answer.value ? 'Yes' : 'No';
    }
    if (answer.value === null || answer.value === undefined || answer.value === '') {
      return '—';
    }
    return String(answer.value);
  }

  protected async toggle(member: MemberSummary): Promise<void> {
    if (this.expandedId() === member.id) {
      this.expandedId.set(null);
      return;
    }

    this.expandedId.set(member.id);
    this.detailLoading.set(true);
    this.answers.set(await this.membersService.listAnswers(member.id));
    this.detailLoading.set(false);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.members.set(await this.membersService.list());
    this.loading.set(false);
  }
}
