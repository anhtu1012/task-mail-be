import { RichTextUtil } from './rich-text.util';

describe('RichTextUtil', () => {
  describe('sanitize', () => {
    // Task descriptions can be generated from an ingested email, i.e. HTML
    // written by a stranger — the frontend's filtering is not a boundary.
    it('strips scripts and inline event handlers', () => {
      const dirty =
        '<p>Xin chào<script>alert(1)</script></p><img src=x onerror="alert(1)">';
      const clean = RichTextUtil.sanitize(dirty);

      expect(clean).not.toContain('script');
      expect(clean).not.toContain('onerror');
      expect(clean).toContain('Xin chào');
    });

    it('drops javascript: links but keeps ordinary ones', () => {
      expect(
        RichTextUtil.sanitize('<a href="javascript:alert(1)">x</a>'),
      ).not.toContain('javascript:');
      expect(RichTextUtil.sanitize('<a href="https://a.vn">x</a>')).toContain(
        'https://a.vn',
      );
    });

    it('keeps the Quill formatting it is supposed to keep', () => {
      const html =
        '<h2>Tiêu đề</h2><p><strong>đậm</strong> <em>nghiêng</em></p>' +
        '<ul><li data-checked="true">xong</li></ul>' +
        '<pre class="ql-syntax">code</pre>';
      const clean = RichTextUtil.sanitize(html);

      expect(clean).toContain('<h2>');
      expect(clean).toContain('<strong>');
      expect(clean).toContain('data-checked="true"');
      expect(clean).toContain('ql-syntax');
    });

    it('keeps pasted screenshots (data: URIs on images)', () => {
      const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';
      expect(RichTextUtil.sanitize(html)).toContain('data:image/png');
    });

    it('passes null and undefined straight through', () => {
      expect(RichTextUtil.sanitize(null)).toBeNull();
      expect(RichTextUtil.sanitize(undefined)).toBeUndefined();
    });
  });

  describe('isEmpty', () => {
    // Quill saves an untouched editor as `<p><br></p>`; a plain null check
    // would mark every single card as having a description.
    it.each(['', '<p><br></p>', '<p>  </p>', '<p>&nbsp;</p>', null, undefined])(
      'treats %p as empty',
      (value) => {
        expect(RichTextUtil.isEmpty(value)).toBe(true);
      },
    );

    it('treats real content as non-empty', () => {
      expect(RichTextUtil.isEmpty('<p>Báo giá</p>')).toBe(false);
    });

    it('counts an image-only description as content', () => {
      expect(
        RichTextUtil.isEmpty('<p><img src="https://a.vn/x.png"></p>'),
      ).toBe(false);
    });
  });

  it('indexes plain text, not tag names', () => {
    expect(RichTextUtil.toPlainText('<p><strong>Báo giá</strong></p>')).toBe(
      'Báo giá',
    );
  });
});
