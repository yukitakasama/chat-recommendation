const ESTIMATED_IMAGE_INPUT_TOKENS = 1500

export function estimateTextTokens(text: string): number {
  if (!text) return 0
  let tokens = 0
  let asciiRun = 0
  const flushAscii = (): void => {
    if (asciiRun > 0) {
      tokens += Math.ceil(asciiRun / 4)
      asciiRun = 0
    }
  }

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x7f) {
      if (/\s/.test(character)) {
        flushAscii()
      } else {
        asciiRun += 1
      }
    } else {
      flushAscii()
      tokens += 1
    }
  }
  flushAscii()
  return tokens
}

export function estimateModelInputTokens(
  system: string,
  prompt: string,
  imageCount = 0
): number {
  return estimateTextTokens(system) + estimateTextTokens(prompt) + imageCount * ESTIMATED_IMAGE_INPUT_TOKENS
}
