/**
 * List of known free / personal email providers.
 * Agency workspaces require a corporate (non-free) domain.
 */
const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.fr", "yahoo.de",
  "ymail.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de",
  "outlook.com", "outlook.co.uk", "outlook.fr", "outlook.de",
  "live.com", "live.co.uk",
  "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com",
  "protonmail.com", "proton.me", "pm.me",
  "zoho.com",
  "yandex.com", "yandex.ru",
  "mail.com", "mail.ru",
  "gmx.com", "gmx.net", "gmx.de",
  "inbox.com",
  "comcast.net", "sbcglobal.net", "verizon.net", "att.net",
  "bellsouth.net", "cox.net", "earthlink.net",
  "163.com", "126.com", "qq.com", "sina.com",
  "tutanota.com", "tutanota.de", "tutamail.com",
  "fastmail.com", "fastmail.fm",
  "hey.com",
  "rocketmail.com",
  "rediffmail.com",
  "wp.pl", "interia.pl", "o2.pl",
  "seznam.cz", "centrum.cz",
]);

/** Returns the lowercase domain portion of an email address. */
export function getEmailDomain(email: string): string {
  return email.toLowerCase().split("@")[1] ?? "";
}

/** Returns true if the email uses a known free / personal provider. */
export function isFreeEmailDomain(email: string): boolean {
  return FREE_DOMAINS.has(getEmailDomain(email));
}
