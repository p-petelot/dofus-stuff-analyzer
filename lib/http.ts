const DEFAULT_TIMEOUT_MS = 15_000;

interface PostImageOptions {
  token?: string;
  filename?: string;
  contentType?: string;
}

export async function postImage<T = unknown>(
  url: string,
  buffer: Buffer,
  options: PostImageOptions = {},
): Promise<T> {
  const { token, filename = "upload.png", contentType = "image/png" } = options;

  const formData = new FormData();
  const blob = new Blob([buffer], { type: contentType });
  formData.append("file", blob, filename);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      method: "POST",
      body: formData,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
