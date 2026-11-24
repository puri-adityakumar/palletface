export type Sprite = readonly string[]

export const TUFTS: readonly Sprite[] = [
  ['.h..', '.g.h', 'sggs'],
  ['...h.', '.h.g.', '.g.gg', 'sgggs'],
  ['..h....', '..g..h.', 'h.gg.g.', '.ggggg.', '.sgggs.'],
  ['....h..', '.h..g..', '.g.hgg.', 'hggggg.', '.gggggs', '.sssss.'],
  ['.h......', '.g...h..', '.gg..g.h', '..g.hgg.', '..ggggg.', '..sgggs.'],
]

export const FLOWERS: readonly Sprite[] = [
  ['..p..', '.ppp.', 'ppcpp', '.ppp.', '..g..', '..g.h', '.hgg.', '..gs.'],
  ['.pp..', 'ppcp.', '.pps.', '..g..', '..g.h', '.hgg.', '..gs.'],
  ['.pp.', 'ppcp', '.ss.', '..g.', 'hgg.', '..gs'],
  ['..gg.', '.gbb.', 'g.bB.', 'g....', 'gbb..', 'g.bB.', 'gg.h.', '.ggs.'],
  ['.pp.', 'pcpp', '.sp.', '..g.', '..gh', '.ggs'],
]

export const STONES: readonly Sprite[] = [
  ['..hh..', '.hmmms', 'hmmsss', '.ssss.'],
  ['.hhh.', 'hmmms', '.sss.'],
]

export const MUSHROOMS: readonly Sprite[] = [
  ['..rr..', '.rhrh.', 'rrrrrs', '.ssss.', '..tt..', '..ts..'],
  ['.rr.', 'rhrs', 'ssss', '.tt.', '.ts.'],
]

export const ROUND_TREE: Sprite = [
  '...hh....',
  '..hhmm...',
  '.hhmmmm..',
  'hhmmmmms.',
  'hmmmmmmss',
  '.mmmmmss.',
  '..sssss..',
  '....s....',
  '....s....',
]

export const PINE_TREE: Sprite = [
  '...h...',
  '..hm...',
  '..hms..',
  '.hmmms.',
  '..mms..',
  '.hmmms.',
  'hmmmmss',
  '.mmmss.',
  'hmmmmss',
  '..sss..',
  '...s...',
]

export const CLOUDS: readonly Sprite[] = [
  [
    '........................hhhhhhhh.................................',
    '......................hhhhhhhhhhhh...............................',
    '.....................hhhhhhhhhhhhhh..............................',
    '...........hhhhhh...hhhhhhhhhhhhhhhhh.............................',
    '.........hhhhhhhhh.hhhhhhhhhhhhhhhhhh.............................',
    '........hhhhhhhhhhhhhhhhhhhhhhhhhhhhh....hhhhhh...................',
    '.......hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.hhhhhhhhh..................',
    '......hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.................',
    '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh................',
    '..hhhhhhhhhhhhhhhhhhhhhhbbbbbbbbhhhhhhhhhhhhhhhhhhh...............',
    '.hhhhhhhbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbhhhhhhhhhhhhhhh............',
    'hhhhbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbhhh..........',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb........',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb......',
    '.....ssssssssssbbbbbbbbbbbbbbbbbbbbbbbbbsssssssssssssssss.........',
    '...........ssssssssssssssssssssssssssssssssss....................',
  ],
  [
    '................hhhhhhhh................................',
    '..............hhhhhhhhhhhh..............................',
    '.............hhhhhhhhhhhhhh......hhhhhh.................',
    '.......hhhh.hhhhhhhhhhhhhhhh...hhhhhhhhh................',
    '.....hhhhhhhhhhhhhhhhhhhhhhhh.hhhhhhhhhhh...............',
    '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh..............',
    '..hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.............',
    'hhhhhhhhhhhhhhbbbbbbbbbbbbbbbbbbbbhhhhhhhhhhhh...........',
    '..bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbhhh......',
    '....bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb......',
    '.......ssssssssssssbbbbbbbbbbbbbbbbbbbssssssss..........',
    '..............ssssssssssssssssssssssss..................',
  ],
  [
    '.............hhhhhhhh........................',
    '.........hhhhhhhhhhhhhh....hhhh..............',
    '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh..........',
    'hhhhbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbhh......',
    '....bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb...',
    '.........ssssssssssssssssssssss.............',
  ],
]

export const MOON: Sprite = [
  '......hhhhhh......',
  '....hhhhhhhhhh....',
  '...hhhhhhhhhhhh...',
  '..hhhhhhbbhhhhhh..',
  '.hhhhhhbcbhhhhhhh.',
  '.hhhhhhhbbhhhhhhb.',
  'hhhhhhhhhhhhhhhbb.',
  'hhbbhhhhhhhhhhhbbb',
  'hbcbhhhhhhhhhhbbb',
  'hhbbhhhhbbhhhbbbb',
  '.hhhhhhbcbhhbbbb.',
  '.hhhhhhhbbhbbbbb.',
  '..hhhhhhhbbbbbb..',
  '...hhhhbbbbbbb...',
  '....bbbbbbbbbb...',
  '......bbbbbb.....',
]

export const PERSON_HEAD: Sprite = [
  '.....eeeeee......',
  '...ehhhhhhhe.....',
  '..ehhllllhhhe....',
  '.ehhlllmmhhhhe...',
  '.ehhmmmmmmhhhe...',
  'ehhmmmmmmmhhhee..',
  'ehmmmmmmmmheffg..',
  '.emmmmmmmhefffg..',
  '.emmmmmmheffffg..',
  '..emmmmmeffkffgg.',
  '...emmmeffffffg..',
  '....eeeaffffgg...',
  '......aafffg.....',
  '......aafgg......',
  '.....aafgg.......',
]

export const PERSON_SWEATER: Sprite = [
  '........ssss.................',
  '......srrrrrs................',
  '....srhhrrrrrrs..............',
  '...srhhhrrrrrrrs.............',
  '..srhhhrrrrrrrrrs............',
  '.srhhhrrrrrrrrrrss...........',
  '.srhhrrrrrrrrrrrss...........',
  'srhhhrrrrrrrss...............',
  'srhhrrrrrrrss................',
  'srhhrrrrrrss.................',
  'srhrrrrrrrss.................',
  'srhrrrrrrrss.................',
  'srhrrrrrrrss.................',
  '.srrrrrrrss..................',
  '.srrrrrrrss..................',
  '..srrrrrrss..................',
  '..sssssssss..................',
]

export const PERSON_ARM: Sprite = [
  'ss...............',
  'srrss............',
  '.srrrrss.....sss.',
  '..srrrrss...shhhs',
  '...srrrrss.srhhs.',
  '....srrrrssrhhs..',
  '.....srrrrrrrs...',
  '......srrrrrs....',
  '.......srrrs.....',
  '........sss......',
]

export const PERSON_LEGS: Sprite = [
  'ssssssssssssssss.............',
  'shhhhhmmmmmmmmmss............',
  '.shhmmmmmmmmmmmmss...........',
  '..smmmmssssmmmmmmss..........',
  '...ssssssssssssmmms..........',
  '...............shmms.........',
  '................shms.........',
  '................shms.........',
  '................shmss........',
  '.................shms........',
  '.................shms........',
  '.................smms........',
  '.................smms........',
  '.................sssss.......',
  '.................seeeess.....',
  '.................eeeeeees....',
  '.................ssssssss....',
]

export const CHAIR_BACK: Sprite = [
  'hhsss............',
  'hmmhss...........',
  '.hmmhss..........',
  '.hmmmhss.........',
  '..hmmmhss........',
  '..hmmmmhss.......',
  '...hmmmmhss......',
  '...hmmmmmhss.....',
  '....hmmmmmhss....',
  '....hmmmmmmhss...',
  '.....hmmmmmmhss..',
  '.....sssssssssss.',
]

export const TABLE: Sprite = [
  '..hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh.',
  '.hmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmh.',
  'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmms',
  'ssssssssssssssssssssssssssssssssssssssss',
  '...ss.............................hms...',
  '...ss.............................hms...',
  '...ss.............................hms...',
  '...ss.............................hms...',
  '...ss.............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '..ss..............................hms...',
  '.ss...............................hms...',
  '.ss...............................hms...',
  '.ss...............................hms...',
  '.ss...............................hms...',
  '.ss...............................hms...',
  '.ss...............................sss...',
]

export const CRT_SIDE: Sprite = [
  'hhhs.........',
  'hmmmhs.......',
  'hmmmmhs......',
  'hmmmmmhs.....',
  'hmmmmmmhs....',
  'hmmmmmmmhs...',
  'hmmmmmmmmhs..',
  'hmmssmmmmms..',
  'hmmmssmmmms..',
  'hmmssmmmmms..',
  'hmmmssmmmms..',
  'hmmssmmmmms..',
  'hmmmmmmmmms..',
  'hmmmmmmmmss..',
  'hmmmmmmmss...',
  'hmmmmmmss....',
  'hmmmmsss.....',
  'sssssss......',
]

export const CRT_FRONT: Sprite = [
  '.hhhhhhhhhhhhhhhhhh.',
  'hhhhhhhhhhhhhhhhhhhm',
  'hbbbbbbbbbbbbbbbbbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbcccccccccccccccbhm',
  'hbbbbbbbbbbbbbbbbbhm',
  'hmmmmmmmmmmmmmmmmmmm',
  'hmmmmmmmmmmmmmmmggmm',
  '.ssssssssssssssssss.',
]

export const KEYBOARD: Sprite = [
  '..hhhhhhhhhhhhhhh.',
  '.hmbmbmbmbmbmbbmh.',
  'hmmmmmmmmmmmmmmmh.',
  'ssssssssssssssssss',
]

export const CUP: Sprite = [
  '.ssss...',
  'hbbbbhs.',
  'hhmmms.s',
  'hhmmms.s',
  '.hmmms.s',
  '.ssssss.',
]
