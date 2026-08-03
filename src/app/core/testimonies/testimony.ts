export interface Testimony {
  id: string;
  linkedPrayerId: string | null;
  body: string;
  isAnonymous: boolean;
  shareToWebsite: boolean;
  createdAt: string;
  mediaUrls: string[];
}

export interface NewTestimony {
  body: string;
  isAnonymous: boolean;
  shareToWebsite: boolean;
  linkedPrayerId: string | null;
  images: File[];
}
