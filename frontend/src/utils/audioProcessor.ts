import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

export interface ProcessOptions {
  compress: boolean
  trim: 'none' | 'first30' | 'random30'
}

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null

async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance

  if (ffmpegLoading) return ffmpegLoading

  ffmpegLoading = (async () => {
    const ffmpeg = new FFmpeg()
    const timeoutMs = 30000
    // 使用 URL 对象确保 Vite 不会尝试 transform 这些文件
    const baseURL = window.location.origin
    const loadPromise = ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg/ffmpeg-core.wasm`,
    })
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('ffmpeg load timeout')), timeoutMs)
    )
    await Promise.race([loadPromise, timeoutPromise])
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  try {
    return await ffmpegLoading
  } catch (e) {
    ffmpegLoading = null
    throw e
  }
}

export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(audio.duration)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(audio.src)
      reject(new Error('无法读取音频时长'))
    }
    audio.src = URL.createObjectURL(file)
  })
}

export async function processAudio(
  file: File,
  options: ProcessOptions,
  onProgress?: (p: number) => void
): Promise<File> {
  if (!options.compress && options.trim === 'none') {
    return file
  }

  let duration = 0
  if (options.trim !== 'none') {
    try {
      duration = await getAudioDuration(file)
    } catch {
      return file
    }
    if (duration <= 30) {
      if (!options.compress) return file
      options = { ...options, trim: 'none' }
    }
  }

  // 检测 SharedArrayBuffer 支持（HTTPS + COOP/COEP 才可用）
  if (typeof SharedArrayBuffer === 'undefined') {
    console.warn('SharedArrayBuffer 不可用（需要 HTTPS），跳过音频处理')
    return file
  }

  let ffmpeg: FFmpeg
  try {
    onProgress?.(0.05)
    ffmpeg = await loadFFmpeg()
    onProgress?.(0.15)
  } catch {
    console.warn('ffmpeg 加载失败，使用原文件上传')
    return file
  }

  const progressHandler = onProgress
    ? ({ progress }: { progress: number }) => { onProgress(Math.min(0.2 + progress * 0.75, 0.95)) }
    : null

  try {
    if (progressHandler) ffmpeg.on('progress', progressHandler)

    const inputName = 'input' + getExtension(file.name)
    const outputName = options.compress ? 'output.mp3' : 'output' + getExtension(file.name)

    onProgress?.(0.18)
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    onProgress?.(0.25)

    const args = buildArgs(inputName, outputName, options, duration)
    await ffmpeg.exec(args)
    onProgress?.(0.98)

    const data = await ffmpeg.readFile(outputName)
    const bytes = data instanceof Uint8Array ? data.slice() : new TextEncoder().encode(data as string)
    const blob = new Blob([bytes as BlobPart], { type: options.compress ? 'audio/mpeg' : file.type })
    const outputFile = new File([blob], options.compress ? 'processed.mp3' : file.name, {
      type: blob.type,
    })

    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)

    return outputFile
  } catch (e) {
    console.warn('音频处理失败，使用原文件上传:', e)
    return file
  } finally {
    if (progressHandler) ffmpeg.off('progress', progressHandler)
  }
}

function buildArgs(input: string, output: string, options: ProcessOptions, duration: number): string[] {
  const args = ['-i', input]

  if (options.trim === 'first30') {
    args.push('-ss', '0', '-t', '30')
  } else if (options.trim === 'random30') {
    const maxStart = Math.max(0, duration - 30)
    const start = Math.random() * maxStart
    args.push('-ss', start.toFixed(2), '-t', '30')
  }

  if (options.compress) {
    args.push('-c:a', 'libmp3lame', '-b:a', '128k', '-y', output)
  } else {
    args.push('-c:a', 'copy', '-y', output)
  }

  return args
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx >= 0 ? filename.slice(idx) : '.mp3'
}

export function isWasmSupported(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
  } catch {
    return false
  }
}
