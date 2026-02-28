import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { api } from '../services/api'
import { AnalysisResult, AnalysisType } from '../types'

function HomePage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [analysisTypes, setAnalysisTypes] = useState<AnalysisType[]>([])
  const [selectedType, setSelectedType] = useState<string>('general')
  const [context, setContext] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalysisTypes()
  }, [])

  const loadAnalysisTypes = async () => {
    try {
      const data = await api.getAnalysisTypes()
      setAnalysisTypes(data.types)
    } catch (err) {
      console.error('Failed to load analysis types:', err)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0]
      setFile(selectedFile)
      setError(null)
      setResult(null)

      // プレビュー生成
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => {
          setPreview(reader.result as string)
        }
        reader.readAsDataURL(selectedFile)
      } else if (selectedFile.type.startsWith('video/')) {
        setPreview(URL.createObjectURL(selectedFile))
      }
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    },
    maxFiles: 1
  })

  const handleAnalyze = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const analysisResult = await api.analyzeMedia(file, selectedType, context)
      setResult(analysisResult)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'AI解析に失敗しました'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const removeFile = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError(null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="home-page">
      <div className="card">
        <h2 className="card-title">動画・画像をアップロード</h2>

        {!file ? (
          <div
            {...getRootProps()}
            className={`upload-zone ${isDragActive ? 'drag-active' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="upload-icon">📁</div>
            <p className="upload-text">
              {isDragActive
                ? 'ここにドロップしてください'
                : 'クリックまたはドラッグ&ドロップでファイルを選択'}
            </p>
            <p className="upload-hint">
              対応形式: MP4, MOV, AVI, JPG, PNG など
            </p>
          </div>
        ) : (
          <div className="file-preview">
            {preview && (
              file.type.startsWith('image/') ? (
                <img src={preview} alt="Preview" />
              ) : (
                <video src={preview} controls />
              )
            )}
            <div className="file-info">
              <div className="file-name">{file.name}</div>
              <div className="file-size">{formatFileSize(file.size)}</div>
            </div>
            <button className="remove-file" onClick={removeFile}>×</button>
          </div>
        )}
      </div>

      {file && (
        <div className="card">
          <h2 className="card-title">解析タイプを選択</h2>
          <div className="analysis-type-select">
            {analysisTypes.map((type) => (
              <button
                key={type.id}
                className={`analysis-type-btn ${selectedType === type.id ? 'selected' : ''}`}
                onClick={() => setSelectedType(type.id)}
              >
                {type.name}
              </button>
            ))}
          </div>

          <h3 style={{ marginBottom: '8px', fontSize: '1rem' }}>
            追加情報（任意）
          </h3>
          <textarea
            className="context-input"
            placeholder="例: インサイドキックの練習中です。ボールが浮いてしまう原因を知りたいです。"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />

          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? (
              <>
                <span className="loading-spinner"></span>
                解析中...
              </>
            ) : (
              'AI解析を開始'
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--error-color)' }}>
          <p style={{ color: 'var(--error-color)' }}>{error}</p>
        </div>
      )}

      {result && (
        <div className="card analysis-result">
          <h2 className="card-title">解析結果</h2>

          <div className="result-section">
            <h3>📝 詳細分析</h3>
            <p>{result.analysis.raw_analysis}</p>
          </div>

          {result.analysis.sections.good_points && (
            <div className="result-section">
              <h3>✅ 良い点</h3>
              <p>{result.analysis.sections.good_points}</p>
            </div>
          )}

          {result.analysis.sections.improvements && (
            <div className="result-section">
              <h3>🎯 改善点</h3>
              <p>{result.analysis.sections.improvements}</p>
            </div>
          )}

          {result.analysis.sections.advice && (
            <div className="result-section">
              <h3>💡 具体的アドバイス</h3>
              <p>{result.analysis.sections.advice}</p>
            </div>
          )}

          {result.analysis.sections.reference_player && (
            <div className="result-section">
              <h3>⭐ 参考選手</h3>
              <p>{result.analysis.sections.reference_player}</p>
            </div>
          )}

          {result.analysis.sections.practice_menu && (
            <div className="result-section">
              <h3>🏃 練習メニュー</h3>
              <p>{result.analysis.sections.practice_menu}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HomePage
