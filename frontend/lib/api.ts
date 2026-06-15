import type {
  CompanyRecord,
  DocumentPayload,
  DocumentRecord,
  GenerationMode,
  MarkdownTask,
  TorDocumentRecord,
  TorGeneratePayload,
  TorGenerateResponse,
  TorTemplateProfile,
} from "@/lib/types";

type TaskOptions = {
  prompt: string;
  content: string;
  mode: GenerationMode;
  onChunk: (chunk: string) => void;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<T>;
}

async function readError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const data = await response.json();
    return typeof data.detail === "string" ? data.detail : fallback;
  } catch {
    return fallback;
  }
}

export async function postMarkdownTask(task: MarkdownTask, options: TaskOptions) {
  const path = `/api/${task}`;
  const body =
    task === "generate"
      ? {
          prompt: options.prompt || "Generate a Markdown document.",
          content: options.content,
          mode: options.mode,
          stream: true,
        }
      : { prompt: options.prompt || undefined, content: options.content, stream: true };

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (!response.body) {
    const data = (await response.json()) as { markdown: string };
    options.onChunk(data.markdown);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    options.onChunk(decoder.decode(value, { stream: true }));
  }

  const remaining = decoder.decode();
  if (remaining) {
    options.onChunk(remaining);
  }
}

export function listDocuments() {
  return request<DocumentRecord[]>("/api/documents");
}

export function createDocument(payload: DocumentPayload) {
  return request<DocumentRecord>("/api/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDocument(id: string, payload: DocumentPayload) {
  return request<DocumentRecord>(`/api/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteDocument(id: string) {
  const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function exportPdf(payload: { title: string; markdown: string }) {
  const response = await fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.blob();
}

export function listTorCompanies() {
  return request<CompanyRecord[]>("/api/tor/companies");
}

export function listTorDocuments(companyName?: string) {
  const params = companyName ? `?company_name=${encodeURIComponent(companyName)}` : "";
  return request<TorDocumentRecord[]>(`/api/tor/documents${params}`);
}

export function getTorTemplateProfile(companyName: string) {
  return request<TorTemplateProfile>(`/api/tor/profiles/${encodeURIComponent(companyName)}`);
}

export async function uploadTorDocument(payload: {
  companyName: string;
  documentCategory: string;
  file: File;
}) {
  const form = new FormData();
  form.append("company_name", payload.companyName);
  form.append("document_category", payload.documentCategory);
  form.append("file", payload.file);

  const response = await fetch("/api/tor/upload", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response.json() as Promise<TorDocumentRecord>;
}

export function generateTor(payload: TorGeneratePayload) {
  return request<TorGenerateResponse>("/api/tor/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
