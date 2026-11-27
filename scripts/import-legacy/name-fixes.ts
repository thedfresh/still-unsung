/**
 * Full names for people the old data names by one word only (data grooming with the user,
 * 2026-11-27, HSA-173). The old site keeps credits as text, often with surnames only, and a few
 * musician records with one name. The import matches a surname to a full-name person only when
 * exactly one person has it; these are the names it cannot match (no such person yet, or several:
 * McDonald, Berry, Freiberg).
 *
 * Every entry was approved by the user. Keys are the old record IDs, so a fix never touches
 * another song or musician with the same word. Add entries here, never in the database:
 * until the content freeze each staging refresh rebuilds the data from the old site.
 */

/** Old song ID → (surname as written, lower case → full name). */
export const CREDIT_FULL_NAMES: ReadonlyMap<number, ReadonlyMap<string, string>> = new Map([
  // Alligator: words and music.
  [16, new Map([["pigpen", 'Ron "Pigpen" McKernan']])],
  // Mister Charlie: music.
  [414, new Map([["pigpen", 'Ron "Pigpen" McKernan']])],
  // Operator: words and music (credit text from CREDIT_TEXTS below).
  [918, new Map([["pigpen", 'Ron "Pigpen" McKernan']])],
  // Dark Star: music.
  [139, new Map([["mckernan", 'Ron "Pigpen" McKernan']])],
  // Down the Road: music.
  [171, new Map([["welnick", "Vince Welnick"], ["hidalgo", "David Hidalgo"]])],
  // Harp Tree Lament: music. Keeps today's choice; Dave and David Freiberg are on the merge list.
  [253, new Map([["freiberg", "David Freiberg"]])],
  // The Happy Wanderer: music (Moller) and words (Sigismund).
  [251, new Map([["moller", "Friedrich-Wilhelm Möller"], ["sigismund", "Florenz Friedrich Sigismund"]])],
  // Space Buggy (Asleep at the Wheel): words and music (HSA-188; Italian Wikipedia and Deezer).
  [727, new Map([["preston", "Leroy Preston"], ["haber", "James Haber"], ["gosfield", "Reuben Gosfield"]])],
  // Love (Country Joe & the Fish): words and music.
  [381, new Map([["mcdonald", "Country Joe McDonald"], ["cohen", "David Cohen"], ["barthol", "Bruce Barthol"], ["gunning", "John Gunning"], ["hirsch", 'Gary "Chicken" Hirsch']])],
  // The Pits of Thunder: music. "Anton" also matches Anton Delmore, so the import cannot choose.
  [471, new Map([["anton", "Greg Anton"]])],
  // Rock Around the Clock: words and music.
  [712, new Map([["freedman", "Max C. Freedman"], ["myers", "James E. Myers"]])],
  // Silver Threads and Golden Needles: words and music.
  [714, new Map([["reynolds", "Dick Reynolds"], ["rhodes", "Jack Rhodes"]])],
  // Big Wind: words and music.
  [742, new Map([["walker", "Wayne P. Walker"], ["zanetis", "Alex Zanetis"], ["mccormick", "George McCormick"]])],
  // River Deep Mountain High: words and music.
  [758, new Map([["spector", "Phil Spector"], ["greenwich", "Ellie Greenwich"]])],
  // Mojo Navigator (Country Joe & the Fish): words and music. The old text spells Denson
  // "Deonson" (HSA-188; track listings credit Denson, Melton, McDonald).
  [857, new Map([["mcdonald", "Country Joe McDonald"], ["deonson", "Ed Denson"]])],
  // UConn Husky (UConn Fight Song): words and music.
  [940, new Map([["france", "Herbert A. France"]])],
  // That's What Love Will Make You Do: words and music. Campbell is Little Milton.
  [995, new Map([["campbell", "Milton Campbell"], ["thigpen", "Henderson Thigpen"], ["banks", "James Banks"], ["marion", "Eddie Marion"]])],
  // Hang On Sloopy/Louie Louie: words and music.
  [1084, new Map([["farrell", "Wes Farrell"], ["berns", "Bert Berns"], ["berry", "Richard Berry"]])],
]);

/**
 * Full names in credit text that are another spelling of a person the archive already has
 * (user, 2026-11-27). Key: the name as normalized by `normalizeName`. Value: the person's name.
 */
export const SAME_PERSON: ReadonlyMap<string, string> = new Map([
  ["dave freiberg", "David Freiberg"],
  ["joe mcdonald", "Country Joe McDonald"],
]);

/** Old musician ID → full name, for musician records with one name. */
export const MUSICIAN_FULL_NAMES: ReadonlyMap<number, { name: string; firstName: string; lastName: string }> = new Map([
  // Sat in with the Dinosaurs at the Keystone, 1983-06-17.
  [91, { name: "John Sebastian", firstName: "John", lastName: "Sebastian" }],
]);

/** The full name for a surname-only credit name, or undefined. `legacyId` is "songs:<id>:<field>". */
export function creditFullName(legacyId: string, word: string): string | undefined {
  const songId = Number(/^songs:(\d+):/.exec(legacyId)?.[1]);
  return CREDIT_FULL_NAMES.get(songId)?.get(word);
}

/**
 * Credit text for songs the old site left uncredited, or credited in a way the import cannot use
 * ("Grateful Dead"), from the user's review (2026-11-27; checked against Whitegum). It replaces all
 * of the song's old credit fields, and is read exactly as old credit text would be.
 * Key: old song ID. Fields as in the old `songs` table.
 */
export const CREDIT_TEXTS: ReadonlyMap<number, Partial<Record<"song_by" | "lyrics_by" | "music_by", string>>> = new Map([
  // The Golden Road (To Unlimited Devotion): the first album credits the band's joint pseudonym.
  [238, { song_by: "McGannahan Skjellyfetti" }],
  // Rainbows in the Snow: a rare Hunter original (Whitegum RAINSNOW.HTM).
  [906, { song_by: "Robert Hunter" }],
  // Believe It or Not (Fortune or Fame): a Hunter original, not the later Hunter/Garcia song
  // (Whitegum BELIEVE2.HTM).
  [1080, { song_by: "Robert Hunter" }],
  // Mesa Linda: words Hunter, music Kevin Morgenstern (Whitegum MESALIND.HTM; user, 2026-11-27).
  [956, { lyrics_by: "Robert Hunter", music_by: "Kevin Morgenstern" }],
  // Covers, from Whitegum, checked on the web (user, 2026-11-27).
  [833, { song_by: "Bo Diddley" }], // Mona; Bo Diddley's legal name is Ellas McDaniel
  [891, { song_by: "Robert Johnson" }], // Judgment Day = If I Had Possession over Judgement Day
  [918, { song_by: "Pigpen" }], // Operator; quotes are not allowed in credit text, so the name list maps it
  [980, { song_by: "Traditional" }], // Black Jack Davey
  [984, { song_by: "Richie Furay" }], // Pickin' Up the Pieces
  [997, { song_by: "Peter Tosh" }], // Stop That Train
  [1012, { song_by: "Huddie Ledbetter, John Lomax" }], // Goodnight Irene, published 1936 as a joint composition
  [1044, { song_by: "Lloyd Price" }], // Lawdy Miss Clawdy
  [1109, { song_by: "Traditional" }], // Roving Gambler
  [1110, { song_by: "Traditional, arr. Merle Travis" }], // Nine Pound Hammer
  [1111, { song_by: "Traditional" }], // Salty Dog Blues; the Morris Brothers' claim is disputed
  [1112, { song_by: "Richard M. Sherman, Robert B. Sherman" }], // You're Sixteen
  [1120, { song_by: "Stephen Stills" }], // For What It's Worth
]);

/** Public notes for people the credits above make. Key: the person's name. */
export const PERSON_NOTES: ReadonlyMap<string, string> = new Map([
  ["McGannahan Skjellyfetti", "The Grateful Dead's collective pseudonym, used for songs credited to the whole band."],
]);

/**
 * Whitegum lyrics pages for performed songs the old site did not link (user, 2026-11-27, HSA-89).
 * Each matches the song's title, and Whitegum's writer credit agrees with the archive's.
 * Key: old song ID. Value: the page name under /songfile/. Added after the old site's own links.
 */
export const WHITEGUM_PAGES: ReadonlyMap<number, string> = new Map([
  [21, "AMAZINGG.HTM"], // Amazing Grace
  [42, "BANKSOFT.HTM"], // Banks Of The Ohio
  [46, "BATTLEOF.HTM"], // Battle Of New Orleans
  [47, "BEEDLEUM.HTM"], // Beedle Um Bum
  [78, "BORNTORU.HTM"], // Born To Run
  [82, "BOYSOFSU.HTM"], // The Boys Of Summer
  [86, "BUCKDANC.HTM"], // Buckdancer's Choice
  [88, "BURYMENE.HTM"], // Bury Me 'Neath The Willow Tree
  [103, "CHANGES.HTM"], // Changes
  [126, "CRUCIFIX.HTM"], // Crucifixion
  [137, "DANNYBOY.HTM"], // Danny Boy
  [147, "DEEPELEM.HTM"], // Deep Elem Blues
  [149, "DESOLATI.HTM"], // Desolation Row
  [169, "DOWNBYTH.HTM"], // Down By The Riverside
  [190, "ELEVEN.HTM"], // The Eleven
  [223, "FOX.HTM"], // The Fox
  [227, "FREIGHTT.HTM"], // Freight Train
  [231, "THERESA.HTM"], // Gallo Del Cielo
  [232, "GENTLEON.HTM"], // Gentle On My Mind
  [234, "GHOSTRID.HTM"], // Ghost Riders In The Sky
  [244, "GRANADA.HTM"], // Granada
  [245, "GRINNING.HTM"], // Grinnin' In Your Face
  [251, "HAPPYWAN.HTM"], // The Happy Wanderer
  [257, "HEARTGLA.HTM"], // Heart Of Glass
  [260, "HELP.HTM"], // Help!
  [279, "I1COMEFO.HTM"], // I Come For To Sing
  [292, "FOURLEAF.HTM"], // I'm Looking Over A Four Leaf Clover
  [297, "IKOIKO.HTM"], // Iko Iko
  [366, "LILYROSE.HTM"], // Lily, Rosemary And The Jack Of Hearts
  [386, "MACCRIMM.HTM"], // MacCrimmon's Lament
  [389, "MAKEMEAP.HTM"], // Make Me A Pallet On Your Floor
  [391, "MANOFCON.HTM"], // Man Of Constant Sorrow
  [421, "MURDERBA.HTM"], // Murder Ballads Medley
  [424, "MYCREOLE.HTM"], // My Creole Belle
  [454, "ONEWAYOU.HTM"], // One Way Out
  [463, "PASSINGT.HTM"], // Passing Through
  [466, "PEGGYO.HTM"], // Peggy-O
  [483, "RAILRDBL.HTM"], // Railroad Blues (Down To The Depot)
  [511, "ROLLINTU.HTM"], // Rollin' And Tumblin'
  [524, "SADEYEDL.HTM"], // Sad-Eyed Lady Of The Lowlands
  [526, "SAINTLOU.HTM"], // Saint Louis Blues
  [547, "SHAKESUG.HTM"], // Shake Sugaree
  [551, "SHELTERF.HTM"], // Shelter From The Storm
  [599, "TENWALTZ.HTM"], // Tennessee Waltz
  [603, "THATLUCK.HTM"], // That Lucky Old Sun
  [640, "UNCLEPEN.HTM"], // Uncle Pen
  [655, "WEREWOLF.HTM"], // Werewolves Of London
  [675, "WHISKEYI.HTM"], // Whiskey In The Jar
  [678, "WHITEHOU.HTM"], // White House Blues
  [712, "ROCKAROU.HTM"], // Rock Around The Clock
  [714, "SILVERTH.HTM"], // Silver Threads And Golden Needles
  [718, "COLDCOLD.HTM"], // Cold Cold Heart
  [738, "BUILTCO2.HTM"], // Built For Comfort
  [758, "RIVERDEE.HTM"], // River Deep Mountain High
  [789, "LOUIE.HTM"], // Louie Louie
  [799, "THERENOC.HTM"], // There Ain't No Cars On Me
  [802, "THEDANCE.HTM"], // The Dance
  [804, "SLOOPJOH.HTM"], // Sloop John B
  [816, "THIRTYDA.HTM"], // Thirty Days
  [824, "HIGHWY61.HTM"], // Highway 61 Revisited
  [833, "MONA.HTM"], // Mona
  [834, "BUTCHERS.HTM"], // Butcher's Boy
  [857, "MOJONAVI.HTM"], // Mojo Navigator
  [874, "YONDERCO.HTM"], // Yonder Comes A Sucker
  [885, "WILLIEAN.HTM"], // Willie And The Hand Jive
  [902, "TALKBLUE.HTM"], // Talkin' Blues
  [906, "RAINSNOW.HTM"], // Rainbows In The Snow
  [914, "OHSUSANN.HTM"], // Oh! Susanna
  [918, "OPERATOR.HTM"], // Operator
  [945, "CRAZYWOR.HTM"], // Crazy Words, Crazy Tune
  [946, "WESHALLN.HTM"], // We Shall Not Be Moved
  [953, "MARIAHEL.HTM"], // Maria Elena
  [979, "PAULANDS.HTM"], // Paul And Silas
  [984, "PICKINGU.HTM"], // Pickin' Up The Pieces
  [985, "EVILHEAR.HTM"], // Evil Hearted Man
  [994, "LETITROC.HTM"], // Let It Rock
  [995, "THATSWHA.HTM"], // That's What Love Will Make You Do
  [996, "KNOCKING.HTM"], // Knockin' On Heaven's Door
  [997, "STOPTHAT.HTM"], // Stop That Train
  [998, "STRANGEM.HTM"], // Strange Man
  [1010, "CLOSER.HTM"], // Closer
  [1012, "GOODNIGH.HTM"], // Goodnight Irene
  [1044, "LAWDYMIS.HTM"], // Lawdy Miss Clawdy
  [1047, "CODINE.HTM"], // Cod'ine
  [1048, "SHAKERAT.HTM"], // Shake, Rattle and Roll
  [1049, "BLUESUED.HTM"], // Blue Suede Shoes
  [1054, "TELLOLDB.HTM"], // Tell Ol' Bill
  [1064, "TWOIRISH.HTM"], // Two Irishmen
  [1065, "INTHEPIN.HTM"], // In The Pines
  [1067, "BLACKMOR.HTM"], // Black Mountain Rag
  [1076, "JBGOODE.HTM"], // Johnny B. Goode
  [1078, "BOOGIEON.HTM"], // Boogie On Reggae Woman
  [1085, "STAGGERL.HTM"], // Stagger Lee
  [1086, "FOLLOWTH.HTM"], // Follow The Drinking Gourd
  [1087, "JOHNHENR.HTM"], // John Henry
  [1090, "I2VEGHOM.HTM"], // I've Got A Home In That Rock
  [1091, "MARYDONT.HTM"], // Oh, Mary Don't You Weep
  [1093, "ALL1MYTR.HTM"], // All My Trials
  [1095, "MICHAELR.HTM"], // Michael Row The Boat Ashore
  [1099, "POORELLE.HTM"], // Poor Ellen Smith
  [1100, "WILDWOOD.HTM"], // Wildwood Flower
  [1101, "BROWNSFE.HTM"], // Brown's Ferry Blues
  [1102, "JESSEJ2.HTM"], // Jesse James
  [1104, "ALLTHEGO.HTM"], // All The Good Times Are Past And Gone
  [1107, "HANDSOMM.HTM"], // Handsome Molly
  [1108, "PIGINAPE.HTM"], // Pig In A Pen
  [1110, "NINEPOUN.HTM"], // Nine Pound Hammer
  [1111, "SALTYDOG.HTM"], // Salty Dog Blues
  [1113, "MORNINGG.HTM"], // Morning Glory
  [1114, "HIGHWAY1.HTM"], // Highway 101 Blues
  [1117, "HE1SGONE.HTM"], // He's Gone
  [1120, "FORWHATI.HTM"], // For What It's Worth
  // Same song under another spelling of the title (user, 2026-11-27); our titles stay as they are.
  [381, "I1GOTLOV.HTM"], // Love
  [822, "YOU1CANT.HTM"], // You Can't Judge A Book By The Cover
  [823, "NEWMINGL.HTM"], // Minglewood Blues
  [860, "DONTTHIN.HTM"], // Don't Think Twice It's Alright
  [978, "LOSMUERT.HTM"], // Los Muertes
  [980, "BLACKJAC.HTM"], // Black Jack Davey
  [1033, "MULESKIN.HTM"], // Mule Skinner Blues
  [1080, "BELIEVE2.HTM"], // Believe It Or Not (Fortune Or Fame)
  [1084, "HANGONSL.HTM"], // Hang On Sloopy/Louie Louie
  [1088, "SANTYANN.HTM"], // Santy Anno
  [1089, "PADDYWOR.HTM"], // Poor Paddy Works On The Railway
  [1105, "DARLINGC.HTM"], // Darlin' Corey
  [1106, "BALLADHP.HTM"], // The Ballad Of Harry Pollitt
  [1109, "ROVINGGA.HTM"], // Roving Gambler
  [1112, "YOURESIX.HTM"], // You're Sixteen
  // Same song; Whitegum's credit differs from the archive's, to settle in HSA-188 (user, 2026-11-27).
  [409, "MILWAUKE.HTM"], // Milwaukee Blues
  [445, "OHBABEIT.HTM"], // Oh Babe It Ain't No Lie
  [794, "BLINDMAN.HTM"], // Blind Man
  [1030, "DAYSOF49.HTM"], // Days of '49
  [1063, "WILDABOU.HTM"], // Wild About My Lovin'
  [1092, "WASNTTHA.HTM"], // Wasn't That A Time?
  // A part of a longer song: its section of that song's page (user, 2026-11-27).
  [709, "SUGAR1MG.HTM#SSDD"], // Sunshine Daydream, the close of Sugar Magnolia
  [1115, "BLSALLAH.HTM#unusual"], // Unusual Occurrences in the Desert, part of Blues for Allah
]);

/**
 * Work titles the user changed (2026-11-27). The old title and the given other names become the
 * work's other names; the slug follows the new title (the old slug stays an old address).
 * Key: old song ID.
 */
export const WORK_TITLES: ReadonlyMap<number, { title: string; otherNames: readonly string[]; slug: string }> = new Map([
  // The community name since the 50th-anniversary Rum Runners bonus track (Whitegum BALLBUDD.HTM).
  [39, { title: "West Virginia Steel Guitar", otherNames: ["Ballad of Buddy Holly", "All the Same", "All the Same to Me"], slug: "west-virginia-steel-guitar" }],
]);
