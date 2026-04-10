const OPENAI_API = 'https://api.openai.com/v1/images/generations';

export async function generateImage(
  apiKey: string,
  prompt: string,
  stylePrefix?: string
): Promise<{ url: string; revisedPrompt: string }> {
  const fullPrompt = stylePrefix ? `${stylePrefix}. ${prompt}` : prompt;

  const resp = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: fullPrompt,
      n: 1,
      size: '512x512',
      quality: 'low',
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as Record<string, unknown>;
    const msg = String((err.error as Record<string, unknown>)?.message || resp.statusText);
    throw new Error(`Image generation failed: ${msg}`);
  }

  const data = (await resp.json()) as {
    data: { b64_json: string; revised_prompt?: string }[];
  };

  const img = data.data[0];
  const dataUrl = `data:image/png;base64,${img.b64_json}`;

  return { url: dataUrl, revisedPrompt: img.revised_prompt || fullPrompt };
}
