import { Brand } from './Brand'
import { Link } from '../lib/router'

/** The slim header on sub pages: the lockup, then a way back to the field. */
export function SubHead() {
  return (
    <header className="wrap subhead">
      <Brand home="/" />
      <Link to="/" className="subhead__back">
        ← Back to the field
      </Link>
    </header>
  )
}
