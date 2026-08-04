import { Gender } from '../auth/app-user';

export type WebsiteReviewStatus = 'pending' | 'approved' | 'rejected';
export type WebsiteSyncStatus = 'not_synced' | 'synced' | 'failed';

export interface Testimony {
  id: string;
  linkedPrayerId: string | null;
  body: string;
  isAnonymous: boolean;
  shareToWebsite: boolean;
  createdAt: string;
  mediaUrls: string[];
  websiteReviewStatus: WebsiteReviewStatus | null;
  websiteReviewNote: string | null;
  websiteSyncStatus: WebsiteSyncStatus;
}

export interface NewTestimony {
  body: string;
  isAnonymous: boolean;
  shareToWebsite: boolean;
  linkedPrayerId: string | null;
  images: File[];
}

// Elder-facing view of a testimony flagged share_to_website = true, joined
// with the submitter's profile and the linked prayer (if any) so the review
// screen can show everything without extra round-trips.
export interface AdminTestimony {
  id: string;
  userId: string;
  body: string;
  isAnonymous: boolean;
  createdAt: string;
  mediaUrls: string[];
  linkedPrayerId: string | null;
  linkedPrayerBody: string | null;
  submitterName: string;
  submitterGender: Gender | null;
  submitterChurch: string;
  submitterAvatarUrl: string | null;
  websiteReviewStatus: WebsiteReviewStatus;
  websiteReviewNote: string | null;
  websiteSyncStatus: WebsiteSyncStatus;
  websitePostId: string | null;
  websiteSyncError: string | null;
  websiteSyncedAt: string | null;
}
