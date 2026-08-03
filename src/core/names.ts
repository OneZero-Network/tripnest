/**
 * Member-name validation.
 *
 * Real bug this prevents: a tester typed an amount into the "who else is
 * coming" field and the app cheerfully created a person called "5000", who
 * then appeared throughout the settlement as "Adnan → 5000 · ₹1,651.66".
 * The arithmetic was correct and the screen was nonsense, which is the worst
 * possible combination — it looks like a calculation bug and erodes trust in
 * an engine that did nothing wrong.
 *
 * The rule is deliberately narrow: reject only what cannot plausibly be a
 * name. Names with digits in them are fine ("Ayaz 2", "R2"); a string that is
 * *nothing but* digits, currency symbols, and separators is not.
 */

/** Returns an error message, or null if the name is acceptable. */
export function validateMemberName(raw: string, existing: string[] = []): string | null {
  const name = raw.trim()

  if (!name) return 'Enter a name.'

  if (/^[\d\s.,₹$€£+-]+$/.test(name)) {
    return 'That looks like an amount, not a name. Enter the person\u2019s name here.'
  }

  if (name.length > 40) return 'That name is too long — 40 characters at most.'

  if (existing.some((e) => e.trim().toLowerCase() === name.toLowerCase())) {
    return 'Someone on this trip already has that name.'
  }

  return null
}
