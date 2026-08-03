import { Gender, MembershipStatus, UserRole } from '../auth/app-user';
import { SubmissionType } from '../submissions/submission';

export interface MemberSummary {
  id: string;
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  church: string;
  cityAddress: string | null;
  mobile: string | null;
  role: UserRole;
  membershipStatus: MembershipStatus;
  createdAt: string;
  isIdafLeader: boolean;
  wantsIdaf: boolean;
  cefSector: number | null;
  wantsCef: boolean;
}

export interface MemberAnswer {
  questionId: string | null;
  label: string;
  fieldType: string;
  value: unknown;
}

export interface MemberSubmission {
  id: string;
  type: SubmissionType;
  body: string;
  createdAt: string;
}
