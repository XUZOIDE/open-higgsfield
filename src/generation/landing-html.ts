const FENCE = /```(?:html)?\s*([\s\S]*?)```/i;

export function extractStandaloneHtml(value: string): string {
  const fenced = FENCE.exec(value)?.[1]?.trim();
  const source = fenced || value.trim();
  const start = source.search(/<!doctype\s+html|<html[\s>]/i);
  const end = source.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) throw new Error("Gemini did not return a complete HTML document");
  return source.slice(start, end + "</html>".length).trim();
}

export function validateStandaloneHtml(html: string): string[] {
  const issues: string[] = [];
  if (!/^<!doctype\s+html/i.test(html)) issues.push("The document must start with <!doctype html>.");
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push("Add a responsive viewport meta tag.");
  if (!/<style[\s>]/i.test(html)) issues.push("Inline all CSS in a <style> element.");
  if (!/<script[\s>]/i.test(html)) issues.push("Inline the interaction JavaScript in a <script> element.");
  if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html)) {
    issues.push("External scripts and stylesheets are forbidden; the file must be standalone.");
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/i.test(html)) {
    issues.push("Network calls are forbidden in the standalone result.");
  }
  if (/\{\{[A-Z0-9_]+\}\}/.test(html.replace("{{MOTION_VIDEO_DATA_URI}}", ""))) {
    issues.push("Remove unresolved template placeholders.");
  }
  if (Buffer.byteLength(html, "utf8") > 2 * 1024 * 1024) {
    issues.push("Keep generated source below 2 MB before embedding media.");
  }
  return issues;
}

export function embedMotionVideo(html: string, mimeType: string, base64: string): string {
  const token = "{{MOTION_VIDEO_DATA_URI}}";
  if (!html.includes(token)) return html;
  return html.replaceAll(token, `data:${mimeType};base64,${base64}`);
}
