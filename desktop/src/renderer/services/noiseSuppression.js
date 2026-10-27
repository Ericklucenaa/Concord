import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseWasmSimdPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

// AI noise suppression (RNNoise, WebAssembly). Removes keyboards, fans and
// background chatter far better than the browser's built-in filter.
let wasmPromise = null;

/**
 * Runs `stream` through RNNoise and returns the processed audio track.
 * RNNoise works at 48 kHz, so it gets its own AudioContext.
 */
export async function createDenoisedStream(stream) {
  if (!wasmPromise) wasmPromise = loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
  const wasmBinary = await wasmPromise;
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.audioWorklet.addModule(rnnoiseWorkletPath);
  const source = ctx.createMediaStreamSource(stream);
  const rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
  const destination = ctx.createMediaStreamDestination();
  source.connect(rnnoise);
  rnnoise.connect(destination);
  return {
    stream: destination.stream,
    dispose: () => {
      try {
        source.disconnect();
        rnnoise.destroy?.();
        rnnoise.disconnect();
      } finally {
        ctx.close().catch(() => {});
      }
    }
  };
}
