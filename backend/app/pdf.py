from html import escape

import markdown
from weasyprint import HTML


PDF_CSS = """
@page { margin: 24mm 18mm; }
body {
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11pt;
  line-height: 1.55;
}
h1, h2, h3 { color: #0f172a; line-height: 1.2; margin-top: 1.4em; }
h1 { font-size: 26pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
h2 { font-size: 18pt; }
h3 { font-size: 14pt; }
code {
  background: #f3f4f6;
  border-radius: 4px;
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  padding: 1px 4px;
}
pre {
  background: #111827;
  border-radius: 8px;
  color: #f9fafb;
  overflow-wrap: break-word;
  padding: 14px;
  white-space: pre-wrap;
}
pre code { background: transparent; color: inherit; padding: 0; }
blockquote {
  border-left: 4px solid #38bdf8;
  color: #475569;
  margin-left: 0;
  padding-left: 14px;
}
table { border-collapse: collapse; margin: 18px 0; width: 100%; }
th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
th { background: #f8fafc; }
a { color: #0369a1; }
"""


def markdown_to_pdf(markdown_text: str, title: str) -> bytes:
    body = markdown.markdown(
        markdown_text,
        extensions=["extra", "fenced_code", "tables", "sane_lists", "toc"],
        output_format="html5",
    )
    html = f"""
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>{escape(title)}</title>
        <style>{PDF_CSS}</style>
      </head>
      <body>{body}</body>
    </html>
    """
    return HTML(string=html).write_pdf()
