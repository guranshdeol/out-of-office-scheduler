import { describe, expect, it } from 'vitest'
import { textToHtml } from '../src/main/message'

describe('textToHtml', () => {
  it('turns blank-line separated text into paragraphs and keeps single line breaks', () => {
    expect(textToHtml('Hi,\nI am away.\n\nThanks')).toBe('<html><body><p>Hi,<br>I am away.</p><p>Thanks</p></body></html>')
  })

  it('escapes HTML so the message is shown as typed', () => {
    expect(textToHtml('Contact <boss> & "team"')).toBe(
      '<html><body><p>Contact &lt;boss&gt; &amp; &quot;team&quot;</p></body></html>'
    )
  })

  it('normalises Windows line endings', () => {
    expect(textToHtml('a\r\n\r\nb')).toBe('<html><body><p>a</p><p>b</p></body></html>')
  })
})
