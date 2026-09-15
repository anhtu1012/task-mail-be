import sanitizeHtml from 'sanitize-html';

/**
 * Tags the Quill editor on the frontend can produce. Anything outside this list
 * is stripped on write — task descriptions can originate from an ingested email,
 * i.e. HTML authored by a stranger, so the frontend's own filtering is not a
 * security boundary.
 */
const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a',
  'img',
  'iframe',
  'span',
  'div',
];

const QUILL_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    iframe: ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
    li: ['data-checked'],
    '*': ['class', 'style'],
  },
  // `data:` stays allowed on <img> only, for pasted screenshots.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedIframeHostnames: [
    'www.youtube.com',
    'youtube.com',
    'player.vimeo.com',
  ],
  // Only the Quill formatting classes survive, so pasted markup cannot
  // borrow the app's own styles.
  allowedClasses: { '*': [/^ql-/] },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
  disallowedTagsMode: 'discard',
};

export class RichTextUtil {
  /** Strips scripts, event handlers and `javascript:` URLs from Quill HTML. */
  static sanitize(html: string): string;
  static sanitize(html: string | null | undefined): string | null | undefined;
  static sanitize(html: string | null | undefined): string | null | undefined {
    if (html === null || html === undefined) return html;
    return sanitizeHtml(html, QUILL_OPTIONS);
  }

  /** Plain text with all markup removed — what full-text search should index. */
  static toPlainText(html: string | null | undefined): string {
    if (!html) return '';
    return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Quill persists an empty editor as `<p><br></p>`, so a plain null check
   * would mark every card as having a description.
   */
  static isEmpty(html: string | null | undefined): boolean {
    if (!html) return true;
    if (/<img|<iframe/i.test(html)) return false;
    return this.toPlainText(html).length === 0;
  }
}
