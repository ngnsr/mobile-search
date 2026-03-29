# Mobile Search Client

A high-performance, local-first mobile application for document indexing and semantic search. This project allows users to search through personal documents (PDF, TXT, MD) using a combination of traditional keyword matching (BM25) and modern vector embeddings—all processed entirely on-device for maximum privacy.

## Features

- **Hybrid Search Engine**: Combines Full-Text Search (FTS5) with Vector Similarity (RRF) using `op-sqlite`.
- **Native PDF Extraction**: High-performance text and page parsing via PDFBox (Android) and PDFKit (iOS).
- **On-Device Embeddings**: Uses `onnxruntime-react-native` to generate embeddings locally.
- **Privacy First**: No data leaves the device; all indexing and searching happen offline.
- **Smart Chunking**: Page-aware document splitting for precise search result navigation.

## Prerequisites

- **Node.js**: 18.x or later
- **React Native CLI**
- **Android**: Android Studio & SDK (API 21+)
- **iOS**: macOS with Xcode (15+) and CocoaPods

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd client
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Install iOS Pods**:
   ```bash
   cd ios && pod install && cd ..
   ```

## Model Setup (Required)

The app uses the **multilingual-e5-small** model for generating text embeddings. To keep the repository lightweight, the model file is not included and must be downloaded manually.

1. Create the models directory if it doesn't exist:
   ```bash
   mkdir -p assets/models
   ```

2. Download the quantized ONNX model. You can use the following command (or download it manually from a source like Hugging Face):
   ```bash
   # Example: Downloading from a compatible source
   curl -L "https://huggingface.co/intfloat/multilingual-e5-small/resolve/main/model.onnx" -o assets/models/model_quantized.onnx
   ```
   *Note: Ensure the filename is exactly `model_quantized.onnx`.*

3. Verify you have the following files in `assets/models/`:
   - `model_quantized.onnx` (The file you just downloaded)
   - `tokenizer.json` (Already in the repo)
   - `tokenizer_config.json` (Already in the repo)

## Running the App

### Android
```bash
npx react-native run-android
```

### iOS
```bash
npx react-native run-ios
```

## Search Modes

- **BM25**: Classic keyword-based search. Best for finding exact terms and names.
- **Semantic**: Vector-based search. Best for finding concepts and related meanings even without exact word matches.
- **Hybrid**: Combined ranking (Reciprocal Rank Fusion). Provides the most balanced results by merging both strategies.

## Project Structure

- `android/` & `ios/`: Native modules for PDF extraction and platform configurations.
- `src/services/`: Core logic for Database, Embedding, and Search services.
- `src/screens/`: UI components for searching, document management, and results.
- `assets/models/`: Tokenizer and ONNX model files.

## License

MIT
