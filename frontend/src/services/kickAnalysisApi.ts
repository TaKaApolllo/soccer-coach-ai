import axios from 'axios'
import { AnalysisHistoryItem, PoseAnalysisResponse } from '../types'
import {
  AnalysisStatus,
  KickAnalysisResult,
  KickHistoryEntry,
  kickAnalysisFromPoseResponse
} from '../types/kickAnalysis'

// =====================================================================
// キックフォーム分析 API サービス層
//
// UI コンポーネントは axios/fetch を直接呼ばず、必ずこの層を経由する。
// 現行バックエンドは同期 API（POST /api/pose/analyze が完了まで返らない）
// のため、getKickAnalysisStatus は疑似実装。次フェーズで非同期ジョブ化
// されても関数シグネチャは変わらない契約とする。
// =====================================================================

const API_BASE = '/api'

/** アップロード上限（フロント事前検証の目安） */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100MB

const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.jpg', '.jpeg', '.png', '.bmp', '.webp'
])

const ALLOWED_MIME_PREFIXES = ['video/', 'image/']

export type FileValidationResult =
  | { ok: true }
  | { ok: false; reason: string; hint: string }

/** 拡張子 + MIME + サイズのフロント事前検証 */
export function validateKickVideoFile(file: File): FileValidationResult {
  const dot = file.name.lastIndexOf('.')
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      reason: `対応していないファイル形式です（${ext || '拡張子なし'}）`,
      hint: 'MP4 / MOV / WebM などの動画、または JPG / PNG の画像を選択してください。'
    }
  }
  if (file.type && !ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    return {
      ok: false,
      reason: `動画・画像以外のファイルです（${file.type}）`,
      hint: 'キック動画（MP4 推奨）をアップロードしてください。'
    }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(0)
    return {
      ok: false,
      reason: `ファイルサイズが大きすぎます（${mb}MB / 上限 100MB）`,
      hint: '動画を短くトリミングするか、解像度を下げて再アップロードしてください。'
    }
  }
  return { ok: true }
}

/**
 * v1.0 スキーマの解析結果と、現行 API の生応答のペア。
 * source はフレーム画像（base64）等、スキーマ外の表示素材へのアクセス用。
 * isSample が true の場合はモック表示（source は null）。
 */
export interface KickAnalysisPayload {
  analysis: KickAnalysisResult
  source: PoseAnalysisResponse | null
  isSample: boolean
}

export interface UploadKickVideoOptions {
  faceMode: 'real' | 'avatar'
  context?: string
  /** アップロード進捗（0-1）。完了後は解析処理待ちになる */
  onUploadProgress?: (ratio: number) => void
}

/** キック動画をアップロードして解析（現行 API は同期のため完了まで待つ） */
export async function uploadKickVideo(
  file: File,
  options: UploadKickVideoOptions
): Promise<KickAnalysisPayload> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('analysis_type', 'kick')
  if (options.context) formData.append('context', options.context)
  formData.append('face_mode', options.faceMode)

  const response = await axios.post<PoseAnalysisResponse>(
    `${API_BASE}/pose/analyze`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000,
      onUploadProgress: (e) => {
        if (options.onUploadProgress && e.total) {
          options.onUploadProgress(e.loaded / e.total)
        }
      }
    }
  )
  return payloadFromResponse(response.data)
}

/**
 * 解析ジョブの状態を取得する。
 * 現行 API は同期のため「保存済みなら completed / low_confidence、
 * 見つからなければ failed」を返す疑似実装。契約としての関数は
 * 非同期ジョブ化後もそのまま使える。
 */
export async function getKickAnalysisStatus(analysisId: string): Promise<AnalysisStatus> {
  try {
    const payload = await getKickAnalysisResult(analysisId)
    return payload?.analysis.status ?? 'failed'
  } catch {
    return 'failed'
  }
}

interface HistoryItemWithPayload {
  id: string
  score?: number | null
  created_at: string
  analysis: PoseAnalysisResponse
}

/**
 * 解析結果を取得する。
 * analysisId 省略時は骨格解析系（pose）の最新 1 件。存在しなければ null。
 */
export async function getKickAnalysisResult(
  analysisId?: string
): Promise<KickAnalysisPayload | null> {
  try {
    if (analysisId) {
      const res = await axios.get<HistoryItemWithPayload>(`${API_BASE}/history/${analysisId}`)
      return payloadFromHistoryItem(res.data)
    }
    const res = await axios.get<HistoryItemWithPayload>(`${API_BASE}/history-latest/pose`)
    return payloadFromHistoryItem(res.data)
  } catch {
    return null
  }
}

/** 解析履歴（キックフォーム系のみ）を新スキーマの履歴エントリで返す */
export async function getKickAnalysisHistory(limit = 8): Promise<KickHistoryEntry[]> {
  try {
    const res = await axios.get<{ analyses: AnalysisHistoryItem[] }>(`${API_BASE}/history`)
    return res.data.analyses
      .filter((a) => a.analysis_type !== 'formation')
      .slice(0, limit)
      .map((a) => ({
        analysisId: a.id,
        createdAt: a.created_at,
        overallScore: a.score,
        thumbnailUrl:
          a.media_type === 'video' || a.media_type === 'image'
            ? `${API_BASE}/history/${a.id}/thumbnail`
            : null
      }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------

function payloadFromResponse(resp: PoseAnalysisResponse): KickAnalysisPayload {
  return {
    analysis: kickAnalysisFromPoseResponse(resp),
    source: resp,
    isSample: false
  }
}

function payloadFromHistoryItem(item: HistoryItemWithPayload): KickAnalysisPayload | null {
  if (!item?.analysis) return null
  // 履歴ペイロードにはトップレベルの id/score が含まれないため補完する
  const resp: PoseAnalysisResponse = {
    ...item.analysis,
    id: item.id,
    score: item.score ?? item.analysis.pose?.score ?? null,
    created_at: item.created_at ?? item.analysis.created_at
  }
  return payloadFromResponse(resp)
}
