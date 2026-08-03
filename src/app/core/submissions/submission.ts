export type SubmissionType = 'prayer_request' | 'testimony' | 'counsel_request';

export interface AdminSubmission {
  id: string;
  type: SubmissionType;
  body: string;
  isAnonymous: boolean;
  createdAt: string;
  submittedBy: string | null;
  submittedByAvatar: string | null;
}

export interface SubmissionResponse {
  id: string;
  submissionId: string;
  responderName: string | null;
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
}
