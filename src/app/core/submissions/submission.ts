// Testimonies live in their own table/service now (see core/testimonies) --
// 'testimony' was a legacy value here, no longer produced or read anywhere.
export type SubmissionType = 'prayer_request' | 'counsel_request';

export interface AdminSubmission {
  id: string;
  type: SubmissionType;
  body: string;
  isAnonymous: boolean;
  createdAt: string;
  submittedBy: string | null;
  submittedByAvatar: string | null;
  mediaUrls: string[];
}

export interface SubmissionResponse {
  id: string;
  submissionId: string;
  // Null when the response is anonymous and the viewer isn't an elder --
  // redacted server-side (submission_responses_visible view), not just hidden
  // in the UI, since responder_id can't be nulled on the row itself (NOT NULL FK).
  responderId: string | null;
  responderName: string | null;
  responderAvatarUrl: string | null;
  body: string;
  createdAt: string;
}

export interface MySubmission {
  id: string;
  type: SubmissionType;
  body: string;
  isAnonymous: boolean;
  isAnswered: boolean;
  createdAt: string;
  mediaUrls: string[];
}
