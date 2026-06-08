import type { Commit, LanguageStat } from "./types.js";

/** Lower-cased file extension -> display language name. */
const EXT_MAP: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript (TSX)",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript (JSX)",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  c: "C",
  h: "C/C++ Header",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++ Header",
  cs: "C#",
  php: "PHP",
  swift: "Swift",
  m: "Objective-C",
  scala: "Scala",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  ps1: "PowerShell",
  lua: "Lua",
  dart: "Dart",
  ex: "Elixir",
  exs: "Elixir",
  elm: "Elm",
  clj: "Clojure",
  sql: "SQL",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  vue: "Vue",
  svelte: "Svelte",
  astro: "Astro",
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  md: "Markdown",
  mdx: "MDX",
  txt: "Text",
  csv: "CSV",
};

/** Exact filenames (no useful extension) mapped to a language. */
const FILENAME_MAP: Record<string, string> = {
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  ".gitignore": "Config",
  ".npmrc": "Config",
  ".editorconfig": "Config",
};

/** Classify a path into a language label. */
export function languageOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const lower = base.toLowerCase();
  if (FILENAME_MAP[lower]) return FILENAME_MAP[lower]!;

  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "Other";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_MAP[ext] ?? `.${ext}`;
}

/** Aggregate churn per language across commits. Sorted by churn desc. */
export function computeLanguages(commits: Commit[]): LanguageStat[] {
  const map = new Map<string, LanguageStat>();
  const seenFiles = new Map<string, Set<string>>();
  let totalChurn = 0;

  for (const c of commits) {
    for (const f of c.files) {
      if (f.binary) continue;
      const lang = languageOf(f.path);
      let entry = map.get(lang);
      if (!entry) {
        entry = {
          language: lang,
          files: 0,
          added: 0,
          removed: 0,
          churn: 0,
          share: 0,
        };
        map.set(lang, entry);
        seenFiles.set(lang, new Set());
      }
      entry.added += f.added;
      entry.removed += f.removed;
      entry.churn = entry.added + entry.removed;
      seenFiles.get(lang)!.add(f.path);
      totalChurn += f.added + f.removed;
    }
  }

  const langs = [...map.values()];
  for (const l of langs) {
    l.files = seenFiles.get(l.language)?.size ?? 0;
    l.share = totalChurn > 0 ? l.churn / totalChurn : 0;
  }
  langs.sort((x, y) => y.churn - x.churn || y.files - x.files);
  return langs;
}
