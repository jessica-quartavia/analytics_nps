import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeAttr } from '../../dashboard/js/utils/escape-html.js';

describe('escape-html', () => {
  it('escapa caracteres HTML perigosos', () => {
    assert.equal(escapeHtml('<script>"\'&</script>'), '&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;');
  });

  it('trata null e undefined como string vazia', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  it('escapeAttr delega ao escapeHtml', () => {
    assert.equal(escapeAttr('a"b'), 'a&quot;b');
  });
});
