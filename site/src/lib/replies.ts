import akramcodez from '../assets/people/akramcodez.jpg'
import athrixCodes from '../assets/people/athrix_codes.jpg'
import bydhruvil from '../assets/people/bydhruvil.jpg'
import capsraunak from '../assets/people/capsraunak.jpg'
import imsethidev from '../assets/people/imsethidev.jpg'
import manixh02 from '../assets/people/Manixh02.jpg'
import shreytwts from '../assets/people/shreytwts.jpg'
import udayempire from '../assets/people/udayempire_.jpg'

/** A reply to the launch post on X. `photo` is a copy of the person's X profile photo. */
export type Reply = { handle: string; name: string; id: string; date: string; text: string; photo: string }

export const LAUNCH_POST = 'https://x.com/adityawaslost/status/2125921921598697969'

/** Replies word for word, with the leading @mentions removed. */
export const REPLIES: readonly Reply[] = [
  { handle: 'shreytwts', name: 'shrey', id: '2125924396649050203', date: 'Nov 26, 2026', text: "This is so awesome. I'm going to use it!!!!!!\nLove dither, and pixel art.", photo: shreytwts },
  { handle: 'imsethidev', name: 'Dev Sethi', id: '2125923570052378782', date: 'Nov 26, 2026', text: 'Bookmarked, definitely using for projects', photo: imsethidev },
  { handle: 'athrix_codes', name: 'Athrix', id: '2125938196718743778', date: 'Nov 26, 2026', text: 'Awesome nice bro!\nwill use this in next project 👀', photo: athrixCodes },
  { handle: 'Manixh02', name: 'Manish Kumar', id: '2125922971302985903', date: 'Nov 26, 2026', text: 'let me use it into my datasite', photo: manixh02 },
  { handle: 'udayempire_', name: 'UE', id: '2125941031107711404', date: 'Nov 26, 2026', text: 'Its freee soo gonna use it', photo: udayempire },
  { handle: 'capsraunak', name: 'Raunak', id: '2125975958100554184', date: 'Nov 26, 2026', text: "Actually awesome tbh , I'm gonna use this", photo: capsraunak },
  { handle: 'akramcodez', name: 'Sk Akram', id: '2125981118440833433', date: 'Nov 26, 2026', text: 'Thanks a lot for making this', photo: akramcodez },
  { handle: 'bydhruvil', name: 'dhru', id: '2125927937086300537', date: 'Nov 26, 2026', text: "insane stuff only man, palletism for the winn!!\ncan't wait to try it outt!", photo: bydhruvil },
]

export const replyUrl = (r: Reply) => `https://x.com/${r.handle}/status/${r.id}`
