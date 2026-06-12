export type GenerationMode = "markdown" | "readme" | "report";

export type MarkdownTask = "generate" | "improve" | "summarize";

export type DocumentRecord = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type DocumentPayload = {
  title: string;
  content: string;
};
