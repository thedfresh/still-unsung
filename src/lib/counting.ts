/**
 * The one counting rule for deliveries (data-model item 107). A segment played from a record or
 * tape on air is not a performance: it never counts as a performance, a debut, a gap or a
 * "song performed". Every count in the code asks this function.
 */
export function countsAsPerformance(delivery: string | null | undefined): boolean {
  return delivery !== "RECORDING_PLAYED";
}
