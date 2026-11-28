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

/** An act on a bill: a band or a person, by its name in the archive. */
export interface BillAct {
  kind: "band" | "person";
  name: string;
}

/**
 * Acts named in the old billing text and notes (user, 2026-11-27; data-model item 124). Key: the
 * name as written, normalized by `normalizeName`, without a leading "the". A missing band or
 * person is made once. "The Dead" (2003–04) is its own band, not the Grateful Dead.
 */
export const BILL_ACTS: ReadonlyMap<string, BillAct> = new Map<string, BillAct>([
  ["dead", { kind: "band", name: "The Dead" }],
  ["other ones", { kind: "band", name: "The Other Ones" }],
  ["jerry garcia band", { kind: "band", name: "Jerry Garcia Band" }],
  ["nrps", { kind: "band", name: "New Riders of the Purple Sage" }],
  ["garcia/kahn", { kind: "band", name: "Jerry Garcia & John Kahn" }],
  ["phil & friends", { kind: "band", name: "Phil Lesh & Friends" }],
  ["kingfish", { kind: "band", name: "Kingfish" }],
  ["go ahead", { kind: "band", name: "Go Ahead" }],
  ["sea level", { kind: "band", name: "Sea Level" }],
  ["hot tuna", { kind: "band", name: "Hot Tuna" }],
  ["jazz is dead", { kind: "band", name: "Jazz Is Dead" }],
  ["david nelson band", { kind: "band", name: "David Nelson Band" }],
  ["gregg's eggs", { kind: "band", name: "Gregg's Eggs" }],
  ["crispy critters", { kind: "band", name: "Crispy Critters" }],
  ["zero", { kind: "band", name: "Zero" }],
  ["mickey & the daylights", { kind: "band", name: "Mickey & the Daylights" }],
  ["problem child", { kind: "band", name: "Problem Child" }],
  ["wavy gravy", { kind: "person", name: "Wavy Gravy" }],
  // Acts that opened for Hunter, from the old notes ("Peter Rowan opened").
  ["peter rowan", { kind: "person", name: "Peter Rowan" }],
  ["tom constantin", { kind: "person", name: "Tom Constanten" }], // a misspelling in one note
  ["new harvest moon band", { kind: "band", name: "New Harvest Moon Band" }],
  ["susan osborne", { kind: "person", name: "Susan Osborne" }],
  ["jonathan edwards", { kind: "person", name: "Jonathan Edwards" }],
  ["patty larkin", { kind: "person", name: "Patty Larkin" }],
  ["dean adrien", { kind: "person", name: "Dean Adrien" }],
  ["sarah baker", { kind: "person", name: "Sarah Baker" }],
  ["shakers", { kind: "band", name: "The Shakers" }],
  ["steve hayden", { kind: "person", name: "Steve Hayden" }],
  ["james montgomery", { kind: "person", name: "James Montgomery" }],
  ["rick danko & friends", { kind: "band", name: "Rick Danko & Friends" }],
  ["chris smither", { kind: "person", name: "Chris Smither" }],
  ["max creek", { kind: "band", name: "Max Creek" }],
  // The 1982 SEVA benefit lineup.
  ["jackson browne", { kind: "person", name: "Jackson Browne" }],
  ["graham nash", { kind: "person", name: "Graham Nash" }],
  ["country joe", { kind: "person", name: "Country Joe McDonald" }],
  ["holly near", { kind: "person", name: "Holly Near" }],
  ["odetta", { kind: "person", name: "Odetta" }],
  ["kate wolf", { kind: "person", name: "Kate Wolf" }],
  // Lineups found in the notes' second sweep (user, 2026-11-27).
  ["merl saunders", { kind: "person", name: "Merl Saunders" }],
  ["moby grape", { kind: "band", name: "Moby Grape" }],
  ["nick gravenites", { kind: "person", name: "Nick Gravenites" }],
  ["leila and snakes", { kind: "band", name: "Leila and the Snakes" }],
  ["charles biscuit band", { kind: "band", name: "Charles Biscuit Band" }],
  ["pure prairie league", { kind: "band", name: "Pure Prairie League" }],
  ["dave mason", { kind: "person", name: "Dave Mason" }],
  ["vassar clements", { kind: "person", name: "Vassar Clements" }],
  ["norton buffalo", { kind: "person", name: "Norton Buffalo" }],
  ["michael hinton", { kind: "person", name: "Michael Hinton" }],
  ["john cipollina", { kind: "person", name: "John Cipollina" }],
  ["toni brown", { kind: "person", name: "Toni Brown" }],
  ["terry garthwaite", { kind: "person", name: "Terry Garthwaite" }],
  ["sonny terry", { kind: "person", name: "Sonny Terry" }],
  ["brownie mcghee", { kind: "person", name: "Brownie McGhee" }], // "McGee" in the note
  ["bob dylan", { kind: "person", name: "Bob Dylan" }],
  ["vince welnick", { kind: "person", name: "Vince Welnick" }],
  ["jorma kaukonen", { kind: "person", name: "Jorma Kaukonen" }],
  ["robert palmer", { kind: "person", name: "Robert Palmer" }],
  ["john hartford", { kind: "person", name: "John Hartford" }],
  ["bonnie raitt", { kind: "person", name: "Bonnie Raitt" }],
  ["tom constanten", { kind: "person", name: "Tom Constanten" }],
]);

/** One row of a bill as the user gave it. "show" is the show's own act (its band, or Hunter). */
export interface BillRow {
  act: string | "show";
  role: "HEADLINER" | "OPENER" | "CO_BILL" | "SET_BREAK";
}

/**
 * Bills the old text gets wrong or cannot say, by old event ID, in bill order (user, 2026-11-27).
 * They replace what the import would read from the billing field and notes.
 */
export const BILL_OVERRIDES: ReadonlyMap<number, readonly BillRow[]> = new Map([
  // The notes: "Comfort & NRPS opened for the Jerry Garcia Band" (the billing field says "and NRPS").
  [75, [{ act: "jerry garcia band", role: "HEADLINER" }, { act: "show", role: "OPENER" }, { act: "nrps", role: "OPENER" }]],
  // "Co-headline with Jorma Kaukonen".
  [715, [{ act: "show", role: "CO_BILL" }, { act: "jorma kaukonen", role: "CO_BILL" }, { act: "max creek", role: "OPENER" }]], // the notes: "Max Creek opened"
  // "Robert Hunter with Tom Constanten".
  [350, [{ act: "show", role: "CO_BILL" }, { act: "tom constanten", role: "CO_BILL" }]],
  // "Sonny Terry and Brownie McGee also appeared" (advertised in the NY Times, 1980-02-01).
  [757, [{ act: "show", role: "CO_BILL" }, { act: "sonny terry", role: "CO_BILL" }, { act: "brownie mcghee", role: "CO_BILL" }]],
]);

/**
 * Festivals and events, one show group per edition (data-model item 124). Key: the group's name.
 * `events`: old event IDs. `bill`: the group's lineup, in the order the source gives it.
 */
export const FESTIVAL_EDITIONS: ReadonlyMap<string, { kind: "festival" | "benefit" | "rally" | "tribute"; events: readonly number[]; bill?: readonly string[]; certainty?: "CONFIRMED" | "PROBABLE" }> = new Map([
  ["Nobody for President Rally 1976", { kind: "rally", events: [599] }], // presented by Wavy Gravy
  ["Whole Earth Festival 1977", { kind: "festival", events: [628] }],
  // "Also performing: Merl Saunders, Moby Grape, Nick Gravenites, Leila and Snakes, Charles Biscuit Band".
  ["Haight-Ashbury Street Fair 1978", { kind: "festival", events: [775], bill: ["merl saunders", "moby grape", "nick gravenites", "leila and snakes", "charles biscuit band"], certainty: "PROBABLE" }],
  ["No Nukes Rally 1979", { kind: "rally", events: [131] }],
  ["Southern Country Rock Festival 1980", { kind: "festival", events: [671], bill: ["pure prairie league", "dave mason", "vassar clements", "peter rowan"], certainty: "PROBABLE" }],
  // The notes: "SEVA 'Sing Out For Sight' benefit with Jackson Browne, Graham Nash, Country Joe,
  // Holly Near, Odetta and Kate Wolf, with MC Wavy Gravy".
  ["SEVA Sing Out for Sight 1982", { kind: "benefit", events: [197], bill: ["jackson browne", "graham nash", "country joe", "holly near", "odetta", "kate wolf", "wavy gravy"], certainty: "PROBABLE" }],
  // "With Kate Wolf, Toni Brown and Terry Garthwaite. Wavy Gravy MC."
  ["Livermore Action Group Benefit 1982", { kind: "benefit", events: [697], bill: ["kate wolf", "toni brown", "terry garthwaite"], certainty: "PROBABLE" }],
  ["Camp Winnarainbow Benefit 1983", { kind: "benefit", events: [248], bill: ["norton buffalo", "michael hinton", "nick gravenites", "john cipollina"], certainty: "PROBABLE" }],
  // The Dinosaurs were billed and rained out; Hunter played solo (BILLED_AS below).
  ["Nobody for President Rally 1983", { kind: "rally", events: [274] }],
  // Pyramid Lake; the notes: "also on the bill: Zero, Mickey & the Daylights, Problem Child, Kingfish, Wavy Gravy".
  ["Ranch Rock 1986", { kind: "festival", events: [325], bill: ["zero", "mickey & the daylights", "problem child", "kingfish", "wavy gravy"], certainty: "PROBABLE" }],
  ["John Cipollina Tribute 1989", { kind: "tribute", events: [352] }],
  ["Barry Melton for Judge Benefit 1992", { kind: "benefit", events: [735] }],
  ["Furthur Festival 1997", { kind: "festival", events: [386, 387, 388, 389, 390, 391, 392] }],
  ["Terrapin Station Reunion 2002", { kind: "festival", events: [453, 454] }],
  // The notes list the other acts; their billing order is not known.
  ["Jerry Garcia Tribute 2002", { kind: "tribute", events: [456], bill: ["jazz is dead", "vince welnick", "david nelson band", "gregg's eggs", "crispy critters"], certainty: "PROBABLE" }],
]);

/**
 * How a show was billed, when only the notes say it (from ads; user, 2026-11-27). It goes into the
 * show's billed-as field. Key: old event ID. A guess stays in the notes ("may have been billed as
 * a Roadhog show", 1976-10-12).
 */
export const BILLED_AS: ReadonlyMap<number, string> = new Map([
  [629, "Grateful Dead lyricist Robert Hunter"],
  [630, "Grateful Dead lyricist Robert Hunter"],
  [644, "Robert Hunter plus Comfort"], // "Advertised as"
  [216, "Fish and Chip"], // Hunter sat in
  [274, "Dinosaurs"], // rained out; Hunter played solo
  [288, "MuSiC"],
  [289, "MuSiC"],
  [290, "MuSiC"],
  [301, "MuSiC"],
]);

/**
 * Segment fixes from the review lists (user, 2026-11-27). Key: old performance ID.
 * `delivery`: how the segment was delivered. `hunterAbsent`: Hunter did not play on it. `refile`: move the row to another review list,
 * because the note is about something else (a quote of another song, not an a cappella song).
 */
export const SEGMENT_FIXES: ReadonlyMap<number, { delivery?: "SUNG_A_CAPPELLA"; refile?: "18-quotes-and-teases"; hunterAbsent?: true }> = new Map([
  // 1980-03-17 Masonic Hall, set 3: the video shows Hunter off stage. The songs stay so the
  // setlist is complete; Hunter is absent on them (data-model item 125).
  [6406, { hunterAbsent: true }], // Stop That Train
  [6407, { hunterAbsent: true }], // Strange Man
  // 2002-04-30 House of Blues: "A cappella while his wireless guitar transmitter is fixed".
  [3727, { delivery: "SUNG_A_CAPPELLA" }], // Man of Constant Sorrow
  [3728, { delivery: "SUNG_A_CAPPELLA" }], // John Silver
  // 2002-08-07: two lines of Uncle Dave Macon's "Way Down the Old Plank Road" before Beedle Um Bum.
  [5078, { refile: "18-quotes-and-teases" }],
]);

/**
 * Old shows and sets that are not imported, because Hunter did not play (data-model item 85;
 * user, 2026-11-27). The show's or set's note says so; the old address answers "gone".
 */
export const DROPPED_EVENTS: ReadonlyMap<number, string> = new Map([
  [233, "1982-12-21, Dinosaurs at Uncle Charlie's: \"Hunter did not play at this show according to Corry\""],
]);
export const DROPPED_SETS: ReadonlyMap<number, string> = new Map([]);

/**
 * Public notes on sets (user, 2026-11-27). Key: old set ID. A set Hunter did not play stays as an
 * empty placeholder with a note, so the sets around it keep their numbers.
 */
export const SET_NOTES: ReadonlyMap<number, string> = new Map([
  [814, "Hunter did not perform in set 2."], // 1980-03-15: the Ghosts without Hunter
]);

/**
 * Review-list rows the user has settled with no further change to the data (user, 2026-11-27):
 * the row leaves its list. Key: list name. Value: legacy IDs with the reason.
 */
export const REVIEWED_ROWS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([
  ["20-hunter-does-not-play", new Map([
    ["events:574", "set 2 stays as an empty placeholder with the note \"Hunter did not perform in set 2.\""],
    ["events:762", "kept as a note: the setlist comes from a review, so the songs before Hunter joined are not known"],
  ])],
]);
