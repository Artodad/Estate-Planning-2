/**
 * Shared docxtemplater constructor options.
 *
 * Upload-time `validateTemplate` and generate-time `generateDocument` must use
 * the same nullGetter. Unknown tags are recorded (when a set is provided) and
 * rendered as empty strings — they must not be upload-only warnings that later
 * become generate-only throws.
 */

export function createRecordingNullGetter(missingTags?: Set<string>) {
  return function nullGetter(part: { value?: unknown } | undefined): string {
    const tagName =
      part && typeof part === "object" && "value" in part
        ? String((part as { value: unknown }).value)
        : "unknown";
    missingTags?.add(tagName);
    return "";
  };
}

export const DOCXTEMPLATER_BASE_OPTIONS = {
  paragraphLoop: true as const,
};
