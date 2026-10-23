const NBSP = String.fromCharCode(0x00a0);
const NNBSP = String.fromCharCode(0x202f);

/**
 * French typography for display: the space before ? ! ; : and inside « » must not break a line.
 * Text from the model or a source often uses plain spaces there, so a closing » or ? ends up alone
 * at the start of a line. Display only: stored text is never changed.
 * `[^\S\r\n]` is any horizontal space, including the non-breaking ones.
 */
export function keepFrenchSpaces(text: string): string {
  return text
    .replace(/[^\S\r\n]+([?!;])/g, `${NNBSP}$1`)
    .replace(/[^\S\r\n]+:(?=\s|$)/g, `${NBSP}:`)
    .replace(/«[^\S\r\n]+/g, `«${NBSP}`)
    .replace(/[^\S\r\n]+»/g, `${NBSP}»`);
}
