/**
 * Lab member authorization
 */

import membersData from '../data/members.json';

export function isMember(email: string): boolean {
  const normalizedEmail = email.toLowerCase();
  return membersData.members.some(
    (member) => member.toLowerCase() === normalizedEmail
  );
}
