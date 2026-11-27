/**
 * Full names for people the old data names by one word only (data grooming with the user,
 * 2026-11-27, HSA-173). The old site keeps credits as text, often with surnames only, and a few
 * musician records with one name. The import matches a surname to a full-name person only when
 * exactly one person has it; these are the names it cannot match (no such person yet, or several:
 * McDonald, Berry, Freiberg).
 *
 * Left as written for now (no source found): Mojo Navigator (Deonson) and Space Buggy (Gosfield,
 * Haber, Preston).
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
  // Dark Star: music.
  [139, new Map([["mckernan", 'Ron "Pigpen" McKernan']])],
  // Down the Road: music.
  [171, new Map([["welnick", "Vince Welnick"], ["hidalgo", "David Hidalgo"]])],
  // Harp Tree Lament: music. Keeps today's choice; Dave and David Freiberg are on the merge list.
  [253, new Map([["freiberg", "David Freiberg"]])],
  // The Happy Wanderer: music (Moller) and words (Sigismund).
  [251, new Map([["moller", "Friedrich-Wilhelm Möller"], ["sigismund", "Florenz Friedrich Sigismund"]])],
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
  // Mojo Navigator (Country Joe & the Fish): words and music. Deonson is not known yet (HSA-188).
  [857, new Map([["mcdonald", "Country Joe McDonald"]])],
  // UConn Husky (UConn Fight Song): words and music.
  [940, new Map([["france", "Herbert A. France"]])],
  // That's What Love Will Make You Do: words and music. Campbell is Little Milton.
  [995, new Map([["campbell", "Milton Campbell"], ["thigpen", "Henderson Thigpen"], ["banks", "James Banks"], ["marion", "Eddie Marion"]])],
  // Hang On Sloopy/Louie Louie: words and music.
  [1084, new Map([["farrell", "Wes Farrell"], ["berns", "Bert Berns"], ["berry", "Richard Berry"]])],
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
