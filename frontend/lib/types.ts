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

export type CompanyRecord = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type TorDocumentRecord = {
  id: string;
  company_name: string;
  file_name: string;
  file_type: string;
  upload_date: string;
  document_category: string;
  raw_text: string;
  extracted_sections: {
    sections?: Array<{
      name: string;
      normalized_name: string;
      order_index: number;
      content: string;
    }>;
  };
  template_profile_id: string | null;
};

export type TorTemplateProfile = {
  id: string;
  company_name: string;
  common_section_order: string[];
  preferred_section_titles: Record<string, string>;
  writing_style_summary: string;
  common_phrases: string[];
  terminology_preferences: Record<string, unknown>;
  required_tables: string[];
  common_deliverable_format: string;
  evaluation_style: string;
  tone: string;
  language: string;
  examples_from_uploaded_tor: Array<Record<string, unknown>>;
  created_at: string;
  updated_at: string;
};

export type TorGeneratePayload = {
  company_name: string;
  project_title: string;
  project_description?: string;
  budget?: string;
  duration?: string;
  requirements?: string;
  language: "th" | "en" | "th/en";
};

export type RetrievedTorExample = {
  section_name: string;
  file_id?: string | null;
  document_category?: string | null;
  content: string;
  score: number;
};

export type TorGenerateResponse = {
  generated_tor: string;
  used_template_profile: TorTemplateProfile;
  retrieved_examples: RetrievedTorExample[];
};
