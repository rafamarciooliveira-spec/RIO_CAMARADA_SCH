/**
 * Rich text helpers and markdown-to-clean-HTML converter.
 * Eliminates ugly markdown asterisks (e.g. **bold**, *italic*) and produces semantic HTML.
 */

export function markdownToHtml(md: string): string {
  if (!md) return '';

  // If it already looks like HTML (contains <p> or <div> or <h3>), return it sanitized
  if (md.includes('<p>') || md.includes('<h3>') || md.includes('<div>') || md.includes('<strong>')) {
    return md;
  }

  let html = md;

  // Normalize line endings
  html = html.replace(/\r\n/g, '\n');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-emerald-400 mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-extrabold text-white mt-5 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-white mt-6 mb-3">$1</h1>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-4 border-emerald-500 pl-4 py-1 italic my-3 text-zinc-300 bg-zinc-900/60 rounded-r-xl">$1</blockquote>');

  // Bold (**text**)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Italic (*text*)
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-zinc-200">$1</em>');

  // Horizontal rules
  html = html.replace(/^---$/gim, '<hr class="border-zinc-800 my-4" />');

  // Lists (numbered and unordered)
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inUl = false;
  let inOl = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inUl) {
        processedLines.push('<ul class="list-disc list-inside space-y-1.5 my-3 pl-2 text-zinc-300">');
        inUl = true;
      }
      processedLines.push(`<li>${trimmed.substring(2)}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (!inOl) {
        processedLines.push('<ol class="list-decimal list-inside space-y-1.5 my-3 pl-2 text-zinc-300">');
        inOl = true;
      }
      const itemContent = trimmed.replace(/^\d+\.\s/, '');
      processedLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }

      if (trimmed.length > 0 && !trimmed.startsWith('<h') && !trimmed.startsWith('<blockquote') && !trimmed.startsWith('<hr')) {
        processedLines.push(`<p class="mb-3 leading-relaxed text-zinc-300">${trimmed}</p>`);
      } else {
        processedLines.push(trimmed);
      }
    }
  }

  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');

  return processedLines.join('\n');
}

// Strip asterisks if any remain
export function cleanAsterisks(text: string): string {
  if (!text) return '';
  return text.replace(/\*\*/g, '').replace(/\*/g, '');
}
