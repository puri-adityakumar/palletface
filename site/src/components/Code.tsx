const TOKENS = /('(?:[^'\\]|\\.)*'|`.*`|\b(?:import|from|const)\b|\b\d+\b)/g

function Line({ text }: { text: string }) {
  const parts = text.split(TOKENS)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 0 ? (
          part
        ) : (
          <span key={i} className={part.startsWith("'") || part.startsWith('`') ? 'tok-str' : /^\d/.test(part) ? 'tok-num' : 'tok-kw'}>
            {part}
          </span>
        ),
      )}
    </>
  )
}

/** JavaScript on ink, with keywords, strings, and numbers tinted. */
export function Code({ code }: { code: string }) {
  return (
    <pre className="code">
      <code>
        {code.split('\n').map((line, i) => (
          <span key={i} className="code__line">
            <Line text={line || ' '} />
          </span>
        ))}
      </code>
    </pre>
  )
}
