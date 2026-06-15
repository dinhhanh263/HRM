// SPEC-032 §2b — Nội dung guideline là text thuần, nhưng ≥2 dòng liên tiếp chứa
// ' | ' được hiểu là bảng (dòng đầu = header). Một dòng đơn lẻ có ' | ' vẫn là
// đoạn văn để câu chữ thường không vô tình thành bảng.

const CELL_SEPARATOR = ' | ';

export type GuidelineBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] };

export function parseGuidelineContent(content: string): GuidelineBlock[] {
  if (!content) return [];

  const lines = content.split('\n');
  const blocks: GuidelineBlock[] = [];
  let paragraph: string[] = [];
  let tableLines: string[] = [];

  function flushParagraph() {
    // Cắt dòng trống ở hai đầu nhưng giữ dòng trống ở giữa đoạn.
    while (paragraph.length && paragraph[0].trim() === '') paragraph.shift();
    while (paragraph.length && paragraph[paragraph.length - 1].trim() === '') paragraph.pop();
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
    }
    paragraph = [];
  }

  function flushTable() {
    if (tableLines.length === 1) {
      // Dòng pipe đơn lẻ không phải bảng — trả về làm đoạn văn.
      paragraph.push(tableLines[0]);
    } else if (tableLines.length > 1) {
      flushParagraph();
      const cells = tableLines.map((line) => line.split(CELL_SEPARATOR).map((c) => c.trim()));
      const header = cells[0];
      const rows = cells.slice(1).map((row) => {
        const padded = [...row];
        while (padded.length < header.length) padded.push('');
        return padded;
      });
      blocks.push({ type: 'table', header, rows });
    }
    tableLines = [];
  }

  for (const line of lines) {
    if (line.includes(CELL_SEPARATOR)) {
      tableLines.push(line);
    } else {
      flushTable();
      paragraph.push(line);
    }
  }
  flushTable();
  flushParagraph();

  return blocks;
}
