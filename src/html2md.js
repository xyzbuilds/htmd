// Turndown wrapper for HTML → Markdown conversion.
import TurndownService from 'turndown';

let _service = null;
function service() {
  if (_service) return _service;
  _service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**'
  });
  // Strip script/style entirely
  _service.remove(['script', 'style']);
  return _service;
}

export function htmlToMd(html) {
  if (html == null) return '';
  return service().turndown(String(html));
}
