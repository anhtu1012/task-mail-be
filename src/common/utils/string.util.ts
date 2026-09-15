export class StringUtil {
  static maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }

  /** "Báo giá" -> "bao gia". Đ/đ has no combining form, so it is mapped by hand. */
  static removeDiacritics(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D');
  }

  /** Label slug the frontend quick-add matches: "Báo giá" -> "baogia". */
  static toLabelSlug(name: string): string {
    return this.removeDiacritics(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
