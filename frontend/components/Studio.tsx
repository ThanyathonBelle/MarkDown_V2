"use client";

import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import { githubLight } from "@uiw/codemirror-theme-github";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  BookOpen,
  Clipboard,
  Download,
  Building2,
  FileDown,
  FileText,
  Files,
  Loader2,
  Moon,
  Plus,
  Save,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useState } from "react";

import {
  createDocument,
  deleteDocument,
  exportPdf,
  generateTor,
  getTorTemplateProfile,
  listDocuments,
  listTorCompanies,
  listTorDocuments,
  postMarkdownTask,
  updateDocument,
  uploadTorDocument,
} from "@/lib/api";
import type {
  CompanyRecord,
  DocumentRecord,
  GenerationMode,
  MarkdownTask,
  RetrievedTorExample,
  TorDocumentRecord,
  TorTemplateProfile,
} from "@/lib/types";

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

type Workspace = "editor" | "tor-upload" | "tor-generate";

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
  const [workspace, setWorkspace] = useState<Workspace>("editor");

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
            <button
              className={workspace === "editor" ? "action-button border-cyan-500 text-cyan-700 dark:text-cyan-200" : "action-button"}
              onClick={() => setWorkspace("editor")}
              type="button"
            >
              <FileText size={16} />
              Editor
            </button>
            <button
              className={
                workspace === "tor-upload" ? "action-button border-cyan-500 text-cyan-700 dark:text-cyan-200" : "action-button"
              }
              onClick={() => setWorkspace("tor-upload")}
              type="button"
            >
              <Upload size={16} />
              TOR Upload
            </button>
            <button
              className={
                workspace === "tor-generate"
                  ? "action-button border-cyan-500 text-cyan-700 dark:text-cyan-200"
                  : "action-button"
              }
              onClick={() => setWorkspace("tor-generate")}
              type="button"
            >
              <Building2 size={16} />
              Generate TOR
            </button>
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

      {workspace === "editor" ? (
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
      ) : (
        <TorWorkspace
          activeWorkspace={workspace}
          onOpenInEditor={(nextTitle, nextMarkdown) => {
            setTitle(nextTitle);
            setMarkdown(nextMarkdown);
            setActiveId(null);
            setWorkspace("editor");
            setStatus("Generated TOR ready");
          }}
        />
      )}
    </main>
  );
}

function TorWorkspace({
  activeWorkspace,
  onOpenInEditor,
}: {
  activeWorkspace: Workspace;
  onOpenInEditor: (title: string, markdown: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [documentCategory, setDocumentCategory] = useState("TOR");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<TorDocumentRecord[]>([]);
  const [profile, setProfile] = useState<TorTemplateProfile | null>(null);
  const [examples, setExamples] = useState<RetrievedTorExample[]>([]);
  const [generatedTor, setGeneratedTor] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("");
  const [requirements, setRequirements] = useState("");
  const [language, setLanguage] = useState<"th" | "en" | "th/en">("th");

  const activeCompany = (newCompanyName || selectedCompany).trim();

  const refreshCompanies = useCallback(async () => {
    try {
      const records = await listTorCompanies();
      setCompanies(records);
      if (!selectedCompany && records[0]) {
        setSelectedCompany(records[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load companies.");
    }
  }, [selectedCompany]);

  const refreshCompanyData = useCallback(async (companyName: string) => {
    if (!companyName) {
      setDocuments([]);
      setProfile(null);
      return;
    }

    try {
      const [nextDocuments, nextProfile] = await Promise.all([
        listTorDocuments(companyName),
        getTorTemplateProfile(companyName).catch(() => null),
      ]);
      setDocuments(nextDocuments);
      setProfile(nextProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load TOR data.");
    }
  }, []);

  useEffect(() => {
    void refreshCompanies();
  }, [refreshCompanies]);

  useEffect(() => {
    void refreshCompanyData(selectedCompany);
  }, [refreshCompanyData, selectedCompany]);

  async function handleUpload() {
    setError(null);
    if (!activeCompany) {
      setError("Select or create a company before upload.");
      return;
    }
    if (!selectedFile) {
      setError("Choose a TOR file to upload.");
      return;
    }

    setIsLoading(true);
    setMessage("Uploading and learning template");
    try {
      const uploaded = await uploadTorDocument({
        companyName: activeCompany,
        documentCategory,
        file: selectedFile,
      });
      setSelectedCompany(uploaded.company_name);
      setNewCompanyName("");
      setSelectedFile(null);
      await refreshCompanies();
      await refreshCompanyData(uploaded.company_name);
      setMessage("Template updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setMessage("Error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerateTor() {
    setError(null);
    if (!selectedCompany) {
      setError("Select a company profile before generating.");
      return;
    }
    if (!projectTitle.trim()) {
      setError("Project title is required.");
      return;
    }

    setIsLoading(true);
    setMessage("Generating TOR");
    setGeneratedTor("");
    setExamples([]);
    try {
      const result = await generateTor({
        company_name: selectedCompany,
        project_title: projectTitle,
        project_description: projectDescription || undefined,
        budget: budget || undefined,
        duration: duration || undefined,
        requirements: requirements || undefined,
        language,
      });
      setGeneratedTor(result.generated_tor);
      setProfile(result.used_template_profile);
      setExamples(result.retrieved_examples);
      setMessage("Generated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setMessage("Error");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyGeneratedTor() {
    await navigator.clipboard.writeText(generatedTor);
    setMessage("Copied");
  }

  function downloadGeneratedTor() {
    const blob = new Blob([generatedTor], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filenameFromTitle(projectTitle || "generated-tor", "md");
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-4 py-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Companies
          </h2>
          <button className="icon-button-small" onClick={refreshCompanies} title="Refresh companies" type="button">
            <Loader2 size={15} />
          </button>
        </div>

        <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="tor-company">
          Company
        </label>
        <select
          className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          id="tor-company"
          onChange={(event) => {
            setSelectedCompany(event.target.value);
            setNewCompanyName("");
            setError(null);
          }}
          value={selectedCompany}
        >
          <option value="">Select company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.name}>
              {company.name}
            </option>
          ))}
        </select>

        <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="tor-new-company">
          New company
        </label>
        <input
          className="mb-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          id="tor-new-company"
          onChange={(event) => setNewCompanyName(event.target.value)}
          placeholder="Company name"
          value={newCompanyName}
        />

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 size={16} />
            Profile
          </div>
          {profile ? (
            <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                <span className="font-medium">Language:</span> {profile.language}
              </p>
              <p>
                <span className="font-medium">Tone:</span> {profile.tone}
              </p>
              <p>{profile.writing_style_summary}</p>
              <div className="max-h-56 overflow-auto rounded-md bg-white p-2 text-xs dark:bg-slate-900">
                <pre>{JSON.stringify(profile, null, 2)}</pre>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No template profile yet.</p>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{message}</p>
        {error ? (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </aside>

      {activeWorkspace === "tor-upload" ? (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Upload size={18} />
              TOR Upload
            </h2>
            <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="tor-category">
              Document category
            </label>
            <input
              className="mb-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              id="tor-category"
              onChange={(event) => setDocumentCategory(event.target.value)}
              value={documentCategory}
            />
            <label className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400" htmlFor="tor-file">
              File
            </label>
            <input
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="mb-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white dark:border-slate-700 dark:bg-slate-950"
              id="tor-file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <button className="action-button" disabled={isLoading} onClick={handleUpload} type="button">
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              Upload
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Files size={18} />
              Uploaded TOR
            </h2>
            <div className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No uploaded TOR files for this company.</p>
              ) : (
                documents.map((document) => (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950" key={document.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-medium">{document.file_name}</h3>
                      <span className="text-xs uppercase text-slate-500 dark:text-slate-400">{document.file_type}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {document.document_category} - {new Date(document.upload_date).toLocaleString()}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(document.extracted_sections.sections ?? []).slice(0, 8).map((section) => (
                        <span className="rounded-md bg-white px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300" key={`${document.id}-${section.order_index}`}>
                          {section.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Sparkles size={18} />
              Generate TOR
            </h2>
            <input
              className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder="Project title"
              value={projectTitle}
            />
            <textarea
              className="mb-3 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Project description"
              value={projectDescription}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                onChange={(event) => setBudget(event.target.value)}
                placeholder="Budget"
                value={budget}
              />
              <input
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                onChange={(event) => setDuration(event.target.value)}
                placeholder="Duration"
                value={duration}
              />
            </div>
            <textarea
              className="my-3 min-h-36 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setRequirements(event.target.value)}
              placeholder="Requirements"
              value={requirements}
            />
            <select
              className="mb-4 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
              onChange={(event) => setLanguage(event.target.value as "th" | "en" | "th/en")}
              value={language}
            >
              <option value="th">Thai</option>
              <option value="en">English</option>
              <option value="th/en">Thai / English</option>
            </select>
            <button className="action-button" disabled={isLoading} onClick={handleGenerateTor} type="button">
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Generate
            </button>

            {examples.length > 0 ? (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
                  Retrieved examples
                </h3>
                <div className="space-y-2">
                  {examples.map((example, index) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950" key={`${example.file_id}-${index}`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-medium">{example.section_name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{example.score.toFixed(2)}</span>
                      </div>
                      <p className="line-clamp-3 text-slate-600 dark:text-slate-300">{example.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-[calc(100vh-170px)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
              <h2 className="text-lg font-semibold">Generated TOR Preview</h2>
              <div className="flex flex-wrap gap-2">
                <button className="icon-button-small" disabled={!generatedTor} onClick={copyGeneratedTor} title="Copy Markdown" type="button">
                  <Clipboard size={15} />
                </button>
                <button className="icon-button-small" disabled={!generatedTor} onClick={downloadGeneratedTor} title="Download Markdown" type="button">
                  <Download size={15} />
                </button>
                <button
                  className="action-button"
                  disabled={!generatedTor}
                  onClick={() => onOpenInEditor(projectTitle || "Generated TOR", generatedTor)}
                  type="button"
                >
                  <FileText size={16} />
                  Open in editor
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-6">
              <ReactMarkdown className="markdown-preview" remarkPlugins={[remarkGfm]}>
                {generatedTor || "_Generated TOR will appear here._"}
              </ReactMarkdown>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
