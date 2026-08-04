import { Gender } from '../auth/app-user';

/**
 * Display name for an anonymous testimony shared to the website:
 *   "A brother from CCSGM Kawit" / "A sister from CCSGM Kawit"
 * Only used when the testimony's isAnonymous flag is set -- a named
 * testimony's author is simply the member's own name.
 */
export function anonymousAuthor(gender: Gender | null, church: string): string {
  return `A ${gender === 'male' ? 'brother' : 'sister'} from ${church}`;
}
