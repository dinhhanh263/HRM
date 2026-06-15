import { describe, it, expect } from 'vitest';
import { parseGuidelineContent } from './guideline-content';

// SPEC-032 §2b: ≥2 dòng liên tiếp chứa ' | ' = bảng (dòng đầu là header);
// 1 dòng đơn lẻ có ' | ' vẫn là đoạn văn (tránh bảng vô tình).

describe('parseGuidelineContent', () => {
  it('returns a single paragraph block for plain text with line breaks', () => {
    const blocks = parseGuidelineContent('Dòng 1\nDòng 2');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Dòng 1\nDòng 2' }]);
  });

  it('parses consecutive pipe lines into a table with header and rows', () => {
    const blocks = parseGuidelineContent(
      'Mức | Định nghĩa | Biểu hiện\nLevel 1 | Học việc | Cần kèm cặp\nLevel 2 | Làm được | Thi thoảng cần hỗ trợ'
    );
    expect(blocks).toEqual([
      {
        type: 'table',
        header: ['Mức', 'Định nghĩa', 'Biểu hiện'],
        rows: [
          ['Level 1', 'Học việc', 'Cần kèm cặp'],
          ['Level 2', 'Làm được', 'Thi thoảng cần hỗ trợ'],
        ],
      },
    ]);
  });

  it('mixes paragraphs and tables in document order', () => {
    const blocks = parseGuidelineContent(
      'Giới thiệu.\n\nMức | Ý nghĩa\n1 | Thấp\n5 | Cao\n\nKết luận.'
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(blocks[1]).toMatchObject({ header: ['Mức', 'Ý nghĩa'], rows: [['1', 'Thấp'], ['5', 'Cao']] });
  });

  it('keeps a single isolated pipe line as a paragraph (no accidental table)', () => {
    const blocks = parseGuidelineContent('Chọn Đạt | Vượt | Chưa đạt cho từng mục.\nDòng thường.');
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Chọn Đạt | Vượt | Chưa đạt cho từng mục.\nDòng thường.' },
    ]);
  });

  it('pads short rows so every row matches the header length', () => {
    const blocks = parseGuidelineContent('A | B | C\nx | y');
    expect(blocks[0]).toMatchObject({ type: 'table', rows: [['x', 'y', '']] });
  });

  it('returns no blocks for empty content', () => {
    expect(parseGuidelineContent('')).toEqual([]);
  });
});
