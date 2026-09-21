import { useState, useCallback } from 'react'
import { processAudio, getAudioDuration, type ProcessOptions } from '../../utils/audioProcessor'

/** 单文件处理/上传状态机：queued → transcoding → uploading → done | failed（docs §6.4） */
export type AudioFileState = 'queued' | 'transcoding' | 'uploading' | 'done' | 'failed'

/** 单文件状态条目：按选择顺序与 createAudioFiles 对齐 */
export interface AudioFileStatus {
  /** 文件名（展示用） */
  name: string
  /** 当前状态 */
  status: AudioFileState
  /** 进度（0–1，仅 transcoding/uploading 有意义） */
  progress?: number
}

/**
 * 音频选择与处理链 hook（创建模式）
 * 收敛 audioFile/createAudioFiles/audioOptions/processing/processProgress/fileStatuses
 */
export function useAudioProcessing() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [createAudioFiles, setCreateAudioFiles] = useState<File[]>([])
  const [audioOptions, setAudioOptions] = useState<ProcessOptions>({ compress: false, trim: 'none' })
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [fileStatuses, setFileStatuses] = useState<AudioFileStatus[]>([])

  /** 选定音频文件：首个作为主音频，全部进入多选列表并初始化为待处理（拖拽与文件选择共用） */
  const selectFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    setAudioFile(files[0])
    setCreateAudioFiles(files)
    setFileStatuses(files.map(f => ({ name: f.name, status: 'queued' as const })))
  }, [])

  /** 按下标补丁更新单个文件状态（转码/上传进度、成败标记） */
  const updateFileStatus = useCallback((index: number, patch: Partial<AudioFileStatus>) => {
    setFileStatuses(prev => prev.map((f, i) => i === index ? { ...f, ...patch } : f))
  }, [])

  /**
   * 提交前处理：启用压缩/裁剪时执行 processAudio 并回报进度，失败回退原文件。
   * 返回处理后的文件与实测时长（秒）；时长用于 B1 服务端权威回合时钟。
   * onProgress 供调用方把进度同步进单文件状态条目。
   */
  const processIfNeeded = useCallback(async (
    file: File,
    onProgress?: (p: number) => void,
  ): Promise<{ file: File; durationSec: number }> => {
    // 未开启处理：直接测量原文件时长
    if (!audioOptions.compress && audioOptions.trim === 'none') {
      let durationSec = 0
      try { durationSec = await getAudioDuration(file) } catch { durationSec = 0 }
      return { file, durationSec }
    }
    setProcessing(true)
    setProcessProgress(0)
    try {
      const processed = await processAudio(file, audioOptions, p => {
        setProcessProgress(p)
        onProgress?.(p)
      })
      let durationSec = 0
      try { durationSec = await getAudioDuration(processed) } catch { durationSec = 0 }
      return { file: processed, durationSec }
    } catch { return { file, durationSec: 0 } }
    finally { setProcessing(false) }
  }, [audioOptions])

  /** 清空音频选择与处理状态 */
  const reset = useCallback(() => {
    setAudioFile(null)
    setCreateAudioFiles([])
    setAudioOptions({ compress: false, trim: 'none' })
    setProcessing(false)
    setProcessProgress(0)
    setFileStatuses([])
  }, [])

  return {
    audioFile, createAudioFiles,
    audioOptions, setAudioOptions,
    processing, setProcessing, processProgress,
    fileStatuses, updateFileStatus,
    selectFiles, processIfNeeded, reset,
  }
}
