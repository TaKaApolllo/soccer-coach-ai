import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

interface UploadCardProps {
  file: File | null
  onFileChange: (file: File | null) => void
  hint?: string
}

/**
 * 動画・画像アップロード用の共通ドロップゾーン
 */
function UploadCard({ file, onFileChange, hint }: UploadCardProps) {
  const [preview, setPreview] = useState<string | null>(null)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return
      const selected = acceptedFiles[0]
      onFileChange(selected)

      if (selected.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = () => setPreview(reader.result as string)
        reader.readAsDataURL(selected)
      } else if (selected.type.startsWith('video/')) {
        setPreview(URL.createObjectURL(selected))
      }
    },
    [onFileChange]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.bmp', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm']
    },
    maxFiles: 1
  })

  const removeFile = () => {
    onFileChange(null)
    setPreview(null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (!file) {
    return (
      <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'drag-active' : ''}`}>
        <input {...getInputProps()} />
        <div className="upload-icon">🎥</div>
        <p className="upload-text">
          {isDragActive ? 'ここにドロップしてください' : 'クリックまたはドラッグ&ドロップでファイルを選択'}
        </p>
        <p className="upload-hint">{hint ?? '対応形式: MP4, MOV, AVI, JPG, PNG など'}</p>
      </div>
    )
  }

  return (
    <div className="file-preview">
      {preview &&
        (file.type.startsWith('image/') ? (
          <img src={preview} alt="プレビュー" />
        ) : (
          <video src={preview} controls />
        ))}
      <div className="file-info">
        <div className="file-name">{file.name}</div>
        <div className="file-size">{formatFileSize(file.size)}</div>
      </div>
      <button className="remove-file" onClick={removeFile} aria-label="ファイルを削除">×</button>
    </div>
  )
}

export default UploadCard
