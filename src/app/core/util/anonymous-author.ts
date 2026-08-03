import { Gender } from '../auth/app-user';
import { ageFromDob } from './age';

/**
 * Display name for an anonymous testimony:
 *   "A 23 years old brother from CCSGM Kawit"
 * Falls back gracefully when age or gender is unknown.
 */
export function anonymousAuthor(
  dateOfBirth: string | null,
  gender: Gender | null,
  church: string,
): string {
  const age = ageFromDob(dateOfBirth);
  const relation = gender === 'male' ? 'brother' : gender === 'female' ? 'sister' : 'member';
  const agePart = age !== null ? `${age} years old ` : '';
  return `A ${agePart}${relation} from ${church}`;
}
