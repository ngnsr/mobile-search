import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { Image } from 'react-native';
import { Logger } from '../utils/logger';
import { Tokenizer } from '@huggingface/tokenizers';
import RNFS from 'react-native-fs';

const MODEL_ASSET = require('../../assets/models/model_quantized.onnx');
const TOKENIZER_JSON = require('../../assets/models/tokenizer.json');

const MAX_SEQ_LEN = 128;
const TOKENIZER_CONFIG = {
  model_max_length: MAX_SEQ_LEN,
  padding_side: 'right',
  truncation_side: 'right',
  clean_up_tokenization_spaces: false,
} as const;

/**
 * Singleton service that loads the multilingual-e5-small ONNX model
 * and provides 384-dim embeddings via on-device inference.
 */
class EmbeddingService {
  private session: InferenceSession | null = null;
  private tokenizer: Tokenizer | null = null;
  private padTokenId: number = 0;

  private stripFileScheme(pathOrUri: string): string {
    return pathOrUri.startsWith('file://') ? pathOrUri.slice('file://'.length) : pathOrUri;
  }

  private normalizeUnigramVocab(vocabLike: any): Array<[string, number]> {
    const length = Number(vocabLike?.length ?? 0);
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error('Tokenizer vocab is missing or invalid');
    }

    const vocab = new Array<[string, number]>(length);
    for (let i = 0; i < length; i++) {
      const entry = vocabLike[i];

      if (Array.isArray(entry) && entry.length >= 2) {
        vocab[i] = [String(entry[0]), Number(entry[1])];
        continue;
      }

      if (entry && typeof entry === 'object') {
        // Support array-like objects: {0: piece, 1: score, length: 2} as well as {piece, score}.
        const piece = entry.piece ?? entry.token ?? entry[0];
        const score = entry.score ?? entry[1];
        vocab[i] = [String(piece ?? ''), Number(score ?? 0)];
        continue;
      }

      vocab[i] = ['', 0];
    }

    return vocab;
  }

  private async ensureModelOnDisk(modelUri: string): Promise<string> {
    const dir = `${RNFS.CachesDirectoryPath}/onnx`;
    const modelPath = `${dir}/model_quantized.onnx`;

    try {
      const exists = await RNFS.exists(modelPath);
      if (exists) return modelPath;

      await RNFS.mkdir(dir);

      if (modelUri.startsWith('http://') || modelUri.startsWith('https://')) {
        Logger.info('EmbeddingService', `Downloading model to: ${modelPath}`);
        const res = await RNFS.downloadFile({ fromUrl: modelUri, toFile: modelPath }).promise;
        if (res.statusCode && res.statusCode >= 400) {
          throw new Error(`Model download failed: HTTP ${res.statusCode}`);
        }
        return modelPath;
      }

      if (modelUri.startsWith('file://')) {
        const srcPath = this.stripFileScheme(modelUri);
        Logger.info('EmbeddingService', `Copying model from file to: ${modelPath}`);
        await RNFS.copyFile(srcPath, modelPath);
        return modelPath;
      }

      if (modelUri.startsWith('asset:/')) {
        // Android-only: attempt to copy from APK assets.
        // The exact asset path depends on bundling; keep it best-effort.
        const assetPath = modelUri.replace('asset:/', '');
        Logger.info('EmbeddingService', `Copying model from asset "${assetPath}" to: ${modelPath}`);
        await RNFS.copyFileAssets(assetPath, modelPath);
        return modelPath;
      }

      throw new Error(`Unsupported model URI scheme: ${modelUri}`);
    } catch (e) {
      // If file is partially written, remove it to allow retry on next launch.
      try {
        const exists = await RNFS.exists(modelPath);
        if (exists) await RNFS.unlink(modelPath);
      } catch {
        // ignore
      }
      throw e;
    }
  }

  async initialize(): Promise<void> {
    if (this.session) return;

    try {
      const t0 = Date.now();
      Logger.info('EmbeddingService', 'Starting initialization...');

      // Pure-JS tokenizer (compatible with React Native / Hermes).
      // Note: @xenova/transformers depends on `import.meta`, which Hermes does not support.
      Logger.info('EmbeddingService', 'Creating tokenizer...');
      const tokenizerJson: any = TOKENIZER_JSON;
      const model = tokenizerJson?.model;
      if (model?.type === 'Unigram' && model?.vocab) {
        Logger.info('EmbeddingService', 'Normalizing Unigram vocab to real arrays...');
        const normalizedVocab = this.normalizeUnigramVocab(model.vocab);
        const normalizedTokenizerJson = {
          ...tokenizerJson,
          model: {
            ...model,
            vocab: normalizedVocab,
          },
        };
        this.tokenizer = new Tokenizer(normalizedTokenizerJson, TOKENIZER_CONFIG);
      } else {
        this.tokenizer = new Tokenizer(tokenizerJson, TOKENIZER_CONFIG);
      }
      Logger.info('EmbeddingService', 'Tokenizer created. Finding padTokenId...');
      
      this.padTokenId =
        this.tokenizer.token_to_id('<pad>') ??
        this.tokenizer.token_to_id('[PAD]') ??
        this.tokenizer.token_to_id('</s>') ??
        0;
      
      Logger.info('EmbeddingService', `padTokenId: ${this.padTokenId}`);

      // Metro asset require() returns a number (asset registration ID).
      const source = Image.resolveAssetSource(MODEL_ASSET);
      Logger.info('EmbeddingService', 'Resolving model from:', source.uri);
      const modelPath = await this.ensureModelOnDisk(source.uri);
      Logger.info('EmbeddingService', `Model ready on disk: ${modelPath}`);

      Logger.info('EmbeddingService', 'Creating InferenceSession...');
      // Prefer loading from a file path to avoid holding ~100MB+ model bytes in JS memory.
      this.session = await InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
      });
      Logger.info('EmbeddingService', `Model & Tokenizer ready in ${Date.now() - t0}ms.`);
    } catch (err: unknown) {
      Logger.error('EmbeddingService', 'Initialize failed:', err);
      if (err instanceof Error) throw err;
      throw new Error(String(err));
    }
  }

  /**
   * Tokenize text using @huggingface/tokenizers (tokenizers.js).
   * Pads/truncates to MAX_SEQ_LEN to match ONNX input shapes.
   */
  private tokenize(text: string): { inputIds: number[]; attentionMask: number[] } {
    if (!this.tokenizer) throw new Error('Tokenizer not initialized');
    
    const encoding = this.tokenizer.encode(text, { add_special_tokens: true });
    const ids = encoding.ids ?? [];
    const mask = encoding.attention_mask ?? [];

    const inputIds = ids.slice(0, MAX_SEQ_LEN);
    const attentionMask = mask.slice(0, MAX_SEQ_LEN);

    while (inputIds.length < MAX_SEQ_LEN) inputIds.push(this.padTokenId);
    while (attentionMask.length < MAX_SEQ_LEN) attentionMask.push(0);

    return { inputIds, attentionMask };
  }

  /**
   * Mean pool the last_hidden_state, weighting by attention_mask,
   * then L2-normalize.
   */
  private meanPoolAndNormalize(
    hiddenState: Float32Array,
    attentionMask: number[],
    seqLen: number,
    hiddenSize: number,
  ): Float32Array {
    const pooled = new Float32Array(hiddenSize);
    let tokenCount = 0;

    for (let t = 0; t < seqLen; t++) {
      if (attentionMask[t] === 0) continue;
      tokenCount++;
      for (let h = 0; h < hiddenSize; h++) {
        pooled[h] += hiddenState[t * hiddenSize + h];
      }
    }
    for (let h = 0; h < hiddenSize; h++) {
      pooled[h] /= Math.max(tokenCount, 1);
    }

    // L2 normalize
    let norm = 0;
    for (let h = 0; h < hiddenSize; h++) norm += pooled[h] * pooled[h];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let h = 0; h < hiddenSize; h++) pooled[h] /= norm;
    }

    return pooled;
  }

  /**
   * Quantize float32 [-1, 1] → int8 [-127, 127]
   * Returns a JSON string suitable for sqlite-vec's vec_int8(?)
   */
  private quantizeToInt8(floatVec: Float32Array): string {
    const int8 = new Array<number>(floatVec.length);
    for (let i = 0; i < floatVec.length; i++) {
      int8[i] = Math.max(-127, Math.min(127, Math.round(floatVec[i] * 127)));
    }
    return JSON.stringify(int8);
  }

  /**
   * Generate a real int8 embedding for the given text.
   * E5 requires "query: " or "passage: " prefix.
   */
  async embed(text: string, isQuery: boolean = false): Promise<string> {
    if (!this.session) {
      throw new Error('[EmbeddingService] Not initialized. Call initialize() first.');
    }

    const prefix = isQuery ? 'query: ' : 'passage: ';
    const fullText = prefix + text;

    const { inputIds, attentionMask } = this.tokenize(fullText);
    Logger.debug('EmbeddingService', `Embedding "${fullText.slice(0, 40)}..."`);

    // E5 expects int64 tensors
    const inputIdsBigInt = BigInt64Array.from(inputIds.map(BigInt));
    const attentionMaskBigInt = BigInt64Array.from(attentionMask.map(BigInt));

    const feeds = {
      input_ids: new Tensor('int64', inputIdsBigInt, [1, MAX_SEQ_LEN]),
      attention_mask: new Tensor('int64', attentionMaskBigInt, [1, MAX_SEQ_LEN]),
    };

    if (this.session.inputNames?.includes('token_type_ids')) {
      const tokenTypeIdsBigInt = new BigInt64Array(MAX_SEQ_LEN); // all zeros
      // @ts-expect-error dynamic feed key
      feeds.token_type_ids = new Tensor('int64', tokenTypeIdsBigInt, [1, MAX_SEQ_LEN]);
    }

    const output = await this.session.run(feeds);

    const lastHiddenState = output.last_hidden_state?.data as Float32Array;
    if (!lastHiddenState) {
      throw new Error('[EmbeddingService] ONNX output missing last_hidden_state.');
    }
    const hiddenSize = 384;

    const pooled = this.meanPoolAndNormalize(lastHiddenState, attentionMask, MAX_SEQ_LEN, hiddenSize);
    return this.quantizeToInt8(pooled);
  }
}

export const embeddingService = new EmbeddingService();
