/**
 * The instruction sent when the operator leaves the fill description empty (Photoshop's prompt-less generative fill).
 * Its own module so a page can quote the exact wording without importing the image stack (generative-fill.ts loads sharp).
 *
 * Worded as an instruction: gpt-image-2.6's masking is prompt-driven and "seamlessly continue the surrounding scene" made
 * it paint the hole BLACK (3 real runs 2026-11-09, WORKLOG); this wording filled it invisibly on the same input.
 * flux / ideogram take either.
 */
export const CONTEXT_FILL_PROMPT =
  "Remove everything inside the selected area and fill it with the background that surrounds it: continue the same colours, textures, lighting, lines and horizon from the neighbouring pixels so the edit is invisible. Do not add new objects.";
