import axios from 'axios'
import { AnalysisHistoryItem, PoseAnalysisResponse } from '../types'
import {
  AnalysisStatus,
  KickAnalysisResult,
  KickHistoryEntry,
  kickAnalysisFromPoseResponse,
  parseKickAnalysisResult,
  parseKickHistoryEntries
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

/** 旧 API 互換ペイロード（source）の最低限の形チェック */
function isPoseSource(v: unknown): v is PoseAnalysisResponse {
  return (
    typeof v === 'object' &&
    v !== null &&
    'pose' in v &&
    typeof (v as { id?: unknown }).id === 'string'
  )
}

/**
 * 契約 v1.0 エンドポイント（/api/v1/kick-analysis*）からの取得。
 * 応答は受信時に構造検証し、契約違反なら null（呼び出し側で旧 API へ
 * フォールバック）。ネットワーク/404 も null。
 */
async function fetchV1Result(analysisId?: string): Promise<KickAnalysisPayload | null> {
  try {
    const url = analysisId
      ? `${API_BASE}/v1/kick-analysis/${analysisId}`
      : `${API_BASE}/v1/kick-analysis/latest`
    const res = await axios.get<unknown>(url, { params: { include_source: true } })
    const body = res.data
    if (typeof body !== 'object' || body === null) return null
    const envelope = body as { analysis?: unknown; source?: unknown }
    const analysis = parseKickAnalysisResult(envelope.analysis)
    if (!analysis) return null
    return {
      analysis,
      source: isPoseSource(envelope.source) ? envelope.source : null,
      isSample: false
    }
  } catch {
    return null
  }
}

/** 旧 API（/api/history*）+ クライアント側 adapter によるフォールバック */
async function fetchLegacyResult(analysisId?: string): Promise<KickAnalysisPayload | null> {
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

/**
 * 解析結果を取得する。
 * 1) 契約 v1.0 エンドポイント（バックエンド側 Pydantic 検証 + 受信側
 *    構造検証）を優先
 * 2) 応答が不正・未実装（旧バックエンド）の場合は旧 API + クライアント
 *    adapter へフォールバック
 * 3) どちらも失敗なら null（呼び出し側は idle/サンプル表示へ遷移し、
 *    クラッシュしない）
 */
export async function getKickAnalysisResult(
  analysisId?: string
): Promise<KickAnalysisPayload | null> {
  const v1 = await fetchV1Result(analysisId)
  if (v1) return v1
  return fetchLegacyResult(analysisId)
}

/** 解析履歴。契約 v1.0 を優先し、不正・未実装なら旧 API へフォールバック */
export async function getKickAnalysisHistory(limit = 8): Promise<KickHistoryEntry[]> {
  try {
    const res = await axios.get<unknown>(`${API_BASE}/v1/kick-analysis`, { params: { limit } })
    const body = res.data
    if (typeof body === 'object' && body !== null && 'items' in body) {
      const entries = parseKickHistoryEntries((body as { items: unknown }).items)
      if (entries.length > 0) return entries
    }
  } catch {
    // フォールバックへ
  }
  return getLegacyHistory(limit)
}

async function getLegacyHistory(limit: number): Promise<KickHistoryEntry[]> {
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
