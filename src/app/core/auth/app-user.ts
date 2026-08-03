export type UserRole = 'member' | 'elder';
export type Gender = 'male' | 'female';
export type MembershipStatus = 'pending' | 'approved' | 'rejected';

export interface AppUser {
  id: string;
  role: UserRole;
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  church: string;
  cityAddress: string | null;
  mobile: string | null;
  membershipStatus: MembershipStatus;
  avatarUrl: string | null;
  branchId: string | null;
  groupId: string | null;
}

export interface ProfileBasics {
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  church: string;
  cityAddress: string | null;
  mobile: string | null;
}
