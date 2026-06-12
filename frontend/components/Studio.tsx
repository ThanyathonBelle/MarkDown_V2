"use client";

import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  BookOpen,
  Clipboard,
  Download,
  FileDown,
  FileText,
  Loader2,
  Moon,
  Plus,
  Save,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useState } from "react";

import {
  createDocument,
  deleteDocument,
  exportPdf,
  listDocuments,
  postMarkdownTask,
  updateDocument,
} from "@/lib/api";
import type { DocumentRecord, GenerationMode, MarkdownTask } from "@/lib/types";

const STARTER_MARKDOWN = `# Markdown AI Studio

Start with a prompt, generate Markdown, then edit the result here.

- Live preview updates as you type
- Save drafts to PostgreSQL
- Export to Markdown or PDF
`;

type Tool = {
  label: string;
  icon: typeof Sparkles;
  run: () => Promise<void>;
};

function filenameFromTitle(title: string, extension: string) {
  const safe = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${safe || "markdown-document"}.${extension}`;
}

export default function Studio() {
  const [prompt, setPrompt] = useState("");
  const [markdown, setMarkdown] = useState(STARTER_MARKDOWN);
  const [title, setTitle] = useState("Untitled document");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("markdown-ai-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(storedTheme ? storedTheme === "dark" : prefersDark);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem("markdown-ai-theme", isDark ? "dark" : "light");
  }, [isDark]);

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load document history.");
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  async function runTask(task: MarkdownTask, options?: { mode?: GenerationMode; replace?: boolean; label?: string }) {
    setError(null);
    setIsLoading(true);
    setActiveTool(options?.label ?? task);
    setStatus("Generating");

    const shouldReplace = options?.replace ?? true;
    if (shouldReplace) {
      setMarkdown("");
    }

    try {
      await postMarkdownTask(task, {
        prompt,
        content: markdown,
        mode: options?.mode ?? "markdown",
        onChunk: (chunk) => {
          setMarkdown((current) => (shouldReplace ? current + chunk : `${current}${chunk}`));
        },
      });
      setStatus("Ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The backend or LLM server failed.");
      setStatus("Error");
    } finally {
      setIsLoading(false);
      setActiveTool(null);
    }
  }

  const tools: Tool[] = [
    {
      label: "Generate",
      icon: Sparkles,
      run: () => runTask("generate", { label: "Generate" }),
    },
    {
      label: "Improve",
      icon: Wand2,
      run: () => runTask("improve", { label: "Improve" }),
    },
    {
      label: "Summarize",
      icon: BookOpen,
      run: () => runTask("summarize", { label: "Summarize" }),
    },
    {
      label: "README",
      icon: FileText,
      run: () => runTask("generate", { mode: "readme", label: "README" }),
    },
    {
      label: "Report",
      icon: FileText,
      run: () => runTask("generate", { mode: "report", label: "Report" }),
    },
  ];

  async function handleSave() {
    setError(null);
    try {
      const payload = { title, content: markdown };
      const saved = activeId ? await updateDocument(activeId, payload) : await createDocument(payload);
      setActiveId(saved.id);
      setTitle(saved.title);
      setMarkdown(saved.content);
      await refreshDocuments();
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save document.");
    }
  }

  function handleNewDocument() {
    setActiveId(null);
    setTitle("Untitled document");
    setPrompt("");
    setMarkdown("");
    setStatus("Ready");
    setError(null);
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filenameFromTitle(title, "md");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPdf() {
    setError(null);
    try {
      const blob = await exportPdf({ title, markdown });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromTitle(title, "pdf");
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export PDF.");
    }
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setStatus("Copied");
  }

  async function openDocument(document: DocumentRecord) {
    setActiveId(document.id);
    setTitle(document.title);
    setMarkdown(document.content);
    setError(null);
  }

  async function removeDocument(id: string) {
    try {
      await deleteDocument(id);
      if (activeId === id) {
        handleNewDocument();
      }
      await refreshDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete document.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 transition-colors dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600 text-white">
              <FileText size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">Markdown AI Studio</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{status}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="icon-button" onClick={handleNewDocument} title="New document" type="button">
              <Plus size={18} />
            </button>
            <button className="action-button" onClick={handleSave} type="button">
              <Save size={16} />
              Save
            </button>
            <button className="icon-button" onClick={copyMarkdown} title="Copy Markdown" type="button">
              <Clipboard size={18} />
            </button>
            <button className="icon-button" onClick={downloadMarkdown} title="Export Markdown" type="button">
              <Download size={18} />
            </button>
            <button className="icon-button" onClick={downloadPdf} title="Export PDF" type="button">
              <FileDown size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setIsDark((current) => !current)}
              title={isDark ? "Light mode" : "Dark mode"}
              type="button"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
              History
            </h2>
            <button className="icon-button-small" onClick={refreshDocuments} title="Refresh history" type="button">
              <Loader2 size={15} />
            </button>
          </div>
          <div className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No saved documents</p>
            ) : (
              documents.map((document) => (
                <div
                  className={`group flex items-center gap-2 rounded-lg border p-2 ${
                    activeId === document.id
                      ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40"
                      : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950"
                  }`}
                  key={document.id}
                >
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openDocument(document)}
                    title={document.title}
                    type="button"
                  >
                    <span className="block truncate text-sm font-medium">{document.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {new Date(document.updated_at).toLocaleString()}
                    </span>
                  </button>
                  <button
                    className="icon-button-small opacity-70"
                    onClick={() => removeDocument(document.id)}
                    title="Delete document"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-h-[calc(100vh-130px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 p-3 dark:border-slate-800">
              <input
                className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Document title"
                value={title}
              />
              <textarea
                className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Prompt"
                value={prompt}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      className="action-button"
                      disabled={isLoading}
                      key={tool.label}
                      onClick={tool.run}
                      type="button"
                    >
                      {isLoading && activeTool === tool.label ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Icon size={16} />
                      )}
                      {tool.label}
                    </button>
                  );
                })}
                <button className="action-button" onClick={() => setMarkdown("")} type="button">
                  <Trash2 size={16} />
                  Clear
                </button>
              </div>
              {error ? (
                <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1">
              <CodeMirror
                basicSetup={{
                  foldGutter: true,
                  highlightActiveLine: true,
                  lineNumbers: true,
                }}
                extensions={[markdownLanguage()]}
                onChange={setMarkdown}
                theme={isDark ? oneDark : githubLight}
                value={markdown}
              />
            </div>
          </div>

          <div className="min-h-[calc(100vh-130px)] overflow-auto rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <ReactMarkdown className="markdown-preview" remarkPlugins={[remarkGfm]}>
              {markdown || "_Preview will appear here._"}
            </ReactMarkdown>
          </div>
        </section>
      </div>
    </main>
  );
}
