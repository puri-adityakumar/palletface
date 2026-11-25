import { Brand } from './Brand'
import { GitHubLink } from './GitHubLink'
import { Link } from '../lib/router'

/** The slim header on sub pages: the lockup, then the same links as the landing nav. */
export function SubHead() {
  return (
    <header className="wrap subhead">
      <Brand home="/" />
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <GitHubLink />
        </li>
      </ul>
    </header>
  )
}
