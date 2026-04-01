import RNFS from 'react-native-fs';

export type RemotePdfConversionResponse = {
  fileName: string;
  pages: string[];
  text: string;
  engine: string;
};

export class RemoteConversionService {
  constructor(private baseUrl: string) {}

  private stripFileScheme(pathOrUri: string): string {
    return pathOrUri.startsWith('file://') ? pathOrUri.slice('file://'.length) : pathOrUri;
  }

  async convertPdfToPages(fileUri: string, fileName: string): Promise<RemotePdfConversionResponse> {
    // RN fetch() FormData can be flaky across environments; for lab reliability use base64 JSON.
    const base64 = await RNFS.readFile(this.stripFileScheme(fileUri), 'base64');
    const body = JSON.stringify({ fileName, base64, pipeline: 'vlm', vlmModel: 'granite_docling' });

    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/convert/pdf_base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Remote convert failed: HTTP ${res.status} ${text}`);
    }

    return (await res.json()) as RemotePdfConversionResponse;
  }
}
