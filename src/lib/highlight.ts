import { getSingletonHighlighter } from 'shiki';
import type { HighlightedCodeLine } from './types';

const theme = 'github-dark';
const supportedLanguages = ['python', 'bash', 'json', 'javascript', 'typescript', 'text'] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];

const languageAliases: Record<string, SupportedLanguage> = {
  bash: 'bash',
  js: 'javascript',
  javascript: 'javascript',
  json: 'json',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  text: 'text',
  plaintext: 'text',
  ts: 'typescript',
  typescript: 'typescript',
};

const highlighterPromise = getSingletonHighlighter({
  themes: [theme],
  langs: [...supportedLanguages],
});

export async function highlightCodeLines(code: string, language: string): Promise<HighlightedCodeLine[]> {
  const normalizedLanguage = languageAliases[language.trim().toLowerCase()] ?? 'text';
  const highlighter = await highlighterPromise;
  const { tokens } = highlighter.codeToTokens(code.replace(/\r\n?/g, '\n'), {
    lang: normalizedLanguage,
    theme,
  });

  return tokens.map((line) => line.map(({ content, color, fontStyle }) => ({
    content,
    ...(color ? { color } : {}),
    ...(fontStyle ? { fontStyle } : {}),
  })));
}
