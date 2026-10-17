/** Legacy quiz indentation contains NBSP. Preserve the bank while rendering copyable Python whitespace. */
export function displayCode(source: string): string {
  return source.replace(/^[ \t\u00a0]+/gm, (indent) =>
    indent.replaceAll("\u00a0", " "),
  );
}
