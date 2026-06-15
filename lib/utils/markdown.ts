// Simple, robust regex-based Markdown-to-HTML parser for React dangerouslySetInnerHTML.
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";

  let html = md;

  // 2. Code blocks (```lang ... ```)
  html = html.replace(
    /```(?:\w+)?\n([\s\S]+?)\n```/g,
    (_, code) => `<pre class="bg-secondary/60 p-3 rounded-lg overflow-x-auto text-xs my-3 font-mono border text-foreground/90"><code>${code}</code></pre>`
  );

  // 3. Inline code (`code`)
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="bg-muted px-1.5 py-0.5 rounded text-xs font-mono border text-foreground/95">$1</code>'
  );

  // 4. Headers (# Header)
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-3 mb-2">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
  html = html.replace(/^#### (.*$)/gim, '<h4 class="text-sm font-semibold mt-2 mb-1">$1</h4>');

  // 5. Bold (**text**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 6. Italic (*text*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // 6.5 Images (![alt](url))
  html = html.replace(
    /!\[([^\]\n]*)\]\(([^)\n]+)\)/g,
    '<img src="$2" alt="$1" class="rounded-lg max-w-full my-4 border shadow-sm" />'
  );

  // 7. Links ([text](url))
  html = html.replace(
    /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80">$1</a>'
  );

  // 8. Unordered Lists (- item or * item)
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-sm text-foreground/80 my-1">$1</li>');

  // 9. Process line breaks and paragraphs
  const lines = html.split("\n");
  let inList = false;
  const processedLines = lines.map((line) => {
    const trimmed = line.trim();
    const isLi = trimmed.startsWith("<li");

    if (isLi) {
      if (!inList) {
        inList = true;
        return `<ul class="space-y-1 my-3">\n${line}`;
      }
      return line;
    } else {
      if (inList) {
        inList = false;
        return `</ul>\n<p class="my-2 text-sm leading-relaxed text-foreground/90">${line}</p>`;
      }
    }

    // Don't wrap tags like headers, list blocks, code blocks in double paragraphs
    if (
      !trimmed ||
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<pre") ||
      trimmed.startsWith("<code") ||
      trimmed.startsWith("</pre") ||
      trimmed.startsWith("</ul")
    ) {
      return line;
    }

    return `<p class="my-2 text-sm leading-relaxed text-foreground/90">${line}</p>`;
  });

  if (inList) {
    processedLines.push("</ul>");
  }

  return processedLines.join("\n");
}
